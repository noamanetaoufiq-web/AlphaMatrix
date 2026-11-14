// Private chat + notifications + moods (needs Firebase Auth login from the gate)
(() => {
  const NAMES = { ilhamati: 'Ilham', noamane: 'Noamane' };
  const MOODS = {
    happy:   { e: '😊', c: '#facc15', ex: '😊✨🌞', t: 'fr7an(a) / happy' },
    loved:   { e: '🥰', c: '#ff6b9d', ex: '🥰💖💕', t: 'kat7ess b l7ob / feeling loved' },
    missing: { e: '🥺', c: '#f472b6', ex: '🥺💭💌', t: 'wahchak / misses you' },
    sad:     { e: '😢', c: '#60a5fa', ex: '😢💔🌧️', t: 'm7zoun(a) / sad' },
    angry:   { e: '😡', c: '#ef4444', ex: '😡💢🔥👿', t: 'm3sbba / angry' },
    sleepy:  { e: '😴', c: '#a78bfa', ex: '😴🌙💤', t: 'n3san(a) / sleepy' }
  };
  const EMOJIS = ['❤️','😘','🥰','😍','😂','🥺','😢','😡','🤗','😴','🔥','💋','🌹','✨','🙏','💔','🫶','😭','🤍','🧸'];
  let me = null, other = null, uid = null, panelOpen = false, unread = 0, loaded = false;
  const db = () => firebase.database();
  const $ = (id) => document.getElementById(id);
  const mk = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt) e.textContent = txt; return e; };

  const style = document.createElement('style');
  style.textContent = `
  #pcBtn{position:fixed;left:14px;bottom:14px;z-index:9998;width:56px;height:56px;border-radius:50%;border:0;background:linear-gradient(135deg,#ff6b9d,#ffb6c1);font-size:26px;cursor:pointer;box-shadow:0 8px 24px #0008}
  #pcBadge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:999px;font-size:.7rem;padding:2px 6px;display:none}
  #pcPanel{position:fixed;left:10px;bottom:80px;z-index:9998;width:min(360px,calc(100vw - 20px));height:min(520px,70vh);background:#1a0a2e;border:1px solid #ff6b9d;border-radius:18px;display:none;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px #000b;color:#fff;font-family:inherit}
  #pcPanel.open{display:flex}
  #pcMsgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px}
  .pcm{max-width:80%;padding:8px 12px;border-radius:14px;font-size:.92rem;word-break:break-word}
  .pcm.me{align-self:flex-end;background:linear-gradient(135deg,#ff6b9d,#ffb6c1);color:#2a0a1e}
  .pcm.them{align-self:flex-start;background:#4a3558}
  .pcm small{display:block;opacity:.6;font-size:.65rem;margin-top:2px}
  #pcBar{display:flex;flex-wrap:wrap;gap:2px;padding:4px 8px;border-top:1px solid #ff6b9d33}
  #pcBar button,#pcMood button{background:none;border:0;font-size:1.25rem;cursor:pointer;padding:2px 4px}
  #pcMood{display:flex;justify-content:space-around;padding:6px;border-bottom:1px solid #ff6b9d33}
  #pcMood button.sel{background:#ff6b9d44;border-radius:10px}
  #pcRow{display:flex;gap:6px;padding:8px}
  #pcIn{flex:1;border-radius:20px;border:1px solid #ff6b9d88;background:#2a1540;color:#fff;padding:8px 12px;font-size:1rem}
  #pcSend{border:0;border-radius:20px;background:#ff6b9d;color:#fff;padding:0 14px;cursor:pointer}
  #pcBanner{position:fixed;top:0;left:0;right:0;z-index:9997;text-align:center;padding:6px 10px;font-size:.9rem;color:#fff;display:none;letter-spacing:.05em}
  #pcGlow{position:fixed;inset:0;z-index:9996;pointer-events:none;transition:box-shadow .6s}`;
  document.head.appendChild(style);

  function build() {
    const btn = mk('button'); btn.id = 'pcBtn'; btn.textContent = '💬'; btn.setAttribute('aria-label', 'Chat');
    const badge = mk('span'); badge.id = 'pcBadge'; btn.appendChild(badge);
    const panel = mk('div'); panel.id = 'pcPanel';
    const mood = mk('div'); mood.id = 'pcMood';
    Object.entries(MOODS).forEach(([k, m]) => { const b = mk('button', '', m.e); b.title = m.t; b.dataset.k = k; b.onclick = () => setMood(k); mood.appendChild(b); });
    const msgs = mk('div'); msgs.id = 'pcMsgs';
    const bar = mk('div'); bar.id = 'pcBar';
    const row = mk('div'); row.id = 'pcRow';
    const inp = mk('input'); inp.id = 'pcIn'; inp.placeholder = 'Ktb hna / Write here…'; inp.maxLength = 900;
    const send = mk('button'); send.id = 'pcSend'; send.textContent = 'Send 💌';
    EMOJIS.forEach(e => { const b = mk('button', '', e); b.onclick = () => { inp.value += e; inp.focus(); }; bar.appendChild(b); });
    const go = () => { const t = inp.value.trim(); if (t) { api.send(t); inp.value = ''; } };
    send.onclick = go; inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    row.append(inp, send); panel.append(mood, msgs, bar, row);
    const banner = mk('div'); banner.id = 'pcBanner'; const glow = mk('div'); glow.id = 'pcGlow';
    document.body.append(btn, panel, banner, glow);
    btn.onclick = () => { panelOpen = !panelOpen; panel.classList.toggle('open', panelOpen); if (panelOpen) { unread = 0; badge.style.display = 'none'; localStorage.setItem('pcRead', Date.now()); askNotif(); msgs.scrollTop = msgs.scrollHeight; } };
  }

  function askNotif() { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
  async function notify(from, text) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const o = { body: text, icon: 'icon.png', tag: 'palace-chat', vibrate: [120, 60, 120] };
    try { const r = await navigator.serviceWorker?.ready; if (r) return r.showNotification('💌 ' + (NAMES[from] || from), o); } catch {}
    try { new Notification('💌 ' + (NAMES[from] || from), o); } catch {}
  }

  function addMsg(m) {
    const box = $('pcMsgs'); if (!box) return;
    const mine = m.uid === uid;
    const d = mk('div', '', ''); d.className = 'pcm ' + (mine ? 'me' : 'them'); d.textContent = m.text;
    const s = mk('small', '', new Date(m.t || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })); d.appendChild(s);
    box.appendChild(d); box.scrollTop = box.scrollHeight;
    if (!mine && loaded) {
      if (!panelOpen) { unread++; const b = $('pcBadge'); b.textContent = unread; b.style.display = 'block'; }
      if (!panelOpen || document.hidden) notify(m.from, m.text);
    }
  }

  function showMood(m, who) {          // m = partner's mood
    const ban = $('pcBanner'), glow = $('pcGlow'); if (!ban) return;
    const d = MOODS[m && m.k];
    if (!d) { ban.style.display = 'none'; glow.style.boxShadow = 'none'; return; }
    ban.style.display = 'block'; ban.style.background = d.c + 'dd';
    ban.textContent = `${d.ex} ${NAMES[who]}: ${d.t} ${d.ex}`;
    glow.style.boxShadow = m.k === 'angry' || m.k === 'sad' ? `inset 0 0 90px ${d.c}aa` : `inset 0 0 50px ${d.c}55`;
    document.body.style.paddingTop = '30px';
  }
  function setMood(k) {
    db().ref('mood/' + me).set({ k, t: firebase.database.ServerValue.TIMESTAMP });
    document.querySelectorAll('#pcMood button').forEach(b => b.classList.toggle('sel', b.dataset.k === k));
  }

  const api = {
    ready: false,
    async send(text) {
      if (!me) return { ok: false, error: 'not logged in' };
      try { await db().ref('chats/main').push({ from: me, uid, text: String(text).slice(0, 900), t: firebase.database.ServerValue.TIMESTAMP }); return { ok: true }; }
      catch (e) { return { ok: false, error: e.message }; }
    }
  };
  window.palaceChat = api;

  function start(u) {
    uid = u.uid; me = u.email.split('@')[0]; other = me === 'noamane' ? 'ilhamati' : 'noamane';
    if (!$('pcBtn')) build();
    const ref = db().ref('chats/main').orderByChild('t').limitToLast(100);
    ref.once('value').then((s) => {
      s.forEach(c => addMsg(c.val()));
      const readAt = +localStorage.getItem('pcRead') || 0, fresh = [];
      s.forEach(c => { const v = c.val(); if (v.uid !== uid && v.t > readAt) fresh.push(v); });
      if (fresh.length) { unread = fresh.length; const b = $('pcBadge'); b.textContent = unread; b.style.display = 'block'; notify(other, fresh.length === 1 ? fresh[0].text : `${fresh.length} messages jdad 💌`); }
      loaded = true; api.ready = true;
      let last = 0; s.forEach(c => { last = Math.max(last, c.val().t || 0); });
      ref.on('child_added', (c) => { const v = c.val(); if ((v.t || Infinity) > last) addMsg(v); }, (e) => console.warn('chat:', e.message));
    }, (e) => console.warn('chat read denied:', e.message));
    db().ref('mood/' + other).on('value', (s) => showMood(s.val(), other));
    db().ref('mood/' + me).once('value').then((s) => { const k = s.val()?.k; document.querySelectorAll('#pcMood button').forEach(b => b.classList.toggle('sel', b.dataset.k === k)); });
  }
  firebase.auth().onAuthStateChanged((u) => { if (u && /@palace\.app$/.test(u.email || '')) start(u); });
})();

// ---- Heart chat: fullscreen toggle + quick chips ----
window.toggleHeartChat = (open) => {
  const c = document.getElementById('askContainer'); if (!c) return;
  c.classList.toggle('full', open); document.body.classList.toggle('heart-open', open);
  if (open) { const b = document.getElementById('chatBox'); b.scrollTop = b.scrollHeight; document.getElementById('userQuestion')?.focus(); }
};
window.heartAsk = (t) => { const i = document.getElementById('userQuestion'); if (!i) return; i.value = t; window.askNoamane?.(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.toggleHeartChat(false); });
