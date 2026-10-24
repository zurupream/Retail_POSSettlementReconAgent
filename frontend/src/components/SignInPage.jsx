import React, { useState, useEffect, useRef } from 'react';
import ThemeSwitcher from './ThemeSwitcher';
import {
  ShieldCheck,
  Smartphone,
  CreditCard,
  Landmark,
  FileSpreadsheet,
  CheckCircle2,
  ArrowRight,
  Lock,
  Mail,
  KeyRound,
  AlertTriangle,
  Sparkles,
  Store
} from 'lucide-react';

const GOOGLE_CLIENT_ID = '259388273008-n8vg3ae8be86e56svvg09rbdciah17u1.apps.googleusercontent.com';

export default function SignInPage({ onSuccess }) {
  const [step, setStep] = useState('EMAIL'); // EMAIL | OTP
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const googleBtnRef = useRef(null);

  useEffect(() => {
    const initGoogle = () => {
      if (window.google && window.google.accounts && googleBtnRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleResponse,
          });
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            width: 340,
            text: 'signin_with',
            shape: 'rectangular',
          });
        } catch (err) {
          console.error('Google Sign-In init error:', err);
        }
      }
    };

    const timer = setTimeout(initGoogle, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleGoogleResponse = async (response) => {
    if (!response || !response.credential) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Google SSO authentication failed.');
      }
      onSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfoMessage('');
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to send verification code.');
      }
      setInfoMessage(data.message || `6-digit code sent to ${email}`);
      setStep('OTP');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Invalid verification code.');
      }
      onSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const workflowSteps = [
    {
      num: '01',
      title: 'Store POS Z-Report + M-Pesa Till CSV + Card Settlement + Bank Credit',
      subtitle: 'Multi-Branch Omnichannel Tender Ingestion',
      desc: 'Ingests end-of-day POS Z-Reports across branches alongside G4S/Wells CIT cash drops, Safaricom M-Pesa BuyGoods/Paybill CSVs, and Visa/Mastercard PDQ card settlements.',
      badges: ['POS Z-Report', 'M-Pesa Daraja CSV', 'Visa/MC PDQ Batch', 'CIT Vault Cash'],
      icon: Store,
      accent: 'from-blue-600 to-indigo-600',
      lightBg: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      num: '02',
      title: 'Deterministic 4-Way Tender Match, Bank Card Commission & Till Shortage Audit',
      subtitle: 'Zero-Leakage Bank Commission & Cutoff Variance Engine',
      desc: 'Audits every card batch for Bank Card Commission Overcharge (Agreed 1.50% vs. Charged 2.15%), isolates 23:45 EAT T+1 PDQ cutoffs, flags duplicate M-Pesa reversals, and pins down cashier till shortages.',
      badges: [
        'Bank Card Commission Overcharge (Agreed 1.50% vs. Charged 2.15%)',
        'T+1 Cutoff Transit',
        'M-Pesa Reversal Ghost',
        'Till Shortage Pinpoint'
      ],
      icon: ShieldCheck,
      accent: 'from-emerald-600 to-teal-600',
      lightBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      num: '03',
      title: '1-Page Store Tender Recon & Daily Treasury GL Summary',
      subtitle: 'Balanced SAP / ERP Journal & Bank Commission Claim Debit Notes',
      desc: 'Produces a print-ready 1-Page Store Tender Reconciliation Certificate, Bank Card Commission Overcharge Claim Debit Notes, Staff Shortage Receivables, and balanced General Ledger postings.',
      badges: ['SAP GL Auto-Post', 'Bank Commission Claim Note', 'CFO Sign-Off Seal', '1-Page Audit PDF'],
      icon: FileSpreadsheet,
      accent: 'from-amber-500 to-orange-600',
      lightBg: 'bg-amber-50 text-amber-800 border-amber-200',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between">
      {/* Top Enterprise Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-sm">
              <Landmark className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  Agent #07 • Retail &amp; Distribution Suite
                </span>
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  4-Way Tender Recon Engine
                </span>
              </div>
              <h1 className="text-base font-bold text-slate-900 mt-0.5">
                Retail POS, M-Pesa, Card &amp; Bank 4-Way Settlement Recon Agent
              </h1>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-emerald-600" /> Safaricom Daraja C2B
            </span>
            <span className="flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-blue-600" /> Bank Card Commission Audit (1.50%)
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600" /> Enterprise SSO Protected
            </span>
          </div>
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      {/* Main 12-Col Split Layout */}
      <main className="max-w-7xl mx-auto w-full px-6 py-8 lg:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left 7/12: Apple-Style 3-Step Visual Workflow Diagram */}
        <div className="lg:col-span-7 space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" /> Automated Omnichannel Retail Treasury Control
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
              Eliminate POS-to-Bank Settlement Leakage Across Every Branch Till
            </h2>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Reconcile daily branch Z-Reports against physical CIT cash drops, M-Pesa BuyGoods/Paybill statements, and Card PDQ settlements in seconds—isolating Bank Card Commission Overcharges and reversal ghosts automatically.
            </p>
          </div>

          {/* 3-Step Visual Architecture Cards */}
          <div className="space-y-4">
            {workflowSteps.map((item, idx) => {
              const IconComponent = item.icon;
              return (
                <div
                  key={item.num}
                  className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.accent} text-white flex flex-col items-center justify-center shrink-0 shadow-sm`}
                    >
                      <IconComponent className="w-5 h-5" />
                      <span className="text-[10px] font-bold tracking-wider opacity-90">{item.num}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Step {idx + 1} • {item.subtitle}
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{item.desc}</p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {item.badges.map((b) => (
                          <span
                            key={b}
                            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${item.lightBg}`}
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Executive Metrics Bar */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">Bank Card Commission</div>
              <div className="text-lg font-extrabold text-slate-900 mt-0.5">Agreed 1.50% vs. 2.15%</div>
              <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                Auto-flags 0.65% Bank Card Commission Overcharge
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">4-Way Tender Streams</div>
              <div className="text-lg font-extrabold text-slate-900 mt-0.5">Cash • M-Pesa • Card</div>
              <div className="text-[11px] text-blue-700 font-medium mt-0.5">
                + Corporate EFT &amp; Gift Vouchers
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">Daily GL Sign-Off</div>
              <div className="text-lg font-extrabold text-slate-900 mt-0.5">100% Balanced</div>
              <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                SAP / Oracle ERP ready journals
              </div>
            </div>
          </div>
        </div>

        {/* Right 5/12: Enterprise SSO Card */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl p-7 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                  Enterprise Treasury Access
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">
                  Sign in to Recon Workbench
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Use your corporate email OTP or Google Workspace SSO
                </p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
                <Lock className="w-5 h-5" />
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {infoMessage && (
              <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{infoMessage}</span>
              </div>
            )}

            {step === 'EMAIL' ? (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Work or Business Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    'Sending 6-Digit OTP...'
                  ) : (
                    <>
                      <span>Send 6-Digit Verification Code</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      Enter 6-Digit OTP Code
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('EMAIL');
                        setOtp('');
                        setError('');
                      }}
                      className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                    >
                      Change email
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full pl-10 pr-4 py-2.5 text-base tracking-widest font-mono font-bold rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.length < 6}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Verifying OTP...' : 'Verify & Launch Recon Workbench'}
                </button>
              </form>
            )}

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-slate-400 font-medium">
                  OR CONTINUE WITH GOOGLE WORKSPACE
                </span>
              </div>
            </div>

            <div className="flex justify-center">
              <div ref={googleBtnRef} className="min-h-[42px] flex items-center justify-center" />
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Security &amp; Audit Compliance</span>
                <span className="text-emerald-700 font-semibold">ISO 27001 • PCI-DSS L1</span>
              </div>
              <p>
                Every branch sign-off and SAP General Ledger journal is cryptographically stamped with user identity and UTC timestamp.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-3.5 px-6 text-center text-xs text-slate-500">
        Retail Omnichannel POS, M-Pesa, Card &amp; Bank 4-Way Settlement Reconciliation Agent • Sybyl Enterprise AI Banking &amp; Retail Suite
      </footer>
    </div>
  );
}
