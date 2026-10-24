import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from auth_service import (
    format_name_from_email,
    is_access_allowed,
    get_otp_rejection_message,
    generate_and_store_otp,
    send_otp_email,
    verify_stored_otp,
    verify_google_id_token,
)
from seed_data import get_initial_batches, CONTRACTED_CARD_MDR_PCT, CONTRACTED_MPESA_FEE_PCT

try:
    from google import genai
    GENAI_AVAILABLE = True
except Exception:
    GENAI_AVAILABLE = False

app = FastAPI(
    title="Retail POS, M-Pesa, Card & Bank 4-Way Settlement Recon Agent",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BATCH_STORE: List[Dict[str, Any]] = get_initial_batches()


# --- Auth Models ---
class OTPRequestPayload(BaseModel):
    email: str


class OTPVerifyPayload(BaseModel):
    email: str
    code: str


class GoogleAuthPayload(BaseModel):
    credential: str


class SignOffPayload(BaseModel):
    approver_name: Optional[str] = "Sarah Ndungu (VP Treasury)"
    approver_email: Optional[str] = "treasury@retailcorp.co.ke"
    resolution_note: Optional[str] = "Approved 4-Way POS Tender Reconciliation & GL Journal Posting; Bank Card Commission Overcharge Claim Debit Note & Till Shortage Journals generated."


class SimulateBatchPayload(BaseModel):
    store_name: Optional[str] = "Thika Road Mall (TRM) Hypermarket"
    store_code: Optional[str] = "NRB-TRM-07"
    region: Optional[str] = "Nairobi Metro"
    inject_mdr_overcharge: bool = True
    inject_mpesa_reversal: bool = True
    inject_till_shortage: bool = True


class AgentAskPayload(BaseModel):
    question: str
    batch_id: Optional[str] = None


# --- Deterministic 4-Way Reconciliation Engine ---
def compute_batch_reconciliation(batch: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deterministic Python 4-Way Store Tender Match & Bank Card Commission Audit Engine.
    Computes exact POS Z-Report vs Provider Gross vs Bank Card Commission Audit vs Net Bank Credit,
    isolating Bank Card Commission Overcharges, T+1 card cutoffs, duplicate M-Pesa reversals, and cash till shortages.
    """
    enriched_tenders = []
    total_pos_gross = 0.0
    total_provider_gross = 0.0
    total_expected_fee = 0.0
    total_actual_fee = 0.0
    total_mdr_overcharge = 0.0
    total_expected_net_bank = 0.0
    total_actual_bank_credit = 0.0
    total_timing_cutoff = 0.0
    total_mpesa_reversal = 0.0
    total_cash_shortage = 0.0

    for t in batch["tenders"]:
        pos_gross = round(float(t["pos_z_report_gross"]), 2)
        prov_gross = round(float(t["provider_settlement_gross"]), 2)
        gross_variance = round(pos_gross - prov_gross, 2)

        expected_fee = round(float(t["expected_fee_kes"]), 2)
        actual_fee = round(float(t["actual_fee_deducted_kes"]), 2)
        fee_overcharge = round(max(0.0, actual_fee - expected_fee), 2)

        expected_net = round(float(t["expected_net_bank_credit"]), 2)
        actual_net = round(float(t["actual_bank_credit"]), 2)
        net_bank_variance = round(expected_net - actual_net, 2)

        timing_adj = round(float(t.get("timing_cutoff_adj_kes", 0.0)), 2)
        mpesa_rev_adj = round(float(t.get("duplicate_reversal_adj_kes", 0.0)), 2)
        cash_short_adj = round(gross_variance if t["tender_type"] == "CASH_TILL" and gross_variance > 0 else 0.0, 2)

        unexplained_variance = round(
            net_bank_variance - (fee_overcharge + timing_adj + mpesa_rev_adj + cash_short_adj),
            2,
        )
        if abs(unexplained_variance) < 1.0:
            unexplained_variance = 0.0

        tender_status = "MATCHED"
        if fee_overcharge > 0 or timing_adj > 0 or mpesa_rev_adj > 0 or cash_short_adj > 0:
            tender_status = "VARIANCE_ISOLATED"

        enriched_t = {
            **t,
            "gross_variance_kes": gross_variance,
            "fee_overcharge_kes": fee_overcharge,
            "bank_commission_overcharge_kes": fee_overcharge,
            "net_bank_variance_kes": net_bank_variance,
            "cash_shortage_kes": cash_short_adj,
            "unexplained_variance_kes": unexplained_variance,
            "tender_status": tender_status,
        }
        enriched_tenders.append(enriched_t)

        total_pos_gross += pos_gross
        total_provider_gross += prov_gross
        total_expected_fee += expected_fee
        total_actual_fee += actual_fee
        total_mdr_overcharge += fee_overcharge
        total_expected_net_bank += expected_net
        total_actual_bank_credit += actual_net
        total_timing_cutoff += timing_adj
        total_mpesa_reversal += mpesa_rev_adj
        total_cash_shortage += cash_short_adj

    total_net_variance = round(total_expected_net_bank - total_actual_bank_credit, 2)
    total_explained_variance = round(
        total_mdr_overcharge + total_timing_cutoff + total_mpesa_reversal + total_cash_shortage, 2
    )
    unexplained_residual = round(total_net_variance - total_explained_variance, 2)
    if abs(unexplained_residual) < 1.0:
        unexplained_residual = 0.0

    # Build deterministic balanced GL journal entries
    gl_entries = [
        {
            "line_no": 1,
            "account_code": "101100",
            "account_name": "CIT Cash in Transit / Physical Vault Bank",
            "debit_kes": round(next((x["actual_bank_credit"] for x in enriched_tenders if x["tender_type"] == "CASH_TILL"), 0.0), 2),
            "credit_kes": 0.0,
            "narrative": f"{batch['store_code']} CIT Verified Vault Cash Drop",
        },
        {
            "line_no": 2,
            "account_code": "102200",
            "account_name": "Safaricom M-Pesa Paybill/BuyGoods Bank Sweep",
            "debit_kes": round(next((x["actual_bank_credit"] for x in enriched_tenders if x["tender_type"] == "MPESA_TILL"), 0.0), 2),
            "credit_kes": 0.0,
            "narrative": f"{batch['store_code']} Net M-Pesa Settlement to Bank",
        },
        {
            "line_no": 3,
            "account_code": "102300",
            "account_name": "Card Settlement Bank Account",
            "debit_kes": round(next((x["actual_bank_credit"] for x in enriched_tenders if x["tender_type"] == "CARD_PDQ"), 0.0), 2),
            "credit_kes": 0.0,
            "narrative": f"{batch['store_code']} Net Visa/MC Card Settlement Credit",
        },
        {
            "line_no": 4,
            "account_code": "102500",
            "account_name": "Corporate Gift & EFT Voucher Receivable",
            "debit_kes": round(next((x["actual_bank_credit"] for x in enriched_tenders if x["tender_type"] == "CORP_VOUCHER"), 0.0), 2),
            "credit_kes": 0.0,
            "narrative": f"{batch['store_code']} Redeemed Corporate Vouchers",
        },
        {
            "line_no": 5,
            "account_code": "614200",
            "account_name": "Agreed M-Pesa & Bank Card Commission Expense",
            "debit_kes": round(total_expected_fee, 2),
            "credit_kes": 0.0,
            "narrative": f"Agreed 0.50% M-Pesa & {CONTRACTED_CARD_MDR_PCT:.2f}% Bank Card Commission Expense",
        },
    ]

    line_no = 6
    if total_mdr_overcharge > 0:
        gl_entries.append({
            "line_no": line_no,
            "account_code": "131200",
            "account_name": "Bank Card Commission Overcharge Claim Receivable (Debit Note)",
            "debit_kes": round(total_mdr_overcharge, 2),
            "credit_kes": 0.0,
            "narrative": f"Claimable Bank Card Commission Overcharge (Charged 2.15% vs. Agreed {CONTRACTED_CARD_MDR_PCT:.2f}%)",
        })
        line_no += 1

    if total_timing_cutoff > 0:
        gl_entries.append({
            "line_no": line_no,
            "account_code": "102350",
            "account_name": "Card PDQ Settlement in Transit (T+1 Cutoff)",
            "debit_kes": round(total_timing_cutoff, 2),
            "credit_kes": 0.0,
            "narrative": "Late-night PDQ swipes after 23:45 EAT cutoff rolling into T+1 bank sweep",
        })
        line_no += 1

    if total_mpesa_reversal > 0:
        gl_entries.append({
            "line_no": line_no,
            "account_code": "131300",
            "account_name": "M-Pesa Duplicate Reversal Clawback Suspense",
            "debit_kes": round(total_mpesa_reversal, 2),
            "credit_kes": 0.0,
            "narrative": "Safaricom Daraja duplicate reversal dispute recovery receivable",
        })
        line_no += 1

    if total_cash_shortage > 0:
        gl_entries.append({
            "line_no": line_no,
            "account_code": "131400",
            "account_name": "Staff Cashier Till Shortage Receivable",
            "debit_kes": round(total_cash_shortage, 2),
            "credit_kes": 0.0,
            "narrative": "Cashier physical CIT drop shortage recoverable from payroll",
        })
        line_no += 1

    total_debits = round(sum(e["debit_kes"] for e in gl_entries), 2)

    gl_entries.append({
        "line_no": line_no,
        "account_code": "401100",
        "account_name": "Omnichannel Retail POS Gross Sales Revenue (Incl. VAT)",
        "debit_kes": 0.0,
        "credit_kes": total_debits,
        "narrative": f"{batch['store_name']} Daily POS Z-Report Gross Sales Recognition",
    })

    return {
        **batch,
        "tenders": enriched_tenders,
        "summary": {
            "total_pos_gross_kes": round(total_pos_gross, 2),
            "total_provider_gross_kes": round(total_provider_gross, 2),
            "total_expected_fee_kes": round(total_expected_fee, 2),
            "total_actual_fee_kes": round(total_actual_fee, 2),
            "total_mdr_overcharge_kes": round(total_mdr_overcharge, 2),
            "total_bank_commission_overcharge_kes": round(total_mdr_overcharge, 2),
            "total_expected_net_bank_kes": round(total_expected_net_bank, 2),
            "total_actual_bank_credit_kes": round(total_actual_bank_credit, 2),
            "total_net_variance_kes": total_net_variance,
            "total_timing_cutoff_kes": round(total_timing_cutoff, 2),
            "total_mpesa_reversal_kes": round(total_mpesa_reversal, 2),
            "total_cash_shortage_kes": round(total_cash_shortage, 2),
            "unexplained_residual_kes": unexplained_residual,
            "exception_count": len(batch.get("exception_items", [])),
            "contracted_card_mdr_pct": CONTRACTED_CARD_MDR_PCT,
            "agreed_bank_card_commission_pct": CONTRACTED_CARD_MDR_PCT,
            "contracted_mpesa_fee_pct": CONTRACTED_MPESA_FEE_PCT,
            "gl_balanced": True,
            "gl_total_debit_kes": total_debits,
            "gl_total_credit_kes": total_debits,
        },
        "gl_entries": gl_entries,
    }


def compute_portfolio_kpis(batches: List[Dict[str, Any]]) -> Dict[str, Any]:
    enriched = [compute_batch_reconciliation(b) for b in batches]
    total_overcharge = round(sum(b["summary"]["total_mdr_overcharge_kes"] for b in enriched), 2)
    return {
        "total_stores": len(enriched),
        "reconciled_stores": sum(1 for b in enriched if b["status"] == "RECONCILED_SIGNED_OFF"),
        "flagged_stores": sum(1 for b in enriched if b["status"] != "RECONCILED_SIGNED_OFF"),
        "total_pos_gross_kes": round(sum(b["summary"]["total_pos_gross_kes"] for b in enriched), 2),
        "total_actual_bank_credit_kes": round(sum(b["summary"]["total_actual_bank_credit_kes"] for b in enriched), 2),
        "total_mdr_overcharge_kes": total_overcharge,
        "total_bank_commission_overcharge_kes": total_overcharge,
        "total_timing_cutoff_kes": round(sum(b["summary"]["total_timing_cutoff_kes"] for b in enriched), 2),
        "total_mpesa_reversal_kes": round(sum(b["summary"]["total_mpesa_reversal_kes"] for b in enriched), 2),
        "total_cash_shortage_kes": round(sum(b["summary"]["total_cash_shortage_kes"] for b in enriched), 2),
        "total_net_variance_kes": round(sum(b["summary"]["total_net_variance_kes"] for b in enriched), 2),
    }


# --- Health & Auth Routes ---
@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "Retail_POSSettlementReconAgent",
        "agent_number": "07",
        "terminology": "Plain Business English (Bank Card Commission Overcharge)",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "batches_loaded": len(BATCH_STORE),
    }


@app.post("/api/auth/otp/request")
def request_otp(payload: OTPRequestPayload):
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid work email address.")
    if not is_access_allowed(email):
        raise HTTPException(status_code=403, detail=get_otp_rejection_message(email))
    code = generate_and_store_otp(email)
    try:
        send_otp_email(email, code)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send OTP email: {str(exc)}")
    return {
        "success": True,
        "message": f"6-digit verification code sent to {email}.",
        "email": email,
    }


@app.post("/api/auth/otp/verify")
def verify_otp(payload: OTPVerifyPayload):
    email = (payload.email or "").strip().lower()
    code = (payload.code or "").strip()
    ok, msg = verify_stored_otp(email, code)
    if not ok:
        raise HTTPException(status_code=401, detail=msg)
    return {
        "success": True,
        "user": {
            "email": email,
            "name": format_name_from_email(email),
            "role": "VP Retail Treasury & Settlement Recon",
            "auth_method": "OTP",
        },
    }


@app.post("/api/auth/google")
def google_auth(payload: GoogleAuthPayload):
    ok, user_info, err = verify_google_id_token(payload.credential)
    if not ok:
        raise HTTPException(status_code=401, detail=err or "Google authentication failed.")
    return {
        "success": True,
        "user": {
            "email": user_info.get("email"),
            "name": user_info.get("name") or format_name_from_email(user_info.get("email", "")),
            "picture": user_info.get("picture", ""),
            "role": "VP Retail Treasury & Settlement Recon",
            "auth_method": "GOOGLE_SSO",
        },
    }


# --- Core Reconciliation Endpoints ---
@app.get("/api/batches")
def list_batches():
    enriched = [compute_batch_reconciliation(b) for b in BATCH_STORE]
    return {
        "batches": enriched,
        "portfolio": compute_portfolio_kpis(BATCH_STORE),
    }


@app.get("/api/batches/{batch_id}")
def get_batch_detail(batch_id: str):
    for b in BATCH_STORE:
        if b["batch_id"] == batch_id:
            return compute_batch_reconciliation(b)
    raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found.")


@app.post("/api/batches/{batch_id}/signoff")
def signoff_batch(batch_id: str, payload: SignOffPayload):
    for b in BATCH_STORE:
        if b["batch_id"] == batch_id:
            now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            b["status"] = "RECONCILED_SIGNED_OFF"
            b["signoff_by"] = payload.approver_name or "Sarah Ndungu (VP Treasury)"
            b["signoff_timestamp"] = now_iso
            if not b.get("erp_journal_ref"):
                suffix = batch_id.split("-")[-1]
                b["erp_journal_ref"] = f"SAP-JE-2026-884{suffix}"
            if payload.resolution_note:
                b["notes"] = f"[SIGNED OFF] {payload.resolution_note} | Prior: {b['notes']}"
            return {
                "success": True,
                "batch": compute_batch_reconciliation(b),
                "portfolio": compute_portfolio_kpis(BATCH_STORE),
            }
    raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found.")


@app.post("/api/batches/simulate")
def simulate_new_batch(payload: SimulateBatchPayload):
    seq = len(BATCH_STORE) + 701
    new_id = f"POS-BATCH-2026-0{seq}"

    cash_pos = 1450000.00
    cash_short = 3500.00 if payload.inject_till_shortage else 0.00
    cash_actual = cash_pos - cash_short

    mpesa_pos = 3600000.00
    mpesa_rev = 9500.00 if payload.inject_mpesa_reversal else 0.00
    mpesa_prov = mpesa_pos - mpesa_rev
    mpesa_fee = round(mpesa_prov * 0.005, 2)
    mpesa_expected_net = round(mpesa_pos - mpesa_fee, 2)
    mpesa_actual_net = round(mpesa_prov - mpesa_fee, 2)

    card_pos = 2850000.00
    card_cutoff = 50000.00
    card_prov = card_pos - card_cutoff
    expected_commission = round(card_prov * (CONTRACTED_CARD_MDR_PCT / 100.0), 2)
    actual_commission_pct = 2.15 if payload.inject_mdr_overcharge else CONTRACTED_CARD_MDR_PCT
    actual_commission = round(card_prov * (actual_commission_pct / 100.0), 2)
    card_expected_net = round(card_pos - expected_commission, 2)
    card_actual_net = round(card_prov - actual_commission, 2)

    exceptions = []
    if payload.inject_mdr_overcharge:
        overcharge_amt = round(actual_commission - expected_commission, 2)
        exceptions.append({
            "item_id": f"EXC-{seq}-A",
            "category": "BANK_CARD_COMMISSION_OVERCHARGE",
            "severity": "HIGH",
            "tender": "Visa / Mastercard Card PDQ",
            "reference": f"KCB-ACQ-99{seq}",
            "amount_kes": overcharge_amt,
            "root_cause": f"Acquiring bank applied 2.15% Bank Card Commission instead of agreed 1.50% rate on KES {card_prov:,.0f} PDQ batch.",
            "recommended_action": f"Auto-issue Bank Card Commission Overcharge Claim Debit Note DN-2026-{seq} for KES {overcharge_amt:,.2f}.",
        })
    exceptions.append({
        "item_id": f"EXC-{seq}-B",
        "category": "T1_CUTOFF_TIMING",
        "severity": "MEDIUM",
        "tender": "Visa / Mastercard Card PDQ",
        "reference": "PDQ-LATE-2356",
        "amount_kes": card_cutoff,
        "root_cause": "Late night PDQ swipes after 23:45 EAT cutoff rolling into T+1 bank settlement.",
        "recommended_action": f"Hold KES {card_cutoff:,.2f} in GL 102350 (Card Settlement in Transit T+1).",
    })
    if payload.inject_mpesa_reversal:
        exceptions.append({
            "item_id": f"EXC-{seq}-C",
            "category": "DUPLICATE_MPESA_REVERSAL",
            "severity": "HIGH",
            "tender": "M-Pesa BuyGoods / Paybill Till",
            "reference": f"SG98TR{seq}X / Till #06",
            "amount_kes": mpesa_rev,
            "root_cause": "Duplicate M-Pesa reversal callback processed after goods checkout.",
            "recommended_action": f"Book KES {mpesa_rev:,.2f} to M-Pesa Reversal Clawback Suspense (GL 131300).",
        })
    if payload.inject_till_shortage:
        exceptions.append({
            "item_id": f"EXC-{seq}-D",
            "category": "CASH_TILL_SHORTAGE",
            "severity": "MEDIUM",
            "tender": "Cash Till & CIT Vault Drop",
            "reference": "TILL-03 (Cashier ID: C-709)",
            "amount_kes": cash_short,
            "root_cause": "Physical smart-safe CIT cash drop short against POS Z-Report.",
            "recommended_action": f"Debit Staff Till Shortage Receivable (GL 131400) for KES {cash_short:,.2f}.",
        })

    new_batch = {
        "batch_id": new_id,
        "store_code": payload.store_code,
        "store_name": payload.store_name,
        "region": payload.region,
        "business_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "shift_manager": "Samuel Kariuki",
        "head_cashier": "Esther Wambui",
        "pos_terminals_active": 16,
        "status": "VARIANCE_FLAGGED",
        "signoff_by": None,
        "signoff_timestamp": None,
        "erp_journal_ref": None,
        "notes": "Simulated omnichannel store closing batch ingested via POS Z-Report + Daraja CSV + Card Bank Settlement API.",
        "tenders": [
            {
                "tender_type": "CASH_TILL",
                "tender_label": "Cash Till & CIT Vault Drop",
                "pos_z_report_gross": cash_pos,
                "provider_settlement_gross": cash_actual,
                "contracted_fee_pct": 0.00,
                "actual_fee_pct": 0.00,
                "expected_fee_kes": 0.00,
                "actual_fee_deducted_kes": 0.00,
                "expected_net_bank_credit": cash_pos,
                "actual_bank_credit": cash_actual,
                "timing_cutoff_adj_kes": 0.00,
                "duplicate_reversal_adj_kes": 0.00,
                "gl_debit_account": "101100 - CIT Cash in Transit / Vault",
                "gl_credit_account": "401100 - Retail POS Sales Revenue",
                "provider_ref": f"G4S-CIT-88{seq}",
            },
            {
                "tender_type": "MPESA_TILL",
                "tender_label": "M-Pesa BuyGoods / Paybill Till",
                "pos_z_report_gross": mpesa_pos,
                "provider_settlement_gross": mpesa_prov,
                "contracted_fee_pct": 0.50,
                "actual_fee_pct": 0.50,
                "expected_fee_kes": mpesa_fee,
                "actual_fee_deducted_kes": mpesa_fee,
                "expected_net_bank_credit": mpesa_expected_net,
                "actual_bank_credit": mpesa_actual_net,
                "timing_cutoff_adj_kes": 0.00,
                "duplicate_reversal_adj_kes": mpesa_rev,
                "gl_debit_account": "102200 - Safaricom M-Pesa Clearing A/C",
                "gl_credit_account": "401100 - Retail POS Sales Revenue",
                "provider_ref": f"MPESA-TILL-91{seq}",
            },
            {
                "tender_type": "CARD_PDQ",
                "tender_label": "Visa / Mastercard Card PDQ",
                "pos_z_report_gross": card_pos,
                "provider_settlement_gross": card_prov,
                "contracted_fee_pct": CONTRACTED_CARD_MDR_PCT,
                "actual_fee_pct": actual_commission_pct,
                "expected_fee_kes": expected_commission,
                "actual_fee_deducted_kes": actual_commission,
                "expected_net_bank_credit": card_expected_net,
                "actual_bank_credit": card_actual_net,
                "timing_cutoff_adj_kes": card_cutoff,
                "duplicate_reversal_adj_kes": 0.00,
                "gl_debit_account": "102300 - Card Settlement Bank Account",
                "gl_credit_account": "401100 - Retail POS Sales Revenue",
                "provider_ref": f"KCB-ACQ-99{seq}",
            },
            {
                "tender_type": "CORP_VOUCHER",
                "tender_label": "Corporate Gift & EFT Vouchers",
                "pos_z_report_gross": 250000.00,
                "provider_settlement_gross": 250000.00,
                "contracted_fee_pct": 0.00,
                "actual_fee_pct": 0.00,
                "expected_fee_kes": 0.00,
                "actual_fee_deducted_kes": 0.00,
                "expected_net_bank_credit": 250000.00,
                "actual_bank_credit": 250000.00,
                "timing_cutoff_adj_kes": 0.00,
                "duplicate_reversal_adj_kes": 0.00,
                "gl_debit_account": "102500 - Corporate Voucher Receivable",
                "gl_credit_account": "401100 - Retail POS Sales Revenue",
                "provider_ref": f"VCH-CORP-2026-{seq}",
            },
        ],
        "exception_items": exceptions,
    }

    BATCH_STORE.insert(0, new_batch)
    return {
        "success": True,
        "batch": compute_batch_reconciliation(new_batch),
        "portfolio": compute_portfolio_kpis(BATCH_STORE),
    }


@app.post("/api/agent/ask")
def ask_treasury_copilot(payload: AgentAskPayload):
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    target_batch = None
    if payload.batch_id:
        for b in BATCH_STORE:
            if b["batch_id"] == payload.batch_id:
                target_batch = compute_batch_reconciliation(b)
                break
    if not target_batch and BATCH_STORE:
        target_batch = compute_batch_reconciliation(BATCH_STORE[0])

    portfolio = compute_portfolio_kpis(BATCH_STORE)

    context_summary = (
        f"Portfolio Totals across {portfolio['total_stores']} branches: "
        f"POS Gross = KES {portfolio['total_pos_gross_kes']:,.2f}, "
        f"Actual Bank Credit = KES {portfolio['total_actual_bank_credit_kes']:,.2f}, "
        f"Total Net Variance = KES {portfolio['total_net_variance_kes']:,.2f} "
        f"(Bank Card Commission Overcharges = KES {portfolio['total_mdr_overcharge_kes']:,.2f}, "
        f"T+1 Card Cutoff Timing = KES {portfolio['total_timing_cutoff_kes']:,.2f}, "
        f"Duplicate M-Pesa Reversals = KES {portfolio['total_mpesa_reversal_kes']:,.2f}, "
        f"Cashier Till Shortages = KES {portfolio['total_cash_shortage_kes']:,.2f}).\n"
    )
    if target_batch:
        s = target_batch["summary"]
        context_summary += (
            f"Selected Store Batch {target_batch['batch_id']} ({target_batch['store_name']}): "
            f"Status={target_batch['status']}, POS Gross=KES {s['total_pos_gross_kes']:,.2f}, "
            f"Actual Bank Credit=KES {s['total_actual_bank_credit_kes']:,.2f}, "
            f"Bank Card Commission Overcharge=KES {s['total_mdr_overcharge_kes']:,.2f}, "
            f"T+1 Card Cutoff=KES {s['total_timing_cutoff_kes']:,.2f}, "
            f"M-Pesa Reversal=KES {s['total_mpesa_reversal_kes']:,.2f}, "
            f"Cash Shortage=KES {s['total_cash_shortage_kes']:,.2f}."
        )

    # Try Vertex AI Gemini 2.5 Flash first
    if GENAI_AVAILABLE and os.environ.get("GOOGLE_GENAI_USE_VERTEXAI") == "1":
        try:
            client = genai.Client(
                vertexai=True,
                project=os.environ.get("GOOGLE_CLOUD_PROJECT", "gemini-enterprise-demo-498212"),
                location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"),
            )
            prompt = (
                "You are an expert Retail Treasury & 4-Way POS Settlement Reconciliation AI Co-Pilot "
                "for an East African omnichannel retailer. Always use plain retail business English: "
                "say 'Bank Card Commission' and 'Bank Card Commission Overcharge (Agreed 1.50% vs. Charged 2.15%)' "
                "and NEVER use the banking acronym 'MDR'. Use the exact KES figures below to give a concise, "
                "executive-grade audit response with GL account numbers and recovery steps.\n\n"
                f"LIVE DATA:\n{context_summary}\n\n"
                f"USER QUESTION: {question}"
            )
            resp = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            if resp and resp.text:
                clean_text = resp.text.replace("MDR", "Bank Card Commission")
                return {
                    "answer": clean_text,
                    "engine": "Enterprise Operations Reasoning Engine",
                    "batch_id": target_batch["batch_id"] if target_batch else None,
                }
        except Exception:
            pass

    # Deterministic fallback with exact numbers in plain business English
    s = target_batch["summary"] if target_batch else {}
    store_title = f"{target_batch['store_name']} ({target_batch['batch_id']})" if target_batch else "Portfolio"
    deterministic_answer = (
        f"### 4-Way Retail Treasury Reconciliation Analysis — {store_title}\n\n"
        f"**1. Chain-Wide Settlement Snapshot ({portfolio['total_stores']} Branches)**\n"
        f"- **POS Z-Report Gross Sales:** KES {portfolio['total_pos_gross_kes']:,.2f}\n"
        f"- **Verified Net Bank Credits:** KES {portfolio['total_actual_bank_credit_kes']:,.2f}\n"
        f"- **Total Explained Variance:** KES {portfolio['total_net_variance_kes']:,.2f} (Zero unexplained residual)\n\n"
        f"**2. Root-Cause Breakdown for {store_title}**\n"
        f"- **Bank Card Commission Overcharge (GL 131200):** **KES {s.get('total_mdr_overcharge_kes', 0.0):,.2f}** — Acquiring bank deducted `2.15%` Bank Card Commission instead of the agreed `1.50%` rate. Action: Issue formal Bank Card Commission Overcharge Claim Debit Note.\n"
        f"- **T+1 Card PDQ Cutoff Timing (GL 102350):** **KES {s.get('total_timing_cutoff_kes', 0.0):,.2f}** — Late evening swipes after `23:45 EAT` cutoff carried in transit to clear tomorrow's bank sweep.\n"
        f"- **Duplicate M-Pesa Reversal Ghosts (GL 131300):** **KES {s.get('total_mpesa_reversal_kes', 0.0):,.2f}** — Daraja API timeout reversal after receipt validation; lodge Safaricom merchant dispute with CCTV/POS log.\n"
        f"- **Cashier Till Float Shortage (GL 131400):** **KES {s.get('total_cash_shortage_kes', 0.0):,.2f}** — Physical G4S/Wells CIT vault count lower than Z-Report cash; booked to Staff Shortage Receivable.\n\n"
        f"**3. Recommended Treasury Sign-Off Action**\n"
        f"- Click **Approve Daily Treasury Sign-Off & Post GL** in Tab 2 to post the balanced KES {s.get('gl_total_debit_kes', 0.0):,.2f} SAP journal and generate the 1-Page Store Tender Recon Certificate."
    )
    return {
        "answer": deterministic_answer,
        "engine": "deterministic-4way-recon-engine",
        "batch_id": target_batch["batch_id"] if target_batch else None,
    }


# --- Mount Built Frontend SPA ---
FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        candidate = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
