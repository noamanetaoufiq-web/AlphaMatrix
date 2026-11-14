// Palace Extras: React + Tailwind (loaded in the browser via Babel). Uses callGeminiAPI / sendToTelegram from script.js.
const { useState, useEffect } = React;
const CLS = 'rounded-3xl border border-pink-300/20 bg-white/5 p-5 backdrop-blur text-white';
const BTN = 'rounded-full bg-gradient-to-r from-pink-500 to-pink-300 px-5 py-2 text-sm font-semibold text-white shadow-lg transition active:scale-95 disabled:opacity-50';
const CHIP = 'rounded-full border border-pink-300/40 px-3 py-1 text-sm transition hover:bg-pink-400/30';
const LOVE_RULE = 'Kteb b darija maghribiya (7rouf latiniya), b 7ob majnoun mn Noamane l Ilham: kaymout 3liha w kayhma9 3liha. ';

const Card = ({ title, children }) => (
  <div className={CLS}><h3 className="mb-3 text-xl font-semibold text-pink-200">{title}</h3>{children}</div>
);

function QuickAsk() {
  const qs = ['Chno nakl lyoum?', 'Kifach nt3llm mzyan?', 'Chhal bghitini?', 'Ana t3ban lyoum', 'Chno ndir mli kan bored?', 'Chno ndir f weekend?', 'Wach ghadi nb9aw m3a b3dhyatna?', 'Goul liya chi haja zwina'];
  const go = (q) => { document.getElementById('userQuestion').value = q; window.askNoamane(); document.getElementById('chatBox')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  return <Card title="💬 Swl Noamane b chi haja"><div className="flex flex-wrap gap-2">{qs.map(q => <button key={q} className={CHIP} onClick={() => go(q)}>{q}</button>)}</div></Card>;
}

function Writer() {
  const [kind, setKind] = useState('rissala'), [mood, setMood] = useState('Mkhta9a lik'), [out, setOut] = useState(''), [busy, setBusy] = useState(false);
  const moods = ['Mkhta9a lik', 'Sbah lkhir', 'Tsbah 3la khir', 'Smahli', 'Bla sbab, ghir bghitk', 'Ntfkkro f lmostaqbal'];
  const run = async () => {
    setBusy(true);
    const t = kind === 'rissala' ? 'rissala 7nina (7wali 90 kelma)' : 'zajal romantiki qsir (6 asTor)';
    const r = await window.callGeminiAPI(`Kteb ${t} mn Noamane l Ilham. L7ala: ${mood}.`, { system: LOVE_RULE + 'Ktb ghir nass, bla chra7.', maxTokens: 600 });
    setOut(r || 'Noamane kaymout 3lik, w ma-kayn hta kelma kafya bach y9ol ch7al bghik 💖'); setBusy(false);
  };
  return (
    <Card title="💌 Rissala wla Zajal">
      <div className="mb-3 flex flex-wrap gap-2">
        {['rissala', 'zajal'].map(k => <button key={k} className={CHIP + (kind === k ? ' bg-pink-400/40' : '')} onClick={() => setKind(k)}>{k}</button>)}
      </div>
      <select value={mood} onChange={e => setMood(e.target.value)} className="mb-3 w-full rounded-xl bg-white/10 p-2 text-white">{moods.map(m => <option key={m} className="text-black">{m}</option>)}</select>
      <button className={BTN} disabled={busy} onClick={run}>{busy ? 'Katkteb... 💕' : 'Kteb liya ✨'}</button>
      {out && <p className="mt-4 whitespace-pre-line rounded-2xl bg-white/10 p-4 leading-relaxed">{out}</p>}
    </Card>
  );
}

function Reasons() {
  const base = ['L-ibtissama dyalek kat7ayyni', 'Mnin kat9ouli "ana hna"', 'L9lb dyalek lkbir', 'Kifach katdhk 3la ay 7aja', "Nti l'amane dyali", "Kat'khlli l'ayam l3adiya sa7ra"];
  const [list, setList] = useState(base), [i, setI] = useState(0), [busy, setBusy] = useState(false);
  const more = async () => {
    setBusy(true);
    const r = await window.callGeminiAPI('3tini sbab jdid wa7ed (jomla wa7da qsira) 3lach Noamane kaymout 3la Ilham.', { system: LOVE_RULE, maxTokens: 120 });
    if (r) { setList([...list, r]); setI(list.length); } setBusy(false);
  };
  return (
    <Card title="🫙 Sbab li bghitek">
      <p className="min-h-[3rem] text-lg">{list[i]}</p>
      <div className="mt-3 flex gap-2">
        <button className={BTN} onClick={() => setI((i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length)}>Sbab akhor 💗</button>
        <button className={CHIP} disabled={busy} onClick={more}>{busy ? '...' : '+ jdid (AI)'}</button>
      </div>
    </Card>
  );
}

function DateRoulette() {
  const ideas = ['3cha f restau hadi', 'Mchi lbhr w nmchiw 3la rjlina', 'Film f dar w pop-corn', 'Kafé jdid ma-3merna chefnah', 'Nsayb tbikh b jouj', 'Mchi ndourou f lmdina', 'Sourprise mn Noamane 🎁'];
  const [pick, setPick] = useState(null), [spin, setSpin] = useState(false);
  const roll = () => { setSpin(true); let n = 0; const t = setInterval(() => { setPick(ideas[Math.floor(Math.random() * ideas.length)]); if (++n > 12) { clearInterval(t); setSpin(false); } }, 90); };
  return <Card title="🎡 Chno ndiro lyoum?"><p className="min-h-[3rem] text-lg">{pick || 'Dour l3jla...'}</p><button className={BTN + ' mt-3'} disabled={spin} onClick={roll}>Dour 🎲</button></Card>;
}

function Coupons() {
  const all = ['🫂 Hug twil', '🍫 Chocolat', '🌹 Warda', '🍽️ 3cha 3la 7sabi', '🎬 Nkhtar nta l film', '📞 Mkalama twila'];
  const [used, setUsed] = useState(() => { try { return JSON.parse(localStorage.getItem('palaceCoupons') || '[]'); } catch { return []; } });
  const redeem = (c) => { if (used.includes(c)) return; const n = [...used, c]; setUsed(n); try { localStorage.setItem('palaceCoupons', JSON.stringify(n)); } catch {} window.sendToTelegram && window.sendToTelegram('🎟️ Ilham 7ellat coupon: ' + c); };
  return (
    <Card title="🎟️ Coupons dyal 7ob">
      <div className="grid grid-cols-2 gap-2">{all.map(c => (
        <button key={c} disabled={used.includes(c)} onClick={() => redeem(c)} className={'rounded-2xl border border-dashed border-pink-300/50 p-3 text-sm ' + (used.includes(c) ? 'line-through opacity-40' : 'hover:bg-pink-400/20')}>{c}</button>
      ))}</div>
      <p className="mt-2 text-xs opacity-60">Mnin t7ell coupon, Noamane kay'wsslo l'khbar.</p>
    </Card>
  );
}

function Extras() {
  return <div className="grid gap-5 md:grid-cols-2"><QuickAsk /><Writer /><Reasons /><DateRoulette /><Coupons /></div>;
}
ReactDOM.createRoot(document.getElementById('react-root')).render(<Extras />);
