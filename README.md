# Agent #07: Retail POS, M-Pesa, Card & Bank 4-Way Settlement Recon Agent

**Enterprise Retail Omnichannel Treasury & Daily Branch Settlement Reconciliation Workbench**

## Overview
Retailers operating multi-branch supermarkets, hypermarkets, and department stores across East Africa process thousands of daily checkouts across **4 distinct tender streams**:
1. **Cash Till & CIT Physical Vault Drops** (G4S / Wells Fargo smart-safe bags)
2. **Safaricom M-Pesa BuyGoods / Paybill Till CSVs** (Daraja C2B API settlement)
3. **Visa / Mastercard Acquirer PDQ Batches** (KCB, Equity, Absa, Co-op PDQ settlement)
4. **Corporate Gift & EFT Vouchers**

`Retail_POSSettlementReconAgent` (`#07`) automates the **4-Way Tender Reconciliation & Fee Audit** between the Store POS Z-Report, Payment Provider Settlement Statement, Contracted Fee Schedule (`1.50%` Card MDR & `0.50%` M-Pesa Till tariff), and Actual Net Bank Credit.

## Key Capabilities
- **Acquirer MDR Fee Overcharge Audit**: Detects when an acquirer bank deducts a `2.15%` standard merchant discount rate instead of the contracted `1.50%` volume tier, automatically computing the exact KES Debit Note claim.
- **T+1 Card Batch Cutoff Timing Isolation**: Separates late-night PDQ swipes after `23:45 EAT` that appear on the POS Z-Report but roll into the next day's bank sweep (`GL 102350`).
- **Duplicate M-Pesa Reversal Ghost Detection**: Flags Safaricom Daraja C2B reversals triggered after goods release so Treasury can file immediate clawback disputes (`GL 131300`).
- **Cashier Till Float Shortage Pinpointing**: Compares physical CIT vault drop counts against POS Z-Report cash totals and books shortages to Staff Till Shortage Receivable (`GL 131400`).
- **One-Click Daily Treasury Sign-Off & SAP GL Posting**: Generates a 100% balanced General Ledger journal and a print-ready **1-Page Store Tender Reconciliation & GL Posting Certificate**.

## Architecture
- **Backend**: Python FastAPI (`backend/main.py`, `backend/seed_data.py`, `backend/auth_service.py`) + Vertex AI `gemini-2.5-flash` Co-Pilot with deterministic fallback.
- **Frontend**: React 18 + Vite + Tailwind CSS + Lucide Icons (`frontend/src/App.jsx`, `frontend/src/components/SignInPage.jsx`).
