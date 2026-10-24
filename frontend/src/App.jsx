import React, { useState, useEffect } from 'react';
import SignInPage from './components/SignInPage';
import ThemeSwitcher from './components/ThemeSwitcher';
import {
  Landmark,
  Store,
  ShieldCheck,
  Bot,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Printer,
  PlusCircle,
  LogOut,
  ArrowRight,
  CreditCard,
  Smartphone,
  Banknote,
  Receipt,
  Sparkles,
  Send,
  RefreshCw,
  Clock,
  FileCheck2
} from 'lucide-react';

const formatKES = (val) => {
  const num = Number(val || 0);
  return `KES ${num.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_recon_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState('QUEUE'); // QUEUE | WORKBENCH | COPILOT | SUMMARY
  const [batches, setBatches] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [selectedBatchId, setSelectedBatchId] = useState('POS-BATCH-2026-0701');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [bannerMsg, setBannerMsg] = useState('');

  // AI Co-Pilot state
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState([
    {
      role: 'assistant',
      engine: 'deterministic-4way-recon-engine',
      text: 'Welcome to the Retail Omnichannel Treasury AI Co-Pilot. Ask me about Bank Card Commission Overcharges (Charged 2.15% vs. Agreed 1.50%), T+1 PDQ cutoff timing adjustments, duplicate M-Pesa reversals, or cashier till float shortages across any store batch.',
    },
  ]);
  const [asking, setAsking] = useState(false);

  const handleLoginSuccess = (loggedUser) => {
    setUser(loggedUser);
    try {
      localStorage.setItem('pos_recon_user', JSON.stringify(loggedUser));
    } catch {}
  };

  const handleLogout = () => {
    setUser(null);
    try {
      localStorage.removeItem('pos_recon_user');
    } catch {}
  };

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/batches');
      const data = await res.json();
      if (data.batches) {
        setBatches(data.batches);
        setPortfolio(data.portfolio);
        if (!selectedBatchId && data.batches.length > 0) {
          setSelectedBatchId(data.batches[0].batch_id);
        }
      }
    } catch (err) {
      console.error('Failed to load POS settlement batches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchBatches();
    }
  }, [user]);

  const selectedBatch =
    batches.find((b) => b.batch_id === selectedBatchId) || batches[0] || null;

  const handleApproveSignOff = async (batchId) => {
    setActionLoading(true);
    setBannerMsg('');
    try {
      const res = await fetch(`/api/batches/${batchId}/signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approver_name: user?.name || 'Sarah Ndungu (VP Treasury)',
          approver_email: user?.email || 'treasury@retailcorp.co.ke',
          resolution_note:
            'Approved 4-Way POS Tender Reconciliation & GL Journal Posting; Bank Card Commission Overcharge Claim Debit Note & Till Shortage Journals generated.',
        }),
      });
      const data = await res.json();
      if (res.ok && data.batch) {
        setBatches((prev) =>
          prev.map((b) => (b.batch_id === batchId ? data.batch : b))
        );
        if (data.portfolio) setPortfolio(data.portfolio);
        setBannerMsg(
          `Batch ${batchId} (${data.batch.store_name}) signed off and posted to SAP General Ledger (${data.batch.erp_journal_ref}).`
        );
      }
    } catch (err) {
      console.error('Sign-off error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSimulateBatch = async () => {
    setActionLoading(true);
    setBannerMsg('');
    try {
      const res = await fetch('/api/batches/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_name: 'Thika Road Mall (TRM) Hypermarket',
          store_code: 'NRB-TRM-07',
          region: 'Nairobi Metro',
          inject_mdr_overcharge: true,
          inject_mpesa_reversal: true,
          inject_till_shortage: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.batch) {
        await fetchBatches();
        setSelectedBatchId(data.batch.batch_id);
        setActiveTab('WORKBENCH');
        setBannerMsg(
          `Simulated new store closing batch ${data.batch.batch_id} (${data.batch.store_name}) with 4-way store tender match & bank commission audit completed.`
        );
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAskCopilot = async (customPrompt) => {
    const q = (customPrompt ?? question).trim();
    if (!q) return;
    setQuestion('');
    setChatHistory((prev) => [...prev, { role: 'user', text: q }]);
    setAsking(true);
    try {
      const res = await fetch('/api/agent/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          batch_id: selectedBatch?.batch_id,
        }),
      });
      const data = await res.json();
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          engine: data.engine || 'deterministic-4way-recon-engine',
          text: data.answer || 'Completed analysis.',
        },
      ]);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          engine: 'error-fallback',
          text: 'Unable to reach AI Co-Pilot endpoint right now.',
        },
      ]);
    } finally {
      setAsking(false);
    }
  };

  if (!user) {
    return <SignInPage onSuccess={handleLoginSuccess} />;
  }

  const tabs = [
    {
      id: 'QUEUE',
      label: '1. Daily Branch POS Settlement Queue',
      shortLabel: '1. Daily Branch POS Queue',
      icon: Store,
    },
    {
      id: 'WORKBENCH',
      label: '2. 4-Way Store Tender Match & Bank Commission Audit',
      shortLabel: '2. 4-Way Store Tender Match & Bank Commission Audit',
      icon: ShieldCheck,
    },
    {
      id: 'COPILOT',
      label: '3. Retail Treasury AI Co-Pilot',
      shortLabel: '3. Treasury AI Co-Pilot',
      icon: Bot,
    },
    {
      id: 'SUMMARY',
      label: '4. 1-Page Store Tender Reconciliation & GL Posting Summary',
      shortLabel: '4. 1-Page Store Recon & GL Summary',
      icon: FileSpreadsheet,
    },
  ];

  const getTenderIcon = (type) => {
    switch (type) {
      case 'CASH_TILL':
        return <Banknote className="w-4 h-4 text-emerald-600" />;
      case 'MPESA_TILL':
        return <Smartphone className="w-4 h-4 text-green-600" />;
      case 'CARD_PDQ':
        return <CreditCard className="w-4 h-4 text-blue-600" />;
      default:
        return <Receipt className="w-4 h-4 text-purple-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Executive Navigation Bar (hidden when printing) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <Landmark className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
            <ThemeSwitcher />
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  Agent #07 • Retail Treasury Suite
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Agreed Bank Card Commission: 1.50% | M-Pesa Tariff: 0.50%
                </span>
              </div>
              <h1 className="text-base font-extrabold text-slate-900 mt-0.5">
                Retail POS, M-Pesa, Card &amp; Bank 4-Way Settlement Recon Agent
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSimulateBatch}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Simulate New Store Batch</span>
            </button>

            <button
              onClick={fetchBatches}
              disabled={loading}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
              title="Refresh Batches"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            <div className="flex items-center gap-2.5">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-900">{user.name}</div>
                <div className="text-[11px] text-slate-500">{user.email}</div>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* 4-Tab Navigation Strip */}
        <div className="max-w-7xl mx-auto px-6 flex overflow-x-auto border-t border-slate-100 bg-slate-50/60">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition cursor-pointer ${
                  active
                    ? 'border-slate-900 text-slate-900 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 space-y-6">
        {bannerMsg && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs sm:text-sm text-emerald-900 font-medium print:hidden">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{bannerMsg}</span>
            </div>
            <button
              onClick={() => setBannerMsg('')}
              className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Chain-Wide Portfolio KPI Strip (hidden on print) */}
        {portfolio && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 print:hidden">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Chain POS Z-Report Gross
              </div>
              <div className="text-lg font-extrabold text-slate-900 mt-1">
                {formatKES(portfolio.total_pos_gross_kes)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Across {portfolio.total_stores} Retail Branches
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Verified Net Bank Credit
              </div>
              <div className="text-lg font-extrabold text-emerald-700 mt-1">
                {formatKES(portfolio.total_actual_bank_credit_kes)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {portfolio.reconciled_stores} Signed Off • {portfolio.flagged_stores} Flagged
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-red-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-red-600">
                Bank Card Commission Overcharges
              </div>
              <div className="text-lg font-extrabold text-red-700 mt-1">
                {formatKES(portfolio.total_mdr_overcharge_kes)}
              </div>
              <div className="text-xs text-red-600 mt-0.5">
                Charged 2.15% vs. Agreed 1.50%
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                M-Pesa Reversals + Till Shortages
              </div>
              <div className="text-lg font-extrabold text-amber-800 mt-1">
                {formatKES(
                  portfolio.total_mpesa_reversal_kes + portfolio.total_cash_shortage_kes
                )}
              </div>
              <div className="text-xs text-amber-700 mt-0.5">
                M-Pesa: {formatKES(portfolio.total_mpesa_reversal_kes)} | Cash:{' '}
                {formatKES(portfolio.total_cash_shortage_kes)}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                T+1 Card Cutoff In-Transit
              </div>
              <div className="text-lg font-extrabold text-blue-700 mt-1">
                {formatKES(portfolio.total_timing_cutoff_kes)}
              </div>
              <div className="text-xs text-blue-600 mt-0.5">
                Post-23:45 EAT swipes (GL 102350)
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: DAILY BRANCH POS SETTLEMENT QUEUE */}
        {activeTab === 'QUEUE' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Daily Multi-Branch POS Closing &amp; 4-Way Settlement Queue
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select any retail branch closing batch to inspect 4-way tender reconciliation (Cash CIT, M-Pesa Daraja, Card PDQ, Corporate Vouchers), audit Bank Card Commission Overcharges, and approve GL sign-off.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Cutoff Policy: 23:45 EAT Daily Sweep</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-4">Batch ID &amp; Store</th>
                    <th className="py-3.5 px-4">POS Z-Report Gross</th>
                    <th className="py-3.5 px-4">Actual Bank Credit</th>
                    <th className="py-3.5 px-4">Bank Commission Overcharge</th>
                    <th className="py-3.5 px-4">T+1 Cutoff</th>
                    <th className="py-3.5 px-4">M-Pesa / Cash Var</th>
                    <th className="py-3.5 px-4">Recon Status</th>
                    <th className="py-3.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {batches.map((b) => {
                    const s = b.summary;
                    const isSelected = b.batch_id === selectedBatch?.batch_id;
                    const isSignedOff = b.status === 'RECONCILED_SIGNED_OFF';
                    return (
                      <tr
                        key={b.batch_id}
                        className={`hover:bg-slate-50/90 transition ${
                          isSelected ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <td className="py-4 px-4">
                          <div className="font-bold text-slate-900">{b.store_name}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="font-mono font-semibold text-slate-700">
                              {b.batch_id}
                            </span>
                            <span>•</span>
                            <span>{b.store_code}</span>
                            <span>•</span>
                            <span>{b.pos_terminals_active} Tills</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 font-bold text-slate-900">
                          {formatKES(s.total_pos_gross_kes)}
                        </td>
                        <td className="py-4 px-4 font-bold text-emerald-700">
                          {formatKES(s.total_actual_bank_credit_kes)}
                        </td>
                        <td className="py-4 px-4">
                          {s.total_mdr_overcharge_kes > 0 ? (
                            <span className="font-bold text-red-600">
                              {formatKES(s.total_mdr_overcharge_kes)}
                            </span>
                          ) : (
                            <span className="text-slate-400">KES 0.00</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          {s.total_timing_cutoff_kes > 0 ? (
                            <span className="font-semibold text-blue-700">
                              {formatKES(s.total_timing_cutoff_kes)}
                            </span>
                          ) : (
                            <span className="text-slate-400">KES 0.00</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          {s.total_mpesa_reversal_kes + s.total_cash_shortage_kes > 0 ? (
                            <span className="font-semibold text-amber-700">
                              {formatKES(
                                s.total_mpesa_reversal_kes + s.total_cash_shortage_kes
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400">KES 0.00</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          {isSignedOff ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Signed Off ({b.erp_journal_ref})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              {s.exception_count} Exceptions Isolated
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedBatchId(b.batch_id);
                              setActiveTab('WORKBENCH');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition cursor-pointer"
                          >
                            <span>Inspect 4-Way Recon</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: 4-WAY STORE TENDER MATCH & BANK COMMISSION AUDIT */}
        {activeTab === 'WORKBENCH' && selectedBatch && (
          <div className="space-y-6">
            {/* Batch Header & One-Click Sign-Off Bar */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                    {selectedBatch.batch_id}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    Store Code: {selectedBatch.store_code} • {selectedBatch.region}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    • Business Date: {selectedBatch.business_date}
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 mt-1">
                  {selectedBatch.store_name} — 4-Way Store Tender Match &amp; Bank Commission Audit
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Shift Manager: <strong>{selectedBatch.shift_manager}</strong> • Head Cashier:{' '}
                  <strong>{selectedBatch.head_cashier}</strong> • Active POS Terminals:{' '}
                  <strong>{selectedBatch.pos_terminals_active}</strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedBatch.batch_id}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="text-xs font-bold rounded-xl border border-slate-300 px-3 py-2.5 bg-slate-50 text-slate-800 outline-none"
                >
                  {batches.map((b) => (
                    <option key={b.batch_id} value={b.batch_id}>
                      {b.batch_id} — {b.store_name}
                    </option>
                  ))}
                </select>

                {selectedBatch.status === 'RECONCILED_SIGNED_OFF' ? (
                  <button
                    onClick={() => setActiveTab('SUMMARY')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition cursor-pointer"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    <span>View 1-Page Recon Certificate ({selectedBatch.erp_journal_ref})</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleApproveSignOff(selectedBatch.batch_id)}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>
                      {actionLoading
                        ? 'Posting SAP GL & Signing Off...'
                        : 'Approve Daily Treasury Sign-Off & Post GL'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* 4-Way Tender Reconciliation Matrix Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Deterministic 4-Way Store Tender Match &amp; Bank Card Commission Audit Matrix
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Compares (1) Store POS Z-Report vs (2) Provider Settlement Gross vs (3) Agreed Bank Commission % vs. Actual Commission Deducted % vs (4) Actual Net Bank Credit.
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Unexplained Residual: {formatKES(selectedBatch.summary.unexplained_residual_kes)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 px-4">Tender Stream</th>
                      <th className="py-3.5 px-4">1. POS Z-Report Gross</th>
                      <th className="py-3.5 px-4">2. Provider Gross</th>
                      <th className="py-3.5 px-4">3. Agreed Bank Commission % vs. Actual Commission Deducted %</th>
                      <th className="py-3.5 px-4">Bank Commission Overcharge Claim</th>
                      <th className="py-3.5 px-4">4. Actual Bank Credit</th>
                      <th className="py-3.5 px-4">Isolated Adjustments</th>
                      <th className="py-3.5 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {selectedBatch.tenders.map((t) => {
                      const actualPct =
                        t.actual_fee_pct !== undefined
                          ? Number(t.actual_fee_pct)
                          : Number(t.contracted_fee_pct || 0);
                      return (
                        <tr key={t.tender_type} className="hover:bg-slate-50/70">
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2 font-bold text-slate-900">
                              {getTenderIcon(t.tender_type)}
                              <span>{t.tender_label}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              Ref: {t.provider_ref}
                            </div>
                          </td>
                          <td className="py-4 px-4 font-bold text-slate-900">
                            {formatKES(t.pos_z_report_gross)}
                          </td>
                          <td className="py-4 px-4 font-semibold text-slate-800">
                            {formatKES(t.provider_settlement_gross)}
                          </td>
                          <td className="py-4 px-4">
                            <div className="font-semibold text-slate-800">
                              Agreed ({t.contracted_fee_pct.toFixed(2)}%): {formatKES(t.expected_fee_kes)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Deducted ({actualPct.toFixed(2)}%): {formatKES(t.actual_fee_deducted_kes)}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            {t.fee_overcharge_kes > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 font-bold">
                                +{formatKES(t.fee_overcharge_kes)} (2.15% Charged)
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-semibold">0.00 (Agreed Rate Honored)</span>
                            )}
                          </td>
                          <td className="py-4 px-4 font-bold text-emerald-700">
                            {formatKES(t.actual_bank_credit)}
                          </td>
                          <td className="py-4 px-4 space-y-1">
                            {t.timing_cutoff_adj_kes > 0 && (
                              <div className="text-[11px] font-semibold text-blue-700">
                                T+1 Cutoff: {formatKES(t.timing_cutoff_adj_kes)}
                              </div>
                            )}
                            {t.duplicate_reversal_adj_kes > 0 && (
                              <div className="text-[11px] font-semibold text-amber-700">
                                M-Pesa Reversal: {formatKES(t.duplicate_reversal_adj_kes)}
                              </div>
                            )}
                            {t.cash_shortage_kes > 0 && (
                              <div className="text-[11px] font-semibold text-red-700">
                                Till Shortage: {formatKES(t.cash_shortage_kes)}
                              </div>
                            )}
                            {t.timing_cutoff_adj_kes === 0 &&
                              t.duplicate_reversal_adj_kes === 0 &&
                              t.cash_shortage_kes === 0 && (
                                <span className="text-[11px] text-slate-400">None</span>
                              )}
                          </td>
                          <td className="py-4 px-4">
                            {t.tender_status === 'MATCHED' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                                <CheckCircle2 className="w-3 h-3" /> Matched
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
                                <AlertTriangle className="w-3 h-3" /> Variance Isolated
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900 text-white font-bold text-xs">
                      <td className="py-3.5 px-4">STORE BATCH TOTAL</td>
                      <td className="py-3.5 px-4">
                        {formatKES(selectedBatch.summary.total_pos_gross_kes)}
                      </td>
                      <td className="py-3.5 px-4">
                        {formatKES(selectedBatch.summary.total_provider_gross_kes)}
                      </td>
                      <td className="py-3.5 px-4">
                        Agreed: {formatKES(selectedBatch.summary.total_expected_fee_kes)} | Ded:{' '}
                        {formatKES(selectedBatch.summary.total_actual_fee_kes)}
                      </td>
                      <td className="py-3.5 px-4 text-red-300">
                        {formatKES(selectedBatch.summary.total_mdr_overcharge_kes)}
                      </td>
                      <td className="py-3.5 px-4 text-emerald-300">
                        {formatKES(selectedBatch.summary.total_actual_bank_credit_kes)}
                      </td>
                      <td className="py-3.5 px-4" colSpan={2}>
                        Net Variance Fully Explained:{' '}
                        {formatKES(selectedBatch.summary.total_net_variance_kes)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Two-Column Split: Isolated Exceptions & Automated Balanced GL Journal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 6/12: Root-Cause Exceptions & Recovery Claims */}
              <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Isolated Root-Cause Exceptions &amp; Bank Commission Recovery Claims
                  </h3>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {selectedBatch.exception_items.length} Items
                  </span>
                </div>

                {selectedBatch.exception_items.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                    <div className="text-sm font-bold text-emerald-900">
                      Zero Exceptions — 100% Clean 4-Way Tender Match
                    </div>
                    <p className="text-xs text-emerald-700">
                      All Cash CIT drops, M-Pesa BuyGoods sweeps, Bank Card Commission rates (Agreed 1.50%), and Corporate Vouchers reconciled to the cent.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedBatch.exception_items.map((exc) => (
                      <div
                        key={exc.item_id}
                        className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-800">
                            {exc.category.replace(/_/g, ' ')} • {exc.reference}
                          </span>
                          <span className="text-sm font-extrabold text-red-700">
                            {formatKES(exc.amount_kes)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          <strong>Audit Finding:</strong> {exc.root_cause}
                        </p>
                        <p className="text-xs text-blue-700 font-semibold">
                          <strong>Treasury Action:</strong> {exc.recommended_action}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right 6/12: Automated Balanced SAP / ERP GL Journal Preview */}
              <div className="lg:col-span-6 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      Automated Daily SAP General Ledger Posting
                    </h3>
                    <p className="text-xs text-slate-500">
                      100% Double-Entry Balanced Journal (Debits = Credits ={' '}
                      {formatKES(selectedBatch.summary.gl_total_debit_kes)})
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {selectedBatch.erp_journal_ref || 'READY-TO-POST'}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                        <th className="py-2.5 px-2">GL Account</th>
                        <th className="py-2.5 px-2">Narrative</th>
                        <th className="py-2.5 px-2 text-right">Debit (KES)</th>
                        <th className="py-2.5 px-2 text-right">Credit (KES)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedBatch.gl_entries.map((gl) => (
                        <tr key={gl.line_no}>
                          <td className="py-2.5 px-2 font-semibold text-slate-900">
                            <span className="font-mono text-blue-700">{gl.account_code}</span> —{' '}
                            {gl.account_name}
                          </td>
                          <td className="py-2.5 px-2 text-slate-600">{gl.narrative}</td>
                          <td className="py-2.5 px-2 text-right font-mono font-semibold text-slate-900">
                            {gl.debit_kes > 0 ? gl.debit_kes.toLocaleString('en-KE', { minimumFractionDigits: 2 }) : '—'}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-semibold text-emerald-700">
                            {gl.credit_kes > 0 ? gl.credit_kes.toLocaleString('en-KE', { minimumFractionDigits: 2 }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-900 font-extrabold text-slate-900">
                        <td className="py-3 px-2" colSpan={2}>
                          TOTAL BALANCED JOURNAL
                        </td>
                        <td className="py-3 px-2 text-right font-mono">
                          {selectedBatch.summary.gl_total_debit_kes.toLocaleString('en-KE', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-emerald-700">
                          {selectedBatch.summary.gl_total_credit_kes.toLocaleString('en-KE', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: RETAIL TREASURY AI CO-PILOT */}
        {activeTab === 'COPILOT' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Retail Treasury AI Co-Pilot
                  </h3>
                  <p className="text-xs text-slate-500">
                    Enterprise Operations Reasoning Engine + Deterministic Audit
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-600 space-y-2">
                <p>
                  Active Store Context:{' '}
                  <strong className="text-slate-900">
                    {selectedBatch?.store_name} ({selectedBatch?.batch_id})
                  </strong>
                </p>
                <p className="font-semibold text-slate-700 pt-2">
                  One-Click Executive Treasury Prompts:
                </p>
              </div>

              <div className="space-y-2">
                {[
                  `Draft a Bank Card Commission Overcharge Claim Debit Note for ${selectedBatch?.store_name} (Charged 2.15% vs. Agreed 1.50%).`,
                  `Explain the duplicate M-Pesa reversal ghost and cashier till shortage for ${selectedBatch?.batch_id}.`,
                  'Summarize chain-wide POS gross sales vs net bank credits and total recoverable Bank Card Commission Overcharges across all branches.',
                  `Verify whether the SAP General Ledger journal for ${selectedBatch?.store_name} is 100% balanced.`,
                ].map((p) => (
                  <button
                    key={p}
                    onClick={() => handleAskCopilot(p)}
                    disabled={asking}
                    className="w-full text-left p-3 rounded-2xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-xs font-medium text-slate-700 transition cursor-pointer"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[560px]">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-extrabold text-slate-900">
                    Interactive 4-Way Settlement &amp; Bank Commission Audit Session
                  </span>
                </div>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  POST /api/agent/ask
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatHistory.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-2xl rounded-2xl p-4 text-xs sm:text-sm whitespace-pre-wrap leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-900 border border-slate-200'
                      }`}
                    >
                      {msg.role === 'assistant' && msg.engine && (
                        <div className="text-[10px] font-mono uppercase tracking-wider text-blue-600 font-bold mb-1">
                          Engine: {msg.engine}
                        </div>
                      )}
                      {msg.text}
                    </div>
                  </div>
                ))}
                {asking && (
                  <div className="text-xs text-slate-500 italic">
                    Auditing store POS Z-Report, Daraja CSV, and Bank Card Commission settlement...
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAskCopilot();
                }}
                className="p-4 border-t border-slate-200 flex items-center gap-3"
              >
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask about Bank Card Commission Overcharges, M-Pesa reversals, T+1 cutoffs, or GL entries..."
                  className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:border-blue-600 outline-none"
                />
                <button
                  type="submit"
                  disabled={asking || !question.trim()}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Ask Co-Pilot</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: 1-PAGE STORE TENDER RECONCILIATION & GL POSTING SUMMARY (PRINT-READY) */}
        {activeTab === 'SUMMARY' && selectedBatch && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 print:hidden">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700">Select Store Batch:</span>
                <select
                  value={selectedBatch.batch_id}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="text-xs font-bold rounded-xl border border-slate-300 px-3 py-2 bg-slate-50"
                >
                  {batches.map((b) => (
                    <option key={b.batch_id} value={b.batch_id}>
                      {b.batch_id} — {b.store_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                {selectedBatch.status !== 'RECONCILED_SIGNED_OFF' && (
                  <button
                    onClick={() => handleApproveSignOff(selectedBatch.batch_id)}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve Sign-Off Now</span>
                  </button>
                )}
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print / Save 1-Page Recon PDF</span>
                </button>
              </div>
            </div>

            {/* Printable 1-Page Executive Certificate */}
            <div className="bg-white rounded-3xl border border-slate-300 shadow-sm p-8 space-y-6 print:border-none print:shadow-none print:p-0">
              <div className="border-b-2 border-slate-900 pb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    OFFICIAL RETAIL TREASURY &amp; INTERNAL AUDIT CERTIFICATE
                  </div>
                  <h2 className="text-2xl font-extrabold text-slate-900 mt-1">
                    1-Page Store Tender Reconciliation &amp; Daily GL Posting Summary
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Store: <strong>{selectedBatch.store_name}</strong> ({selectedBatch.store_code}) • Batch ID:{' '}
                    <strong>{selectedBatch.batch_id}</strong> • Business Date:{' '}
                    <strong>{selectedBatch.business_date}</strong>
                  </p>
                </div>
                <div className="text-right">
                  <div
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${
                      selectedBatch.status === 'RECONCILED_SIGNED_OFF'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-amber-50 text-amber-800 border-amber-300'
                    }`}
                  >
                    {selectedBatch.status === 'RECONCILED_SIGNED_OFF'
                      ? `SIGNED OFF • ${selectedBatch.erp_journal_ref}`
                      : 'PENDING TREASURY SIGN-OFF'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Shift Manager: {selectedBatch.shift_manager} | Head Cashier:{' '}
                    {selectedBatch.head_cashier}
                  </div>
                </div>
              </div>

              {/* Section 1: 4-Way Tender Summary */}
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
                  Section 1 — 4-Way Store Tender Match &amp; Bank Card Commission Summary (KES)
                </h3>
                <table className="w-full text-left border-collapse border border-slate-200 text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                      <th className="py-2 px-3">Tender Stream</th>
                      <th className="py-2 px-3 text-right">POS Z-Report Gross</th>
                      <th className="py-2 px-3 text-right">Provider Gross</th>
                      <th className="py-2 px-3 text-right">Agreed Bank Commission</th>
                      <th className="py-2 px-3 text-right">Bank Commission Overcharge Claim</th>
                      <th className="py-2 px-3 text-right">Actual Bank Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedBatch.tenders.map((t) => (
                      <tr key={t.tender_type}>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {t.tender_label} ({t.provider_ref})
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {t.pos_z_report_gross.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {t.provider_settlement_gross.toLocaleString('en-KE', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {t.expected_fee_kes.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-red-700">
                          {t.fee_overcharge_kes.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                          {t.actual_bank_credit.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-extrabold border-t-2 border-slate-300">
                      <td className="py-2.5 px-3">TOTAL STORE SETTLEMENT</td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {selectedBatch.summary.total_pos_gross_kes.toLocaleString('en-KE', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {selectedBatch.summary.total_provider_gross_kes.toLocaleString('en-KE', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {selectedBatch.summary.total_expected_fee_kes.toLocaleString('en-KE', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-red-700">
                        {selectedBatch.summary.total_mdr_overcharge_kes.toLocaleString('en-KE', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                        {selectedBatch.summary.total_actual_bank_credit_kes.toLocaleString('en-KE', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Section 2: Balanced General Ledger Journal */}
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
                  Section 2 — Balanced SAP General Ledger Posting ({selectedBatch.erp_journal_ref || 'DRAFT'})
                </h3>
                <table className="w-full text-left border-collapse border border-slate-200 text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                      <th className="py-2 px-3">GL Code &amp; Account Name</th>
                      <th className="py-2 px-3">Posting Narrative</th>
                      <th className="py-2 px-3 text-right">Debit (KES)</th>
                      <th className="py-2 px-3 text-right">Credit (KES)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedBatch.gl_entries.map((gl) => (
                      <tr key={gl.line_no}>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {gl.account_code} — {gl.account_name}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{gl.narrative}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          {gl.debit_kes > 0
                            ? gl.debit_kes.toLocaleString('en-KE', { minimumFractionDigits: 2 })
                            : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {gl.credit_kes > 0
                            ? gl.credit_kes.toLocaleString('en-KE', { minimumFractionDigits: 2 })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Section 3: Signatures */}
              <div className="pt-4 border-t border-slate-200 grid grid-cols-3 gap-6 text-xs">
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">
                    Store Shift Manager
                  </div>
                  <div className="font-bold text-slate-900 mt-1">
                    {selectedBatch.shift_manager}
                  </div>
                  <div className="text-slate-500 text-[11px]">Verified Z-Report &amp; CIT Drop</div>
                </div>
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">
                    Automated 4-Way Recon Engine
                  </div>
                  <div className="font-bold text-slate-900 mt-1">
                    Agent #07 (Zero Unexplained Residual)
                  </div>
                  <div className="text-slate-500 text-[11px]">Bank Card Commission &amp; Daraja Verified</div>
                </div>
                <div>
                  <div className="text-slate-400 font-bold uppercase text-[10px]">
                    Treasury &amp; Finance Sign-Off
                  </div>
                  <div className="font-bold text-slate-900 mt-1">
                    {selectedBatch.signoff_by || user.name}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    {selectedBatch.signoff_timestamp || 'Pending Final Stamp'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
