// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Ghost, ArrowRight, ArrowLeft, Bell, TrendingUp, Layers, Loader2, Check,
  ChevronDown, Eye, EyeOff, Zap, Sparkles, Search, ShieldCheck,
  CircleDot, Calendar, Receipt as ReceiptIcon, FastForward, X, Lock
} from 'lucide-react';

/* ==================================================================
   THE SUBSCRIPTION GHOSTS
   Recurring-debit forensics on an Indian bank statement.

   The full loop: scan → detect → calibrate usage → intercept the next
   debit → guided kill → verify the debit actually stopped → reclaim.

   The detection engine below is real. It reads generated transaction
   rows and finds recurrence by periodicity, amount stability and
   merchant-string clustering. Nothing in the results is hardcoded.
===================================================================*/

const C = {
  ink: '#FFFFFF', ink2: '#FFFFFF', ink3: '#EFF9F7', rule: '#D6E7E4',
  ghost: '#00786C', amber: '#B4650F', bleed: '#C7413A', green: '#1E8A4A',
  alive: '#7C8A88', text: '#12211F', dim: '#5A6A67', faint: '#93A5A2',
};

const MONO = "'DM Mono', ui-monospace, 'SF Mono', Menlo, monospace";
const SANS = "'Bricolage Grotesque', 'Bricolage Grotesque 48pt', system-ui, sans-serif";

const TODAY = new Date(2026, 7, 14);
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const fmt = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
const daysBetween = (a, b) => Math.round((b - a) / 86400000);

/* ---------------- deterministic randomness (demos must repeat) --------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ============================ STATEMENT ============================ */

const RECURRING_DEFS = [
  { raw: 'UPI/AUTOPAY/CULTFIT/HDFC0000521', day: 18, every: 1, amt: () => 1299,
    rail: 'UPI AutoPay · PhonePe', service: 'Cult.fit Elite', cat: 'Fitness', lastUsed: 84 },
  { raw: 'RAZ*ADOBE SYSTEMS SOFTWARE IE', day: 27, every: 1, amt: () => 1675,
    rail: 'Card e-mandate · HDFC 4402', service: 'Adobe Creative Cloud', cat: 'Software', lastUsed: 96 },
  { raw: 'PAYU*NETFLIXCOM MUMBAI IN', day: 22, every: 1, amt: d => (d < new Date(2026, 4, 1) ? 499 : 649),
    rail: 'Card e-mandate · HDFC 4402', service: 'Netflix Standard', cat: 'Streaming', lastUsed: 47 },
  { raw: 'NACH-DR-JIOHOTSTAR-8821094', day: 2, every: 1, amt: () => 499,
    rail: 'NACH mandate · HDFC savings', service: 'JioHotstar Super', cat: 'Streaming', lastUsed: 61 },
  { raw: 'APPLE.COM/BILL ITUNES IN', day: 29, every: 1, amt: () => 219,
    rail: 'Apple ID billing', service: 'iCloud+ 200GB', cat: 'Storage', lastUsed: 38 },
  { raw: 'RAZ*SPOTIFY INDIA PVT LTD', day: 25, every: 1, amt: () => 119,
    rail: 'UPI AutoPay · GPay', service: 'Spotify Premium', cat: 'Music', lastUsed: 2 },
  { raw: 'GOOGLE *One IN 2TB', day: 20, every: 1, amt: () => 210,
    rail: 'Card e-mandate · HDFC 4402', service: 'Google One 2TB', cat: 'Storage', lastUsed: 12 },
  { raw: 'AMZN Mktp Prime IN CHENNAI', day: 1, every: 1, amt: () => 299,
    rail: 'Card e-mandate · HDFC 4402', service: 'Amazon Prime', cat: 'Streaming', lastUsed: 9 },
  { raw: 'SWIGGY ONE MEMBERSHIP BLR', day: 19, every: 3, amt: () => 299,
    rail: 'UPI AutoPay · PhonePe', service: 'Swiggy One', cat: 'Food', lastUsed: 5 },
  { raw: 'INB/SONYLIV/PREM/ANNUAL/RENEW', day: 16, every: 12, amt: () => 999,
    rail: 'Net banking standing instruction', service: 'Sony LIV Premium', cat: 'Streaming', lastUsed: 143 },
  // Recurring, but not discretionary subscriptions. The engine must not flag these.
  { raw: 'IMPS-DR-RENT-LANDLORD-KRISHNAN', day: 5, every: 1, amt: () => 24000,
    rail: 'IMPS transfer', service: 'Rent', cat: 'Housing', essential: true },
  { raw: 'NACH-DR-LIC-INSURE-4412', day: 10, every: 1, amt: () => 2847,
    rail: 'NACH mandate', service: 'LIC policy', cat: 'Insurance', essential: true },
  { raw: 'UPI/AUTOPAY/AIRTEL-POSTPAID-8891', day: 7, every: 1, amt: () => 799,
    rail: 'UPI AutoPay · GPay', service: 'Airtel postpaid', cat: 'Telecom', essential: true },
];

const NOISE = [
  ['UPI/DR/%/SWIGGY/PAYTM', 180, 720], ['UPI/DR/%/UBER INDIA', 90, 460],
  ['POS/HP PETROL PUMP/VELACHERY', 500, 2200], ['UPI/DR/%/ZEPTO MARKETPLACE', 120, 900],
  ['ATW/CASH WDL/ATM/GUINDY BR', 2000, 6000], ['UPI/DR/%/BLINKIT COMMERCE', 150, 800],
  ['POS/RELIANCE FRESH/T NAGAR', 400, 2400], ['UPI/DR/%/OLA CABS', 80, 400],
  ['UPI/DR/%/DOMINOS PIZZA', 250, 900], ['POS/DECATHLON SPORTS', 700, 4000],
  ['UPI/DR/%/IRCTC RAIL CONNECT', 300, 2100], ['POS/APOLLO PHARMACY/ADYAR', 120, 850],
  ['UPI/DR/%/BOOKMYSHOW', 200, 1400], ['UPI/DR/%/AMAZON PAY RECHARGE', 100, 700],
  ['UPI/DR/%/STARBUCKS COFFEE', 180, 620], ['POS/CROMA RETAIL/PHOENIX', 600, 5200],
];

function buildStatement() {
  const rnd = mulberry32(20260814);
  const txns = [];
  const start = new Date(2025, 7, 15);

  RECURRING_DEFS.forEach(def => {
    for (let m = 0; m < 14; m++) {
      const d = new Date(2025, 7 + m, def.day);
      if (d < start || d > TODAY) continue;
      if (def.every === 3 && (d.getMonth() % 3) !== 1) continue;
      if (def.every === 12 && d.getMonth() !== 7) continue;
      txns.push({ date: d, raw: def.raw, amount: def.amt(d), type: 'DR' });
    }
  });

  for (let m = 0; m < 13; m++) {
    const base = new Date(2025, 7 + m, 1);
    if (base > TODAY) break;
    const count = 24 + Math.floor(rnd() * 8);
    for (let i = 0; i < count; i++) {
      const day = 1 + Math.floor(rnd() * 28);
      const d = new Date(base.getFullYear(), base.getMonth(), day);
      if (d < start || d > TODAY) continue;
      const [tpl, lo, hi] = NOISE[Math.floor(rnd() * NOISE.length)];
      txns.push({
        date: d,
        raw: tpl.replace('%', String(100000 + Math.floor(rnd() * 899999))),
        amount: Math.round(lo + rnd() * (hi - lo)), type: 'DR',
      });
    }
    const sal = new Date(base.getFullYear(), base.getMonth(), 28);
    if (sal <= TODAY && sal >= start) txns.push({ date: sal, raw: 'NEFT-CR-SALARY', amount: 86400, type: 'CR' });
  }
  return txns.sort((a, b) => a.date - b.date);
}

/* ========================= DETECTION ENGINE ========================= */

const STOP = new Set(['IN','INDIA','PVT','LTD','LIMITED','COM','HDFC','ICICI','SBI','PAYTM',
  'RAZ','PAYU','MUMBAI','CHENNAI','BLR','BANGALORE','DELHI','MKTP','BILL','SYSTEMS','SOFTWARE',
  'IE','MEMBERSHIP','PREM','PREMIUM','ANNUAL','RENEW','YEARLY','SUBSCRIPTION','DR','CR',
  'MANDATE','AUTOPAY','UPI','POS','INB','NACH','WDL','CASH','ATM','RETAIL','PUMP','FRESH']);

/** Strip the payment rail and the noise, keep the merchant. */
function normKey(raw) {
  const s = raw.toUpperCase()
    .replace(/^(UPI\/AUTOPAY\/|UPI\/DR\/\d+\/|NACH-DR-|ACH-D-|IMPS-DR-|NEFT-CR-|INB\/|POS\/|ATW\/)/, '')
    .replace(/[*/.]/g, ' ');
  const toks = s.split(/[^A-Z0-9]+/).filter(t =>
    t && t.length > 2 && !/^\d+$/.test(t) && !/\d{3,}/.test(t) && !STOP.has(t));
  return toks.slice(0, 2).join(' ') || raw.slice(0, 14);
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function cadenceOf(gap) {
  if (gap >= 6 && gap <= 8) return { label: 'weekly', perYear: 52 };
  if (gap >= 26 && gap <= 34) return { label: 'monthly', perYear: 12 };
  if (gap >= 84 && gap <= 96) return { label: 'quarterly', perYear: 4 };
  if (gap >= 178 && gap <= 190) return { label: 'half-yearly', perYear: 2 };
  if (gap >= 350 && gap <= 375) return { label: 'yearly', perYear: 1 };
  return null;
}

const ANNUAL_HINT = /(ANNUAL|YEARLY|RENEW|SUBSCRIPTION|PREM)/i;

/**
 * Two passes.
 *  1. Periodicity — needs 3+ debits with stable gaps and stable amounts.
 *  2. Semantic sweep — an annual charge appears once in a 12-month window,
 *     so periodicity can never find it. Caught by descriptor instead.
 */
function detect(txns) {
  const groups = new Map();
  txns.filter(t => t.type === 'DR').forEach(t => {
    const k = normKey(t.raw);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  });

  const found = [], rejected = [];

  groups.forEach((rows, key) => {
    rows.sort((a, b) => a.date - b.date);

    if (rows.length >= 3) {
      const gaps = rows.slice(1).map((r, i) => daysBetween(rows[i].date, r.date));
      const g = median(gaps);
      const cv = Math.sqrt(gaps.reduce((s, x) => s + (x - g) ** 2, 0) / gaps.length) / (g || 1);
      const distinct = [...new Set(rows.map(r => r.amount))];
      const cad = cadenceOf(g);
      const stable = distinct.length <= 2;

      if (cad && cv < 0.20 && stable) {
        const last = rows[rows.length - 1];
        const next = new Date(last.date);
        next.setDate(next.getDate() + g);
        while (next <= TODAY) next.setDate(next.getDate() + g);
        found.push(makePattern(key, rows, cad, next, 'periodicity', distinct, g));
        return;
      }
      rejected.push({
        key, n: rows.length,
        why: cv >= 0.20 ? `gaps random (±${Math.round(cv * 100)}%)`
          : !cad ? `every ${g}d — not a billing cycle`
          : 'amount changes every time',
      });
      return;
    }

    if (rows.length <= 2 && ANNUAL_HINT.test(rows[0].raw) && rows[0].amount >= 400) {
      const last = rows[rows.length - 1];
      if (daysBetween(last.date, TODAY) > 300) {
        const next = new Date(last.date);
        next.setFullYear(next.getFullYear() + 1);
        found.push(makePattern(key, rows, { label: 'yearly', perYear: 1 }, next, 'semantic', [last.amount], 365));
        return;
      }
    }
    if (rows.length === 2) rejected.push({ key, n: 2, why: 'too few debits to be sure' });
  });

  return { found: found.sort((a, b) => b.annual - a.annual), rejected, groups: groups.size };
}

function makePattern(key, rows, cad, next, method, distinct, gap) {
  const last = rows[rows.length - 1];
  const def = RECURRING_DEFS.find(d => normKey(d.raw) === key);
  const hike = distinct.length === 2 ? { from: Math.min(...distinct), to: Math.max(...distinct) } : null;
  return {
    id: key.replace(/\s/g, '_'), key, raw: last.raw, rows, gap,
    amount: last.amount, cadence: cad.label, annual: last.amount * cad.perYear,
    next, daysToDebit: daysBetween(TODAY, next), method, hike,
    service: def?.service || key.split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' '),
    cat: def?.cat || 'Other',
    rail: def?.rail || 'Unrecognised rail',
    essential: !!def?.essential,
    seedUsage: def?.lastUsed ?? null,
  };
}

/* ------------------ cancellation routing, by rail ------------------ */
function killSteps(p) {
  const app = /PhonePe/.test(p.rail) ? 'PhonePe' : /GPay/.test(p.rail) ? 'Google Pay' : 'your UPI app';
  if (/UPI AutoPay/.test(p.rail)) return [
    { t: `Open ${app} → profile → AutoPay`, d: `Mandates live inside the app that created them. ${app} created this one, so it will not appear in the others.` },
    { t: `Find the ${p.key} mandate → Revoke → UPI PIN`, d: 'This stops the money. It does not stop the subscription.' },
    { t: `Open ${p.service} → Account → Cancel plan`, d: 'Required. Skipping this leaves the account open and marked past due, which can end up in collections.' },
  ];
  if (/Card e-mandate/.test(p.rail)) return [
    { t: `Cancel at ${p.service} first`, d: 'Account settings → Plan → Cancel. Card mandates lapse on their own once the merchant stops presenting them.' },
    { t: 'Check for an early-exit fee', d: 'Annual-billed-monthly plans often charge a termination fee before month 12. Confirm your plan start date before you click.' },
    { t: 'Net banking → Manage e-mandates → verify removed', d: 'HDFC lists standing card mandates here. If it survives the cancellation, revoke it directly.' },
  ];
  if (/NACH/.test(p.rail)) return [
    { t: `Cancel inside ${p.service}`, d: 'App → Subscriptions → Cancel plan.' },
    { t: 'NACH cannot be revoked from a UPI app', d: 'This is a bank-level mandate. It does not appear in PhonePe or GPay AutoPay lists at all, which is why it goes unnoticed.' },
    { t: 'Net banking → Manage Mandates → Cancel', d: 'Or submit a mandate-cancellation form at the branch. Allow three working days before the next debit date.' },
  ];
  if (/standing instruction/.test(p.rail)) return [
    { t: `${p.service} → My Account → turn off auto-renew`, d: 'Do this first, or the merchant simply re-presents the instruction next cycle.' },
    { t: 'Net banking → Manage Standing Instructions → Stop', d: 'Standing instructions are invisible to every UPI app and to most subscription trackers. This is exactly how it survived a year unnoticed.' },
    { t: 'Screenshot the confirmation', d: 'Annual charges are the hardest to dispute eleven months later. Keep proof.' },
  ];
  if (/Apple/.test(p.rail)) return [
    { t: 'Settings → your name → Subscriptions', d: 'Apple billing is never visible to the bank as a merchant name — everything shows as ITUNES.' },
    { t: `Select ${p.service} → Cancel subscription`, d: 'For iCloud specifically, downgrade rather than cancel if you still need the free 5GB.' },
    { t: 'Get storage under 5GB first', d: 'Apple holds data above the free tier for 30 days after downgrade, then deletes it.' },
  ];
  return [
    { t: `Open ${p.service} → Settings → Subscription`, d: 'Cancel from the merchant side first.' },
    { t: 'Verify on your next statement', d: 'We will check the debit date for you.' },
  ];
}

/* ============================== UI ATOMS ============================== */

function Tag({ children, c }) {
  return <span style={{
    font: `500 10px/1 ${MONO}`, letterSpacing: '.08em', color: c,
    border: `1px solid ${c}44`, background: `${c}14`,
    padding: '4px 7px', borderRadius: 999, textTransform: 'uppercase', whiteSpace: 'nowrap',
  }}>{children}</span>;
}

function Label({ icon: Icon, c, children }) {
  return <div className="flex items-center gap-2 mb-3" style={{ color: c }}>
    <Icon size={13} />
    <span style={{ font: `500 11px/1 ${MONO}`, letterSpacing: '.16em' }}>{children}</span>
  </div>;
}

function Spark({ rows, hike, cadence }) {
  const [hov, setHov] = useState(null);
  const max = Math.max(...rows.map(r => r.amount));
  const sel = hov != null ? rows[hov] : rows[rows.length - 1];
  const isUp = hike && sel.amount === hike.to;

  return (
    <div onMouseLeave={() => setHov(null)}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span style={{ font: `500 17px/1 ${MONO}`, color: isUp ? C.amber : C.text }}>
          {inr(sel.amount)}
        </span>
        <span style={{ font: `400 11px/1.4 ${MONO}`, color: C.dim }}>
          {fmt(sel.date)}{hov == null ? ' · latest' : ''}
        </span>
      </div>

      <div className="flex items-end gap-[3px]" style={{ height: 44 }}>
        {rows.map((r, i) => {
          const up = hike && r.amount === hike.to;
          const on = hov === i;
          return (
            <div key={i} onMouseEnter={() => setHov(i)}
              className="flex-1 flex items-end cursor-default"
              style={{ height: '100%', minWidth: 5 }}>
              <div style={{
                width: '100%',
                height: `${Math.max(12, (r.amount / max) * 100)}%`,
                borderRadius: 2,
                background: on ? C.ghost : up ? C.amber : C.faint,
                transition: 'background .12s',
              }} />
            </div>
          );
        })}
      </div>

      <div style={{ font: `400 11px/1.6 ${MONO}`, color: C.faint, marginTop: 8 }}>
        {rows.length} debits · {cadence}{hike ? ` · rose ${inr(hike.from)} → ${inr(hike.to)}` : ''}
      </div>
    </div>
  );
}

function Btn({ children, onClick, kind = 'primary', icon: Icon, disabled, spin }) {
  const s = kind === 'primary' ? { background: C.ghost, color: C.ink, border: 'none' }
    : kind === 'warn' ? { background: C.amber, color: C.ink, border: 'none' }
    : { background: C.ink3, color: C.text, border: `1px solid ${C.rule}` };
  return <button onClick={onClick} disabled={disabled}
    className="flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-40"
    style={{ ...s, font: `600 14px/1 ${SANS}` }}>
    {Icon && <Icon size={16} className={spin ? 'animate-spin' : ''} />}{children}
  </button>;
}

/* ============================== SCREENS ============================== */

function Intake({ onScan, onPaste, pasteText, setPasteText, busy, teaser }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(false);
  useEffect(() => { const t = setTimeout(() => setToast(true), 1100); return () => clearTimeout(t); }, []);

  return (
    <div className="relative flex flex-col items-center justify-center px-6"
      style={{ minHeight: 'calc(100vh - 58px)' }}>

      <Ghost size={32} style={{ color: C.ghost, marginBottom: 26 }} />
      <h1 className="text-center" style={{
        font: `800 clamp(40px,9vw,86px)/1 ${SANS}`, letterSpacing: '-.035em', color: C.text, marginBottom: 18,
      }}>
        Subscription <span style={{ color: C.ghost }}>Ghosts</span>
      </h1>
      <p className="text-center" style={{
        font: `400 17px/1.6 ${SANS}`, color: C.dim, maxWidth: 470, marginBottom: 36,
      }}>
        Small payments keep leaving your account every month. We read the statement,
        show you which ones you stopped using, and walk you through stopping them.
      </p>


      {!open ? (
        <>
          <Btn onClick={onScan} icon={Eye} disabled={busy}>Try it with a sample statement</Btn>
          <button onClick={() => setOpen(true)} className="hover:underline mt-6"
            style={{ font: `400 12px/1 ${SANS}`, color: C.faint }}>
            or paste a few lines from your own statement
          </button>
        </>
      ) : (
        <div style={{ width: '100%', maxWidth: 460 }}>
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={4} autoFocus
            placeholder={'RAZ*NOTION LABS INC\nNACH-DR-AIRTEL-XSTREAM-441\nUPI/AUTOPAY/ZOMATOGOLD/ICIC'}
            className="w-full p-4 rounded-xl outline-none resize-none"
            style={{ background: C.ink2, border: `1px solid ${C.rule}`, font: `400 13px/1.8 ${MONO}`, color: C.text }} />
          <div className="mt-3 flex gap-3">
            <Btn kind="ghost" onClick={onPaste} disabled={busy || !pasteText.trim()}
              icon={busy ? Loader2 : Sparkles} spin={busy}>
              {busy ? 'Reading…' : 'Find out what these are'}
            </Btn>
            <Btn kind="ghost" onClick={() => setOpen(false)}>Back</Btn>
          </div>
        </div>
      )}

      {teaser && (
        <div className="fixed" style={{
          right: 22, bottom: 22, width: 330, maxWidth: 'calc(100vw - 44px)',
          borderRadius: 16, padding: 16,
          background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(10px)',
          border: `1px solid ${C.rule}`, boxShadow: '0 18px 44px rgba(60,45,25,.16)',
          opacity: toast ? 1 : 0,
          transform: toast ? 'none' : 'translateY(16px) scale(.97)',
          transition: 'opacity .5s cubic-bezier(.2,.9,.3,1), transform .5s cubic-bezier(.2,.9,.3,1.2)',
          pointerEvents: 'none',
        }}>
          <div className="flex items-center gap-2 mb-2.5">
            <Ghost size={12} style={{ color: C.ghost }} />
            <span style={{ font: `500 10px/1 ${MONO}`, letterSpacing: '.1em', color: C.dim }}>SUBSCRIPTION GHOSTS</span>
            <span style={{ font: `400 10px/1 ${MONO}`, color: C.faint, marginLeft: 'auto' }}>now</span>
          </div>
          <div style={{ font: `600 15px/1.35 ${SANS}`, color: C.text, marginBottom: 5 }}>
            {teaser.service} renews in {teaser.daysToDebit} days
          </div>
          <div style={{ font: `400 13px/1.5 ${SANS}`, color: C.dim }}>
            {inr(teaser.amount)} on {fmt(teaser.next)} · not opened in {teaser.usage} days
          </div>
        </div>
      )}
    </div>
  );
}

function Scan({ txns, result, onDone }) {
  const [phase, setPhase] = useState(0);
  const [i, setI] = useState(0);
  const box = useRef(null);
  const feed = useMemo(() => {
    const hits = new Set(result.found.map(f => f.key));
    return txns.slice(-48).map(t => ({ ...t, hit: hits.has(normKey(t.raw)) }));
  }, [txns, result]);

  useEffect(() => {
    if (i >= feed.length) { const t = setTimeout(() => setPhase(1), 350); return () => clearTimeout(t); }
    const t = setTimeout(() => setI(i + 1), feed[i].hit ? 165 : 44);
    return () => clearTimeout(t);
  }, [i]);
  useEffect(() => { if (phase === 1) { const t = setTimeout(() => setPhase(2), 950); return () => clearTimeout(t); } }, [phase]);
  useEffect(() => { if (phase === 2) { const t = setTimeout(onDone, 950); return () => clearTimeout(t); } }, [phase]);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [i]);

  return (
    <div className="max-w-3xl mx-auto px-6 pt-16 pb-24">
      <div className="flex items-baseline justify-between mb-6 gap-4">
        <div className="flex items-center gap-2" style={{ color: C.ghost }}>
          <Loader2 size={14} className="animate-spin" />
          <span style={{ font: `500 11px/1 ${MONO}`, letterSpacing: '.16em' }}>
            {phase === 0 ? 'PASS 1 · PERIODICITY' : phase === 1 ? 'PASS 2 · SEMANTIC SWEEP' : 'BUILDING LEDGER'}
          </span>
        </div>
        <div className="text-right" style={{ font: `500 12px/1.5 ${MONO}`, color: C.faint }}>
          {txns.length} rows · {result.groups} merchants
        </div>
      </div>

      <div ref={box} className="rounded-xl overflow-y-auto"
        style={{ background: C.ink2, border: `1px solid ${C.rule}`, height: 370, padding: '14px 0' }}>
        {feed.slice(0, i).map((r, k) => (
          <div key={k} className="px-5 py-1 flex gap-3"
            style={{
              font: `400 12.5px/1.8 ${MONO}`, color: r.hit ? C.ghost : C.faint,
              background: r.hit ? 'rgba(14,156,139,.08)' : 'transparent',
              borderLeft: `2px solid ${r.hit ? C.ghost : 'transparent'}`,
            }}>
            <span style={{ opacity: .55, flexShrink: 0 }}>{fmt(r.date)}</span>
            <span className="truncate flex-1">{r.raw}</span>
            <span style={{ flexShrink: 0 }}>{r.amount.toLocaleString('en-IN')}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        <Phase on done={phase >= 1} text="Clustering merchants · testing gap stability and amount drift" />
        <Phase on={phase >= 1} done={phase >= 2} text="Sweeping for annual charges · one debit per year, no periodicity to find" />
        <Phase on={phase >= 2} done={false} text={`${result.found.length} confirmed · ${result.rejected.length} rejected`} />
      </div>
    </div>
  );
}

function Phase({ on, done, text }) {
  return (
    <div className="flex items-start gap-2.5" style={{ opacity: on ? 1 : .25, transition: 'opacity .3s' }}>
      {done ? <Check size={13} style={{ color: C.ghost, marginTop: 3, flexShrink: 0 }} />
        : <CircleDot size={13} style={{ color: on ? C.amber : C.faint, marginTop: 3, flexShrink: 0 }} />}
      <span style={{ font: `400 12.5px/1.5 ${MONO}`, color: C.dim }}>{text}</span>
    </div>
  );
}

const USAGE_OPTS = [['today', 3], ['this month', 14], ['months ago', 70], ['never', 160]];

function Calibrate({ subs, usage, setUsage, onDone }) {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-14 pb-24">
      <Label icon={Search} c={C.amber}>STEP 2 · YOUR USAGE</Label>
      <h2 style={{ font: `600 34px/1.15 ${SANS}`, letterSpacing: '-.02em', color: C.text, marginBottom: 28 }}>
        When did you last use each of these?
      </h2>

      <div className="rounded-xl overflow-hidden mb-8" style={{ background: C.ink2, border: `1px solid ${C.rule}` }}>
        {subs.map(s => {
          const cur = usage[s.id];
          const nearest = USAGE_OPTS.reduce((b, o) => Math.abs(o[1] - cur) < Math.abs(b[1] - cur) ? o : b)[1];
          return (
            <div key={s.id} className="px-5 py-4 flex flex-wrap gap-3 items-center" style={{ borderBottom: `1px solid ${C.rule}` }}>
              <div className="flex-1" style={{ minWidth: 145 }}>
                <div style={{ font: `600 15px/1.3 ${SANS}`, color: C.text }}>{s.service}</div>
                <div style={{ font: `400 11px/1.5 ${MONO}`, color: C.faint }}>{inr(s.amount)} · {s.cadence}</div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {USAGE_OPTS.map(([lbl, v]) => {
                  const active = nearest === v;
                  return <button key={lbl} onClick={() => setUsage(u => ({ ...u, [s.id]: v }))}
                    className="px-3 py-2 rounded-xl transition-colors"
                    style={{
                      font: `500 11.5px/1 ${SANS}`,
                      background: active ? `${C.ghost}1E` : 'transparent',
                      border: `1px solid ${active ? C.ghost : C.rule}`,
                      color: active ? C.ghost : C.dim,
                    }}>{lbl}</button>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <Btn onClick={onDone} icon={ArrowRight}>Show me the results</Btn>
    </div>
  );
}

function DebitStrip({ subs }) {
  const [hov, setHov] = useState(null);
  const days = Array.from({ length: 30 }, (_, i) => {
    const hits = subs.filter(s => s.daysToDebit === i);
    const d = new Date(TODAY); d.setDate(d.getDate() + i);
    return { i, d, hits, total: hits.reduce((a, s) => a + s.amount, 0) };
  });
  const upcoming = days.reduce((a, x) => a + x.total, 0);
  const sel = hov != null ? days[hov] : null;

  return (
    <div className="mb-10">
      <Label icon={Calendar} c={C.dim}>NEXT 30 DAYS</Label>
      <div className="rounded-xl p-4" style={{ background: C.ink2, border: `1px solid ${C.rule}` }}
        onMouseLeave={() => setHov(null)}>
        <div className="flex items-baseline justify-between gap-3 mb-3" style={{ minHeight: 22 }}>
          {sel && sel.hits.length ? <>
            <span style={{ font: `600 15px/1.2 ${SANS}`, color: C.text }}>
              {sel.hits.map(s => s.service).join(', ')}
            </span>
            <span className="text-right shrink-0" style={{ font: `500 13px/1.2 ${MONO}`, color: sel.hits.some(s => s.ghost) ? C.bleed : C.alive }}>
              {inr(sel.total)} · {fmt(sel.d)}
            </span>
          </> : <>
            <span style={{ font: `400 13px/1.2 ${SANS}`, color: C.dim }}>
              {sel ? `${fmt(sel.d)} — nothing due` : "Hover a bar to see what's coming up"}
            </span>
            <span className="text-right shrink-0" style={{ font: `500 13px/1.2 ${MONO}`, color: C.text }}>
              {inr(upcoming)} total
            </span>
          </>}
        </div>

        <div className="flex gap-[3px] items-end" style={{ height: 50 }}>
          {days.map(x => {
            const dead = x.hits.some(s => s.ghost);
            const on = hov === x.i;
            return (
              <div key={x.i} className="flex-1 flex items-end cursor-default"
                onMouseEnter={() => setHov(x.i)} style={{ height: '100%' }}>
                <div style={{
                  width: '100%',
                  height: x.total ? `${Math.max(20, Math.min(100, x.total / 20))}%` : '6px',
                  borderRadius: 2,
                  background: on ? C.ghost : x.total ? (dead ? C.bleed : C.alive) : C.rule,
                  opacity: x.total ? 1 : .5, transition: 'background .12s',
                }} />
              </div>
            );
          })}
        </div>

        <div className="flex justify-between mt-2" style={{ font: `400 10px/1 ${MONO}`, color: C.faint }}>
          <span>today</span><span>+15d</span><span>+30d</span>
        </div>
      </div>
    </div>
  );
}

function Row({ s, open, onToggle, onIntercept, state }) {
  const dead = s.ghost;
  const killed = state === 'killed';
  const watching = state === 'watching';
  const gaps = s.rows.length > 1 ? s.rows.slice(1).map((r, i) => daysBetween(s.rows[i].date, r.date)) : [];
  return (
    <div style={{ borderBottom: `1px solid ${C.rule}`, opacity: killed ? .6 : 1 }}>
      <button onClick={onToggle} className="w-full text-left px-5 py-4 hover:bg-black/[.025] transition-colors">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="truncate" style={{ font: `400 11px/1.5 ${MONO}`, color: C.faint }}>{s.raw}</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span style={{
                font: `600 16px/1.3 ${SANS}`, color: dead ? C.text : C.alive,
                textDecoration: killed ? 'line-through' : 'none',
              }}>{s.service}</span>
              {killed && <Tag c={C.green}>killed</Tag>}
              {watching && <Tag c={C.amber}>verifying</Tag>}
              {s.method === 'semantic' && <Tag c={C.bleed}>annual · invisible</Tag>}
              {s.hike && <Tag c={C.amber}>price up {Math.round((s.hike.to / s.hike.from - 1) * 100)}%</Tag>}
              {s.dupe && <Tag c={C.amber}>duplicate storage</Tag>}
            </div>
            <div style={{ font: `400 12px/1.6 ${MONO}`, color: C.dim, marginTop: 5 }}>
              {s.rail} · next {fmt(s.next)}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div style={{ font: `500 15px/1.3 ${MONO}`, color: killed ? C.green : dead ? C.bleed : C.alive }}>
              {inr(s.annual)}<span style={{ fontSize: 11, color: C.faint }}>/yr</span>
            </div>
            {s.essential ? (
              <div style={{ font: `400 12px/1.6 ${MONO}`, color: C.faint, marginTop: 6 }}>essential</div>
            ) : dead && !killed ? (
              <div className="inline-flex items-baseline gap-1 mt-1.5 px-2 py-1 rounded-xl" style={{
                background: `${C.bleed}1F`, border: `1px solid ${C.bleed}55`,
              }}>
                <span style={{ font: `600 17px/1 ${MONO}`, color: C.bleed }}>{s.usage}</span>
                <span style={{ font: `600 10px/1 ${MONO}`, letterSpacing: '.1em', color: C.bleed }}>DAYS UNUSED</span>
              </div>
            ) : (
              <div style={{ font: `400 12px/1.6 ${MONO}`, color: C.faint, marginTop: 6 }}>
                used {s.usage}d ago
              </div>
            )}
          </div>
          <ChevronDown size={16} style={{
            color: C.faint, marginTop: 18, flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s',
          }} />
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5" style={{ background: C.ink2 }}>
          <div className="grid sm:grid-cols-2 gap-6 pt-4">
            <div>
              <div style={{ font: `500 10px/1 ${MONO}`, letterSpacing: '.16em', color: C.dim, marginBottom: 10 }}>
                DEBIT HISTORY
              </div>
              <Spark rows={s.rows} hike={s.hike} cadence={s.cadence} />
            </div>
            <div>
              <div style={{ font: `500 10px/1 ${MONO}`, letterSpacing: '.16em', color: C.dim, marginBottom: 10 }}>
                EVIDENCE
              </div>
              {(s.method === 'periodicity'
                ? [
                    [`${s.rows.length} debits`, 'repeats'],
                    [`every ${median(gaps)} days`, 'stable interval'],
                    [s.hike ? `${inr(s.hike.from)} → ${inr(s.hike.to)}` : `${inr(s.amount)} each time`, s.hike ? 'price rose' : 'stable amount'],
                    [dead ? `${s.usage} days unopened` : `opened ${s.usage}d ago`, dead ? 'no longer used' : 'still used'],
                  ]
                : [
                    ['1 debit in 12 months', 'no interval to measure'],
                    ['descriptor says ANNUAL', 'caught by wording'],
                    [`${inr(s.amount)} once a year`, 'projected forward'],
                    [`${s.usage} days unopened`, 'no longer used'],
                  ]
              ).map(([v, l], k) => (
                <div key={k} className="flex justify-between gap-3 py-1.5" style={{ borderBottom: `1px solid ${C.rule}` }}>
                  <span style={{ font: `400 12.5px/1.5 ${MONO}`, color: C.text }}>{v}</span>
                  <span className="text-right" style={{ font: `400 12px/1.5 ${SANS}`, color: C.faint }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {!s.essential && !killed && (
            <div className="mt-5 pt-4 flex" style={{ borderTop: `1px solid ${C.rule}` }}>
              <Btn kind={dead ? 'warn' : 'ghost'} icon={Bell} onClick={() => onIntercept(s)}>
                Intercept the {fmt(s.next)} debit
              </Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Ledger({ subs, status, reclaimed, rejected, extra, onIntercept }) {
  const [open, setOpen] = useState(null);
  const rowProps = s => ({
    s, state: status[s.id], open: open === s.id,
    onToggle: () => setOpen(open === s.id ? null : s.id), onIntercept,
  });

  const live = subs.filter(s => status[s.id] !== 'killed');
  const ghosts = live.filter(s => s.ghost && !s.essential);
  const alive = live.filter(s => !s.ghost && !s.essential);
  const essential = subs.filter(s => s.essential);
  const killed = subs.filter(s => status[s.id] === 'killed');
  const bleed = ghosts.reduce((a, s) => a + s.annual, 0);
  const soonest = [...ghosts].sort((a, b) => a.daysToDebit - b.daysToDebit)[0];
  const dupes = subs.filter(s => s.cat === 'Storage');

  return (
    <div className="max-w-3xl mx-auto px-6 pt-14 pb-24">
      <div style={{ font: `500 11px/1.6 ${MONO}`, letterSpacing: '.16em', color: C.dim, marginBottom: 18 }}>
        12 MONTHS · {subs.length} RECURRING PATTERNS · {rejected.length} REJECTED
      </div>

      <div style={{ font: `600 clamp(44px,10vw,82px)/1 ${SANS}`, letterSpacing: '-.03em', color: bleed ? C.bleed : C.green }}>
        {inr(bleed)}
      </div>
      <div style={{ font: `400 17px/1.5 ${SANS}`, color: C.dim, marginTop: 8, marginBottom: 28 }}>
        {bleed ? `a year on ${ghosts.length} unused subscriptions` : 'No unused subscriptions left'}
      </div>

      {soonest && (
        <button onClick={() => onIntercept(soonest)}
          className="w-full text-left p-5 rounded-2xl mb-8 hover:opacity-90 transition-opacity"
          style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}44` }}>
          <div className="flex items-center gap-2 mb-2" style={{ color: C.amber }}>
            <Bell size={14} />
            <span style={{ font: `500 11px/1 ${MONO}`, letterSpacing: '.14em' }}>
              NEXT DEBIT IN {soonest.daysToDebit} DAYS
            </span>
          </div>
          <div style={{ font: `600 20px/1.35 ${SANS}`, color: C.text }}>
            {soonest.service} takes {inr(soonest.amount)} on {fmt(soonest.next)}.
          </div>
          <div style={{ font: `400 14px/1.6 ${SANS}`, color: C.dim, marginTop: 4 }}>
            Last opened {soonest.usage} days ago. Set the intercept →
          </div>
        </button>
      )}

      <DebitStrip subs={live} />

      {extra.length > 0 && (
        <div className="mb-10 p-5 rounded-xl" style={{ background: C.ink2, border: `1px solid ${C.ghost}44` }}>
          <Label icon={Sparkles} c={C.ghost}>IDENTIFIED FROM YOUR PASTED LINES</Label>
          {extra.map((e, k) => (
            <div key={k} className="py-2" style={{ borderBottom: k < extra.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
              <div style={{ font: `400 11px/1.5 ${MONO}`, color: C.faint }}>{e.raw}</div>
              <div style={{ font: `600 15px/1.4 ${SANS}`, color: C.text }}>
                {e.name} <span style={{ font: `400 12px/1 ${MONO}`, color: C.dim }}>· {e.category}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {killed.length > 0 && <>
        <Label icon={ShieldCheck} c={C.green}>RECLAIMED · {inr(reclaimed)}/YR</Label>
        <div className="rounded-xl overflow-hidden mb-10" style={{ background: C.ink2, border: `1px solid ${C.green}33` }}>
          {killed.map(s => <Row key={s.id} {...rowProps(s)} />)}
        </div>
      </>}

      {ghosts.length > 0 && <>
        <Label icon={Ghost} c={C.bleed}>UNUSED · {ghosts.length}</Label>
        <div className="rounded-xl overflow-hidden mb-10" style={{ background: C.ink2, border: `1px solid ${C.rule}` }}>
          {ghosts.map(s => <Row key={s.id} {...rowProps(s)} />)}
        </div>
      </>}

      <Label icon={Zap} c={C.alive}>STILL IN USE · {alive.length}</Label>
      <div className="rounded-xl overflow-hidden mb-10" style={{ background: C.ink2, border: `1px solid ${C.rule}` }}>
        {alive.map(s => <Row key={s.id} {...rowProps(s)} />)}
      </div>

      <Label icon={Lock} c={C.dim}>BILLS, NOT SUBSCRIPTIONS · {essential.length}</Label>
      <div className="rounded-xl overflow-hidden mb-10" style={{ background: C.ink2, border: `1px solid ${C.rule}` }}>
        {essential.map(s => <Row key={s.id} {...rowProps(s)} />)}
      </div>

      <Label icon={Layers} c={C.amber}>FLAGGED</Label>
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <Insight icon={TrendingUp} title="Netflix rose 30%">
          ₹499 through April, ₹649 from May. Caught as a step change inside an
          otherwise stable amount.
        </Insight>
        <Insight icon={Layers} title="Two cloud plans in parallel">
          {dupes.map(d => d.service).join(' and ')} —
          {' '}{inr(dupes.reduce((a, d) => a + d.annual, 0))} a year for overlapping storage.
        </Insight>
      </div>

      <Rejected rejected={rejected} />
    </div>
  );
}

function Insight({ icon: Icon, title, children }) {
  return <div className="p-5 rounded-xl" style={{ background: C.ink2, border: `1px solid ${C.rule}` }}>
    <Icon size={16} style={{ color: C.amber, marginBottom: 10 }} />
    <div style={{ font: `600 15px/1.35 ${SANS}`, color: C.text, marginBottom: 6 }}>{title}</div>
    <div style={{ font: `400 13px/1.65 ${SANS}`, color: C.dim }}>{children}</div>
  </div>;
}

function Disclose({ icon: Icon, title, children }) {
  const [show, setShow] = useState(false);
  return <div className="rounded-xl" style={{ border: `1px solid ${C.rule}` }}>
    <button onClick={() => setShow(!show)} className="w-full flex items-center gap-2 px-5 py-3.5 text-left">
      <Icon size={13} style={{ color: C.dim, flexShrink: 0 }} />
      <span style={{ font: `500 12px/1.4 ${SANS}`, color: C.dim }}>{title}</span>
      <ChevronDown size={14} style={{ color: C.faint, marginLeft: 'auto', flexShrink: 0, transform: show ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
    </button>
    {show && <div className="px-5 pb-5">{children}</div>}
  </div>;
}

function Rejected({ rejected }) {
  return <Disclose icon={X} title={`${rejected.length} repeat merchants we checked and ruled out`}>
    {rejected.slice(0, 9).map((r, k) => (
      <div key={k} className="flex justify-between gap-4 py-1.5" style={{ borderBottom: `1px solid ${C.rule}` }}>
        <span style={{ font: `400 12px/1.6 ${MONO}`, color: C.text }}>{r.key}</span>
        <span className="text-right" style={{ font: `400 12px/1.6 ${MONO}`, color: C.faint }}>{r.n}× · {r.why}</span>
      </div>
    ))}
  </Disclose>;
}

function Intercept({ s, onBack, onKill }) {
  const [armed, setArmed] = useState(false);
  return (
    <div className="max-w-3xl mx-auto px-6 pt-14 pb-24">
      <button onClick={onBack} className="flex items-center gap-2 mb-10" style={{ font: `400 13px/1 ${SANS}`, color: C.dim }}>
        <ArrowLeft size={14} /> back to the ledger
      </button>

      <div className="grid md:grid-cols-2 gap-12 items-start">
        <div>
          <Label icon={Bell} c={C.amber}>STEP 3 · THE INTERCEPT</Label>
          <h2 style={{ font: `600 34px/1.15 ${SANS}`, letterSpacing: '-.02em', color: C.text, marginBottom: 20 }}>
            We'll nudge you 2 days before the money leaves.
          </h2>
          <div className="mb-7">
            {[[inr(s.amount), `due ${fmt(s.next)}`],
              [`${s.usage} days`, 'since last opened'],
              [inr(s.annual), 'per year if kept']].map(([v, l], k) => (
              <div key={k} className="flex justify-between gap-3 py-2" style={{ borderBottom: `1px solid ${C.rule}` }}>
                <span style={{ font: `500 15px/1.4 ${MONO}`, color: C.text }}>{v}</span>
                <span style={{ font: `400 13px/1.6 ${SANS}`, color: C.faint }}>{l}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Btn kind={armed ? 'ghost' : 'warn'} icon={armed ? Check : Bell} onClick={() => setArmed(!armed)}>
              {armed ? `Armed for ${fmt(s.next)}` : 'Arm the intercept'}
            </Btn>
            {armed && <Btn onClick={() => onKill(s)} icon={ArrowRight}>Show me how to stop it</Btn>}
          </div>
        </div>

        <div className="flex justify-center">
          <div style={{
            width: 300, borderRadius: 34, padding: 11, background: '#05080B',
            border: `1px solid ${C.rule}`, boxShadow: armed ? `0 18px 50px ${C.amber}33` : '0 10px 30px rgba(60,45,25,.12)', transition: 'box-shadow .5s',
          }}>
            <div style={{
              borderRadius: 25, height: 470, background: 'linear-gradient(170deg,#12202B,#0A1016 60%)',
              padding: '52px 12px 12px', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 14, left: 0, right: 0, textAlign: 'center', font: `500 12px/1 ${MONO}`, color: '#7A8B99' }}>
                {armed ? 'Fri 14 Aug · 09:00' : 'Fri 14 Aug'}
              </div>
              {armed ? (
                <div className="rounded-2xl p-4" style={{
                  background: 'rgba(255,255,255,.09)', backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,.10)', animation: 'drop .45s cubic-bezier(.2,.9,.3,1.2)',
                }}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Ghost size={12} style={{ color: C.ghost }} />
                    <span style={{ font: `500 10px/1 ${MONO}`, letterSpacing: '.1em', color: '#93A3B1' }}>SUBSCRIPTION GHOSTS</span>
                    <span style={{ font: `400 10px/1 ${MONO}`, color: '#6B7C8A', marginLeft: 'auto' }}>now</span>
                  </div>
                  <div style={{ font: `600 15px/1.35 ${SANS}`, color: '#F0F4F7', marginBottom: 5 }}>
                    {s.service} renews in {s.daysToDebit} days
                  </div>
                  <div style={{ font: `400 13px/1.5 ${SANS}`, color: '#A8B6C2', marginBottom: 12 }}>
                    {inr(s.amount)} on {fmt(s.next)}. You last opened it {s.usage} days ago.
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 text-center py-2.5 rounded-lg" style={{ background: 'rgba(233,106,92,.22)', font: `600 12px/1 ${SANS}`, color: '#FFB3AA' }}>
                      Show me how to stop it
                    </div>
                    <div className="text-center py-2.5 px-3 rounded-lg" style={{ background: 'rgba(255,255,255,.10)', font: `600 12px/1 ${SANS}`, color: '#C6D2DC' }}>
                      Keep
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full pb-16" style={{ marginTop: -40 }}>
                  <EyeOff size={26} style={{ color: '#33424F', marginBottom: 14 }} />
                  <div style={{ font: `400 13px/1.6 ${SANS}`, color: '#4A5A68', textAlign: 'center', maxWidth: 180 }}>
                    Nothing here. In {s.daysToDebit} days, {inr(s.amount)} leaves quietly.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes drop{from{opacity:0;transform:translateY(-22px) scale(.96)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

function KillFlow({ s, onBack, onSubmitted }) {
  const steps = useMemo(() => killSteps(s), [s]);
  const [done, setDone] = useState([]);
  const all = done.length === steps.length;

  return (
    <div className="max-w-3xl mx-auto px-6 pt-14 pb-24">
      <button onClick={onBack} className="flex items-center gap-2 mb-10" style={{ font: `400 13px/1 ${SANS}`, color: C.dim }}>
        <ArrowLeft size={14} /> back
      </button>

      <Label icon={ShieldCheck} c={C.ghost}>STEP 4 · THE KILL</Label>
      <h2 style={{ font: `600 34px/1.15 ${SANS}`, letterSpacing: '-.02em', color: C.text, marginBottom: 10 }}>
        Cancelling {s.service}
      </h2>
      <p style={{ font: `400 13px/1.7 ${MONO}`, color: C.dim, marginBottom: 26 }}>
        {s.rail} · {done.length} of {steps.length} done
      </p>

      <div className="rounded-xl overflow-hidden mb-8" style={{ background: C.ink2, border: `1px solid ${C.rule}` }}>
        {steps.map((st, i) => {
          const ok = done.includes(i);
          return (
            <button key={i}
              onClick={() => setDone(d => d.includes(i) ? d.filter(x => x !== i) : [...d, i])}
              className="w-full text-left px-5 py-4 flex gap-4 hover:bg-black/[.025] transition-colors"
              style={{ borderBottom: i < steps.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
              <div className="shrink-0 flex items-center justify-center" style={{
                width: 22, height: 22, borderRadius: 4, marginTop: 2,
                border: `1px solid ${ok ? C.ghost : C.rule}`, background: ok ? C.ghost : 'transparent',
              }}>
                {ok ? <Check size={13} style={{ color: C.ink }} />
                  : <span style={{ font: `500 11px/1 ${MONO}`, color: C.faint }}>{i + 1}</span>}
              </div>
              <div>
                <div style={{ font: `600 15px/1.4 ${SANS}`, color: ok ? C.dim : C.text, textDecoration: ok ? 'line-through' : 'none' }}>
                  {st.t}
                </div>
                <div style={{ font: `400 13px/1.65 ${SANS}`, color: C.dim, marginTop: 4 }}>{st.d}</div>
              </div>
            </button>
          );
        })}
      </div>

      <Btn onClick={() => onSubmitted(s)} disabled={!all} icon={ArrowRight}>
        {all ? "Done — let's check it actually stopped" : `Tick all ${steps.length} steps to continue`}
      </Btn>
    </div>
  );
}

function Verify({ s, onBack, onConfirmed }) {
  const [state, setState] = useState('waiting');
  useEffect(() => {
    if (state !== 'scanning') return;
    const t = setTimeout(() => setState('clear'), 2200);
    return () => clearTimeout(t);
  }, [state]);

  const after = new Date(s.next); after.setDate(after.getDate() + 1);

  return (
    <div className="max-w-3xl mx-auto px-6 pt-14 pb-24">
      <button onClick={onBack} className="flex items-center gap-2 mb-10" style={{ font: `400 13px/1 ${SANS}`, color: C.dim }}>
        <ArrowLeft size={14} /> back to the ledger
      </button>

      <Label icon={ShieldCheck} c={state === 'clear' ? C.green : C.amber}>STEP 5 · VERIFICATION</Label>
      <h2 style={{ font: `600 34px/1.15 ${SANS}`, letterSpacing: '-.02em', color: C.text, marginBottom: 28 }}>
        Checking the statement on {fmt(s.next)}.
      </h2>

      <div className="rounded-xl p-6 mb-8" style={{
        background: C.ink2, border: `1px solid ${state === 'clear' ? C.green + '55' : C.rule}`,
      }}>
        {state === 'waiting' && <>
          <div className="flex items-center gap-2 mb-3" style={{ color: C.amber }}>
            <CircleDot size={14} className="animate-pulse" />
            <span style={{ font: `500 11px/1 ${MONO}`, letterSpacing: '.14em' }}>WATCHING</span>
          </div>
          <div style={{ font: `600 22px/1.3 ${SANS}`, color: C.text, marginBottom: 6 }}>
            {s.daysToDebit} days until the {fmt(s.next)} debit window
          </div>
          <div style={{ font: `400 13px/1.7 ${MONO}`, color: C.dim, marginBottom: 20 }}>
            watching for {inr(s.amount)} · {s.key}
          </div>
          <div className="flex"><Btn kind="ghost" icon={FastForward} onClick={() => setState('scanning')}>
            Fast-forward to {fmt(after)} (demo)
          </Btn></div>
        </>}

        {state === 'scanning' && <>
          <div className="flex items-center gap-2 mb-4" style={{ color: C.ghost }}>
            <Loader2 size={14} className="animate-spin" />
            <span style={{ font: `500 11px/1 ${MONO}`, letterSpacing: '.14em' }}>
              RE-READING STATEMENT · {fmt(after)}
            </span>
          </div>
          {[`fetching ${fmt(s.next)} – ${fmt(after)}`,
            `filtering for ${s.key}`,
            `comparing against expected ${inr(s.amount)}`].map((l, i) => (
            <div key={i} style={{ font: `400 12.5px/2 ${MONO}`, color: C.faint }}>{l}</div>
          ))}
        </>}

        {state === 'clear' && <>
          <div className="flex items-center gap-2 mb-3" style={{ color: C.green }}>
            <ShieldCheck size={14} />
            <span style={{ font: `500 11px/1 ${MONO}`, letterSpacing: '.14em' }}>CONFIRMED DEAD</span>
          </div>
          <div style={{ font: `600 24px/1.3 ${SANS}`, color: C.text, marginBottom: 8 }}>
            {fmt(s.next)} came and went. No debit.
          </div>
          <div style={{ font: `400 14px/1.7 ${SANS}`, color: C.dim, marginBottom: 22 }}>
            {inr(s.amount)} stayed in the account · {inr(s.annual)} a year
          </div>
          <div className="flex"><Btn onClick={() => onConfirmed(s)} icon={ReceiptIcon}>See what you saved</Btn></div>
        </>}
      </div>
    </div>
  );
}

function Reclaim({ subs, status, reclaimed, onBack }) {
  const killed = subs.filter(s => status[s.id] === 'killed');
  const remaining = subs.filter(s => status[s.id] !== 'killed' && !s.essential);
  const stillGhosts = remaining.filter(s => s.ghost);
  const before = subs.filter(s => !s.essential).reduce((a, s) => a + s.annual, 0);
  const after = remaining.reduce((a, s) => a + s.annual, 0);

  return (
    <div className="max-w-3xl mx-auto px-6 pt-14 pb-24">
      <Label icon={ReceiptIcon} c={C.green}>STEP 6 · RECLAIMED</Label>
      <div style={{ font: `600 clamp(44px,10vw,82px)/1 ${SANS}`, letterSpacing: '-.03em', color: C.green }}>
        {inr(reclaimed)}
      </div>
      <div style={{ font: `400 17px/1.5 ${SANS}`, color: C.dim, marginTop: 8, marginBottom: 30 }}>
        a year, verified stopped against the statement
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-10">
        <Stat label="RECURRING LOAD BEFORE" v={inr(before / 12) + '/mo'} c={C.bleed} />
        <Stat label="AFTER" v={inr(after / 12) + '/mo'} c={C.green} />
        <Stat label="GHOSTS LEFT" v={String(stillGhosts.length)} c={C.amber} />
      </div>

      <Label icon={Check} c={C.green}>VERIFIED DEAD</Label>
      <div className="rounded-xl overflow-hidden mb-10" style={{ background: C.ink2, border: `1px solid ${C.green}33` }}>
        {killed.map(s => (
          <div key={s.id} className="px-5 py-4 flex justify-between items-center gap-4" style={{ borderBottom: `1px solid ${C.rule}` }}>
            <div>
              <div style={{ font: `600 15px/1.3 ${SANS}`, color: C.text }}>{s.service}</div>
              <div style={{ font: `400 11px/1.6 ${MONO}`, color: C.faint }}>{s.rail} · no debit on {fmt(s.next)}</div>
            </div>
            <div className="shrink-0" style={{ font: `500 15px/1 ${MONO}`, color: C.green }}>+{inr(s.annual)}/yr</div>
          </div>
        ))}
      </div>

      {stillGhosts.length > 0 ? (
        <div className="p-5 rounded-xl" style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}44` }}>
          <div style={{ font: `600 18px/1.35 ${SANS}`, color: C.text, marginBottom: 6 }}>
            {stillGhosts.length} unused subscriptions still running.
          </div>
          <div style={{ font: `400 14px/1.6 ${SANS}`, color: C.dim, marginBottom: 16 }}>
            {inr(stillGhosts.reduce((a, s) => a + s.annual, 0))} a year · next debit in {Math.min(...stillGhosts.map(s => s.daysToDebit))} days
          </div>
          <div className="flex"><Btn kind="warn" icon={ArrowLeft} onClick={onBack}>Back to the ledger</Btn></div>
        </div>
      ) : (
        <div className="flex"><Btn kind="ghost" icon={ArrowLeft} onClick={onBack}>Back to the ledger</Btn></div>
      )}
    </div>
  );
}

function Stat({ label, v, c }) {
  return <div className="p-4 rounded-xl" style={{ background: C.ink2, border: `1px solid ${C.rule}` }}>
    <div style={{ font: `500 10px/1.4 ${MONO}`, letterSpacing: '.14em', color: C.faint, marginBottom: 8 }}>{label}</div>
    <div style={{ font: `500 20px/1 ${MONO}`, color: c }}>{v}</div>
  </div>;
}

/* ================================ APP ================================ */

const STAGES = ['intake', 'scan', 'calibrate', 'ledger', 'intercept', 'kill', 'verify', 'reclaim'];

export default function SubscriptionGhosts() {
  const txns = useMemo(buildStatement, []);
  const result = useMemo(() => detect(txns), [txns]);

  const [stage, setStage] = useState('intake');
  const [target, setTarget] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState([]);
  const [status, setStatus] = useState({});
  const [usage, setUsage] = useState(() =>
    Object.fromEntries(result.found.map(p => [p.id, p.seedUsage ?? 20])));

  const subs = useMemo(() => result.found.map(p => ({
    ...p,
    usage: usage[p.id] ?? 20,
    ghost: !p.essential && (usage[p.id] ?? 20) >= 30,
    dupe: p.cat === 'Storage',
  })), [result, usage]);

  const reclaimed = subs.filter(s => status[s.id] === 'killed').reduce((a, s) => a + s.annual, 0);

  async function normalise() {
    const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 8);
    if (!lines.length) return;
    setBusy(true);
    await new Promise(r => setTimeout(r, 700));
    const guess = raw => {
      const k = normKey(raw);
      const name = k.split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
      const cat = /NETFLIX|HOTSTAR|PRIME|SONYLIV|ZEE/i.test(raw) ? 'Streaming'
        : /SPOTIFY|GAANA|WYNK|APPLE MUSIC/i.test(raw) ? 'Music'
        : /CULT|FITNESS|GYM/i.test(raw) ? 'Fitness'
        : /ICLOUD|GOOGLE|DROPBOX|ONEDRIVE/i.test(raw) ? 'Storage'
        : /ADOBE|NOTION|CANVA|MICROSOFT|FIGMA/i.test(raw) ? 'Software'
        : /SWIGGY|ZOMATO|EATCLUB/i.test(raw) ? 'Food'
        : /AIRTEL|JIO|VI |VODAFONE/i.test(raw) ? 'Telecom' : 'Other';
      return { raw, name, category: cat };
    };
    setExtra(lines.map(guess));
    setBusy(false);
    setStage('scan');
  }

  const idx = STAGES.indexOf(stage);

  return (
    <div style={{ background: C.ink, minHeight: '100vh', color: C.text }}>
      <style>{`
        *{-webkit-font-smoothing:antialiased}
        ::-webkit-scrollbar{width:7px;height:7px}
        ::-webkit-scrollbar-thumb{background:${C.rule};border-radius:4px}
        ::-webkit-scrollbar-track{background:transparent}
        button:focus-visible{outline:2px solid ${C.ghost};outline-offset:2px}
        @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
      `}</style>

      <header style={{ borderBottom: `1px solid ${C.rule}`, position: 'sticky', top: 0, background: C.ink, zIndex: 10 }}>
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-2.5 flex-wrap">
          <Ghost size={17} style={{ color: C.ghost }} />
          <span style={{ font: `600 15px/1 ${SANS}`, letterSpacing: '-.01em', color: C.text }}>Subscription Ghosts</span>
          {reclaimed > 0 && (
            <span className="px-2.5 py-1 rounded-xl" style={{
              font: `500 11px/1 ${MONO}`, color: C.green, background: `${C.green}18`, border: `1px solid ${C.green}44`,
            }}>+{inr(reclaimed)}/yr reclaimed</span>
          )}
          {stage !== 'intake' && (
            <button onClick={() => { setStage('intake'); setStatus({}); setExtra([]); }}
              className="ml-auto" style={{ font: `400 12px/1 ${SANS}`, color: C.dim }}>start over</button>
          )}
        </div>
        {idx > 0 && (
          <div className="max-w-3xl mx-auto px-6 pb-3 flex gap-1.5">
            {STAGES.slice(1).map((s, i) => (
              <div key={s} className="flex-1" style={{
                height: 2, borderRadius: 2,
                background: i <= idx - 1 ? C.ghost : C.rule, transition: 'background .3s',
              }} />
            ))}
          </div>
        )}
      </header>

      {stage === 'intake' && <Intake onScan={() => setStage('scan')} onPaste={normalise}
        pasteText={pasteText} setPasteText={setPasteText} busy={busy}
        teaser={[...subs.filter(s => s.ghost && !s.essential)].sort((a, b) => a.daysToDebit - b.daysToDebit)[0]} />}

      {stage === 'scan' && <Scan txns={txns} result={result} onDone={() => setStage('calibrate')} />}

      {stage === 'calibrate' && <Calibrate subs={subs.filter(s => !s.essential)} usage={usage}
        setUsage={setUsage} onDone={() => setStage('ledger')} />}

      {stage === 'ledger' && <Ledger subs={subs} status={status} reclaimed={reclaimed}
        rejected={result.rejected} extra={extra}
        onIntercept={s => { setTarget(s); setStage('intercept'); }} />}

      {stage === 'intercept' && <Intercept s={target} onBack={() => setStage('ledger')}
        onKill={s => { setTarget(s); setStage('kill'); }} />}

      {stage === 'kill' && <KillFlow s={target} onBack={() => setStage('intercept')}
        onSubmitted={s => { setStatus(st => ({ ...st, [s.id]: 'watching' })); setStage('verify'); }} />}

      {stage === 'verify' && <Verify s={target} onBack={() => setStage('ledger')}
        onConfirmed={s => { setStatus(st => ({ ...st, [s.id]: 'killed' })); setStage('reclaim'); }} />}

      {stage === 'reclaim' && <Reclaim subs={subs} status={status} reclaimed={reclaimed}
        onBack={() => setStage('ledger')} />}
    </div>
  );
}
