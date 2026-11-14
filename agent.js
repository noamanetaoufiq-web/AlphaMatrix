// Noamane's Heart: AI agent with chat memory, photo/video input, and tools that control the site.
(() => {
  const HIST_KEY = 'ilhamChatHistory', MEM_KEY = 'palaceMemories';
  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  let history = jget(HIST_KEY, []);
  let pending = null;      // media attached to the next message
  let turnMedia = null;    // media of the turn being processed (for save_memory)
  let lastSend = 0;
  const ERR = []; const logErr = (m) => { ERR.push(m); if (ERR.length > 8) ERR.shift(); };

  const SECTIONS = { home: 'home', gallery: 'gallery', memories: 'gallery', journey: 'timeline', timeline: 'timeline', notes: 'love-notes', games: 'games', dreams: 'bucket-list', extras: 'extras' };
  const TOOL_RULES = `
Nta 3ndk 7ta l'adawat bach tkhdem f site kaml:
- play_music: ila talbat ay ghnia wla fannan, dkhel smiyt-ha b7al ma ktbat (kat'tl9a'ha f YouTube).
- save_memory: ila 3tatk tswira w golat "7ettha f memories/dhkriyat/gallery", 7ettha m3a caption zwin b darija.
- send_to_noamane: ila golat "sifet l Noamane / goul lih / send miss you" -> sift rissala 9sira w 7nina mn 3and Ilham.
- add_love_note: ila bghat tzid chi note f Love Notes.
- open_section: ila bghat tchouf chi qism mn site.
Fhem l'awamir 7ta ila kant fihom ghalat f l7rouf (b7al 'memry' wla 'hatha f our memry'). Ma-tkhdem adat ila ma-talbatch. Mnin tkhdem adat, jawb b jomla 7nina kima ila nta dertha. Ila 3tatk tswira wla video, 3lleq 3liha b 7ob w b tafasil li chftiha.`;

  const S = (d) => ({ type: 'STRING', description: d });
  const TOOLS = [{ functionDeclarations: [
    { name: 'play_music', description: 'Play a song from the site soundtrack', parameters: { type: 'OBJECT', properties: { song: S('song name or part of it') } } },
    { name: 'save_memory', description: 'Save the photo Ilham just attached into the Memories gallery', parameters: { type: 'OBJECT', properties: { caption: S('short caption in Darija') }, required: ['caption'] } },
    { name: 'send_to_noamane', description: 'Send a short message to Noamane on Telegram', parameters: { type: 'OBJECT', properties: { message: S('the message') }, required: ['message'] } },
    { name: 'add_love_note', description: 'Add a note to the Love Notes section', parameters: { type: 'OBJECT', properties: { text: S('note text') }, required: ['text'] } },
    { name: 'open_section', description: 'Scroll the site to a section', parameters: { type: 'OBJECT', properties: { section: S('home, gallery, memories, journey, notes, games, dreams, extras') }, required: ['section'] } }
  ] }];

  // ---------- site actions ----------
  function showPlayer(id, title, query) {
    let box = document.getElementById('aiPlayer');
    if (!box) {
      box = document.createElement('div'); box.id = 'aiPlayer';
      box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;background:#1a0a2e;border:1px solid #ff6b9d;border-radius:16px;padding:8px;box-shadow:0 8px 30px #000a;max-width:280px';
      document.body.appendChild(box);
    }
    box.innerHTML = '';
    const bar = document.createElement('div'); bar.style.cssText = 'display:flex;justify-content:space-between;gap:8px;color:#ffb6c1;font-size:.8rem;margin-bottom:6px';
    const t = document.createElement('span'); t.textContent = '🎵 ' + title;
    const x = document.createElement('button'); x.textContent = '✕'; x.style.cssText = 'background:none;border:0;color:#fff;cursor:pointer'; x.onclick = () => box.remove();
    bar.append(t, x); box.append(bar);
    if (id) {
      const f = document.createElement('iframe'); f.width = 260; f.height = 150; f.allow = 'autoplay; encrypted-media'; f.style.border = '0';
      f.src = `https://www.youtube.com/embed/${id}?autoplay=1`; box.append(f);
    }
    const link = document.createElement('a'); link.target = '_blank'; link.rel = 'noopener'; link.style.cssText = 'display:block;color:#fff;font-size:.8rem;margin-top:6px;text-decoration:underline';
    link.href = id ? `https://www.youtube.com/watch?v=${id}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    link.textContent = id ? '↗ Fte7 f YouTube' : '↗ Chouf nata2ij f YouTube'; box.append(link);
  }
  // Search YouTube for any song. Uses the YouTube Data API if a key is in config.js, else public Invidious/Piped mirrors.
  const withTimeout = (url, ms = 5000) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return fetch(url, { signal: c.signal }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }); };
  async function searchYouTube(q) {
    const e = encodeURIComponent(q);
    if (CFG.youtube) {
      try { const d = await withTimeout(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=1&q=${e}&key=${CFG.youtube}`);
        const it = d.items?.[0]; if (it) return { id: it.id.videoId, title: it.snippet.title }; } catch (err) { logErr('youtube api: ' + err.message); }
    }
    const inv = (base) => withTimeout(`${base}/api/v1/search?q=${e}&type=video`).then(d => { const v = d.find(x => x.videoId); if (!v) throw 0; return { id: v.videoId, title: v.title }; });
    const piped = (base) => withTimeout(`${base}/search?q=${e}&filter=videos`).then(d => { const v = d.items?.find(x => x.url); if (!v) throw 0; return { id: v.url.split('v=')[1], title: v.title }; });
    try { return await Promise.any([inv('https://inv.nadeko.net'), inv('https://yewtu.be'), inv('https://invidious.nerdvpn.de'), piped('https://pipedapi.kavin.rocks'), piped('https://api.piped.private.coffee')]); }
    catch { return null; }
  }
  // Memories live in Firebase (shared across devices); localStorage is only an offline backup.
  let cloudMem = null;
  const memRef = () => (typeof database !== 'undefined' ? database.ref('memories') : null);
  const memList = () => cloudMem ?? jget(MEM_KEY, []);
  function listenMemories() {
    const r = memRef(); if (!r) return;
    r.on('value', (s) => { cloudMem = Object.values(s.val() || {}).sort((x, y) => x.date - y.date); renderMemories(); }, (e) => logErr('firebase memories: ' + e.message));
  }
  function renderMemories() {
    const grid = document.querySelector('#gallery .gallery-grid'); if (!grid) return;
    grid.querySelectorAll('.ai-memory').forEach(n => n.remove());
    memList().forEach(m => {
      const d = document.createElement('div'); d.className = 'gallery-item ai-memory'; d.style.cssText = 'position:relative;overflow:hidden;min-height:220px;cursor:pointer';
      const img = document.createElement('img'); img.src = m.img; img.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0';
      const cap = document.createElement('p'); cap.textContent = m.caption; cap.style.cssText = 'position:absolute;bottom:0;left:0;right:0;margin:0;padding:8px;background:#000a;color:#fff;font-size:.85rem';
      d.append(img, cap);
      d.onclick = (e) => {
        e.stopPropagation();
        const c = document.getElementById('lightboxContent'); c.innerHTML = '';
        const big = document.createElement('img'); big.src = m.img; big.style.cssText = 'max-width:90vw;max-height:80vh;border-radius:16px';
        const p = document.createElement('p'); p.textContent = m.caption; p.style.cssText = 'color:#fff;text-align:center;margin-top:10px';
        c.append(big, p); document.getElementById('lightbox').classList.add('active');
      };
      grid.appendChild(d);
    });
  }
  // ---------- outbox: messages that failed to reach Telegram are kept and retried ----------
  const OUT_KEY = 'palaceOutbox';
  const queueOutbox = (message) => { const q = jget(OUT_KEY, []); q.push({ message, t: Date.now() }); jset(OUT_KEY, q.slice(-10)); };
  let flushing = false;
  async function flushOutbox() {
    if (flushing) return; flushing = true;
    try {
      let q = jget(OUT_KEY, []);
      while (q.length) {
        const r = await sendToTelegramDetailed(q[0].message);
        if (!r.ok) { logErr('outbox: ' + r.error); break; }
        q.shift(); jset(OUT_KEY, q);
      }
    } finally { flushing = false; }
  }
  window.addEventListener('online', flushOutbox);
  setTimeout(flushOutbox, 3000);

  const tools = {
    async play_music({ song = '' }) {
      const cards = [...document.querySelectorAll('.song-card')];
      const card = song && cards.find(c => c.querySelector('h3').textContent.toLowerCase().includes(song.toLowerCase()));
      if (card) { const id = (card.href.match(/youtu\.be\/([\w-]+)/) || [])[1]; const title = card.querySelector('h3').textContent; showPlayer(id, title); return { ok: true, playing: title }; }
      if (!song) { const c0 = cards[0]; const id0 = (c0?.href.match(/youtu\.be\/([\w-]+)/) || [])[1]; if (!id0) return { ok: false, error: 'no song' }; const t0 = c0.querySelector('h3').textContent; showPlayer(id0, t0); return { ok: true, playing: t0 }; }
      const hit = await searchYouTube(song);
      if (hit) { showPlayer(hit.id, hit.title, song); return { ok: true, playing: hit.title }; }
      showPlayer(null, song, song); return { ok: true, playing: song, note: 'could not embed, gave a YouTube search link' };
    },
    async save_memory({ caption }) {
      if (!turnMedia || turnMedia.kind !== 'image') return { ok: false, error: 'no photo attached in this message' };
      const item = { img: turnMedia.dataUrl, caption, date: Date.now() };
      const r = memRef();
      if (r) {
        try { await Promise.race([r.push(item), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]); return { ok: true, saved: 'cloud' }; }
        catch (e) { logErr('save memory: ' + e.message); }
      }
      const mem = jget(MEM_KEY, []); mem.push(item);
      if (!jset(MEM_KEY, mem)) return { ok: false, error: 'storage full' };
      renderMemories(); return { ok: true, saved: 'this device only' };
    },
    async send_to_noamane({ message }) {
      const wait = 30000 - (Date.now() - lastSend);
      if (wait > 0) return { ok: false, throttled: true, error: `wait ${Math.ceil(wait / 1000)} seconds between messages` };
      const r = await sendToTelegramDetailed(message);
      if (r.ok) { lastSend = Date.now(); showHeartsRain(); flushOutbox(); return { ok: true }; }
      logErr('send_to_noamane: ' + r.error);
      queueOutbox(message);                      // keep it safe, retry later automatically
      return { ok: false, queued: true, error: r.error };
    },
    add_love_note({ text }) {
      const notes = jget('ilhamNoamaneNotes', []); notes.push(text); jset('ilhamNoamaneNotes', notes);
      const el = document.createElement('div'); el.className = 'note-item'; el.textContent = text;
      document.getElementById('notesDisplay')?.appendChild(el); return { ok: true };
    },
    open_section({ section = '' }) {
      const id = SECTIONS[section.toLowerCase()] || 'home'; document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); return { ok: true };
    }
  };

  // ---------- model loop ----------
  async function gem(contents) {
    await keysReady(); if (!GEMINI_API_KEY) return null;
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT + TOOL_RULES }] }, contents, tools: TOOLS,
      generationConfig: { temperature: 0.9, maxOutputTokens: 1200, topP: 0.95 }
    };
    for (const endpoint of GEMINI_ENDPOINTS) {
      const label = endpoint.split('/').pop();
      try {
        const r = await geminiFetch(endpoint, body);
        if (!r.ok) { const d = (await r.text().catch(() => '')).slice(0, 300); console.warn(`[AI] ${label} -> HTTP ${r.status}`, d); logErr(`gemini ${label}: HTTP ${r.status} ${d}`); continue; }
        const data = await r.json(); if (data?.candidates?.[0]?.content) return data.candidates[0].content;
        console.warn(`[AI] ${label} empty`, data?.promptFeedback);
      } catch (e) { console.error(`[AI] ${label} error:`, e); logErr(`gemini ${label}: ${e.message} (CORS/network)`); }
    }
    return null;
  }
  async function runGemini(text, media) {
    const userParts = [{ text: withLoveAngle(text || 'Chof had l-modia w 3lleq 3liha.') }];
    if (media) userParts.push({ inlineData: { mimeType: media.mime, data: media.data } });
    const contents = [...history, { role: 'user', parts: userParts }];
    for (let i = 0; i < 4; i++) {
      const content = await gem(contents); if (!content) return null;
      const calls = content.parts.filter(p => p.functionCall);
      if (!calls.length) return content.parts.map(p => p.text || '').join('').trim() || null;
      contents.push(content);
      const results = [];
      for (const { functionCall: fc } of calls) {
        let res; try { res = await (tools[fc.name]?.(fc.args || {}) ?? { ok: false, error: 'unknown tool' }); } catch (e) { res = { ok: false, error: String(e) }; }
        results.push({ functionResponse: { name: fc.name, response: { result: res } } });
      }
      contents.push({ role: 'user', parts: results });
    }
    return null;
  }


  // ---------- other providers (OpenAI-compatible): OpenRouter free router + Mistral ----------
  const CFG = new Proxy({}, { get: (_, k) => (window.AI_KEYS || {})[k] });   // keys arrive from Firebase after login
  const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const lowerTypes = (o) => JSON.parse(JSON.stringify(o).replace(/"type":"(OBJECT|STRING)"/g, (_, t) => `"type":"${t.toLowerCase()}"`));
  const OA_TOOLS = lowerTypes(TOOLS[0].functionDeclarations).map(f => ({ type: 'function', function: f }));
  const otherProviders = () => [
    CFG.openrouter && { name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: CFG.openrouter, model: 'openrouter/free' },
    CFG.mistral && { name: 'mistral-small', url: MISTRAL_URL, key: CFG.mistral, model: 'mistral-small-latest' },
    CFG.mistral && { name: 'codestral', url: MISTRAL_URL, key: CFG.mistral, model: 'codestral-latest' }
  ].filter(Boolean);

  // Groq: ask Groq which chat models exist right now, best first; a model that fails is skipped for 10 minutes.
  const GROQ_PREF = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'moonshotai/kimi-k2-instruct', 'llama-3.1-8b-instant'];
  const GROQ_SKIP = /whisper|tts|guard|safeguard|orpheus|compound|embed/i;
  let groqCache = null; const benched = new Map();
  async function groqModels() {
    if (groqCache) return groqCache;
    let ids = [];
    try { const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + CFG.groq } });
      if (r.ok) ids = (await r.json()).data.map(m => m.id).filter(id => !GROQ_SKIP.test(id)); else logErr('groq models list: HTTP ' + r.status); }
    catch (e) { logErr('groq models list: ' + e.message); }
    const ordered = [...GROQ_PREF.filter(m => !ids.length || ids.includes(m)), ...ids.filter(m => !GROQ_PREF.includes(m))];
    if (ids.length) groqCache = ordered;
    return ordered;
  }
  async function groqProviders() {
    if (!CFG.groq) return [];
    return (await groqModels()).filter(m => !(benched.get(m) > Date.now())).map(m => ({ name: 'groq:' + m, url: GROQ_URL, key: CFG.groq, model: m }));
  }
  const clean = (t) => (t || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  async function oaCall(p, messages, withTools, maxTokens = 900) {
    try {
      const body = { model: p.model, messages, max_tokens: maxTokens, temperature: 0.9 };
      if (withTools) body.tools = OA_TOOLS;
      const r = await fetch(p.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}`, 'HTTP-Referer': location.origin, 'X-Title': 'Eternal Palace' }, body: JSON.stringify(body) });
      if (!r.ok) { const d = (await r.text().catch(() => '')).slice(0, 300); console.warn(`[AI] ${p.name} -> HTTP ${r.status}`, d); logErr(`${p.name}: HTTP ${r.status} ${d}`); return null; }
      return (await r.json())?.choices?.[0]?.message || null;
    } catch (e) { console.error(`[AI] ${p.name} error:`, e); logErr(`${p.name}: ${e.message} (CORS/network)`); return null; }
  }
  async function runOpenAI(p, text, media) {
    const q = withLoveAngle(text || 'Chof had l-modia w 3lleq 3liha.');
    const user = media?.kind === 'image' ? [{ type: 'text', text: q }, { type: 'image_url', image_url: { url: media.dataUrl } }] : q;
    const messages = [{ role: 'system', content: SYSTEM_PROMPT + TOOL_RULES },
      ...history.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.parts[0].text })), { role: 'user', content: user }];
    for (let i = 0; i < 4; i++) {
      let msg = await oaCall(p, messages, true);
      if (!msg && i === 0) msg = await oaCall(p, messages, false); // some free models reject tool use: answer without tools
      if (!msg) return null;
      if (!msg.tool_calls?.length) return clean(msg.content) || null;
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        let res; try { res = await (tools[tc.function.name]?.(JSON.parse(tc.function.arguments || '{}')) ?? { ok: false, error: 'unknown tool' }); } catch (e) { res = { ok: false, error: String(e) }; }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(res) });
      }
    }
    return null;
  }

  // Order: Gemini -> every working Groq model -> OpenRouter -> Mistral. Code questions try Codestral first.
  const CODE_RE = /\b(code|coding|python|javascript|js|html|css|react|bug|sql|api|script|program|programmation)\b/i;
  async function buildChain(text, media) {
    const chain = [];
    const add = (name, run) => chain.push({ name, run });
    const others = otherProviders(), by = (n) => others.find(x => x.name === n);
    const oa = (p) => (t, m) => runOpenAI(p, t, m);
    if (CODE_RE.test(text || '') && by('codestral')) add('codestral', oa(by('codestral')));
    if (GEMINI_API_KEY) add('gemini', runGemini);
    if (media?.kind !== 'video') {
      for (const p of await groqProviders()) { if (media?.kind === 'image' && !/llama-4/.test(p.model)) continue; add(p.name, async (t, m) => { const o = await runOpenAI(p, t, m); if (!o) benched.set(p.model, Date.now() + 600000); return o; }); }
      for (const n of ['openrouter', 'mistral-small']) if (by(n)) add(n, oa(by(n)));
      if (media?.kind !== 'image' && by('codestral') && !CODE_RE.test(text || '')) add('codestral', oa(by('codestral')));
    }
    return chain;
  }
  async function runAgent(text, media) {
    turnMedia = media; await keysReady();
    for (const p of await buildChain(text, media)) {
      const out = await p.run(text, media);
      if (out) { console.log(`[AI] answered by ${p.name}`); window.__aiBy = p.name; return out; }
    }
    return null;
  }

  // Make the Extras (letters, story, confession...) use the same fallback chain
  const geminiPlain = window.callGeminiAPI;
  window.callGeminiAPI = async (text, opts = {}) => {
    const out = await geminiPlain(text, opts); if (out) return out;
    for (const p of [...await groqProviders(), ...otherProviders().filter(x => x.name !== 'codestral')]) {
      const msg = await oaCall(p, [{ role: 'system', content: opts.system || SYSTEM_PROMPT }, { role: 'user', content: text }], false, opts.maxTokens || 300);
      if (msg && clean(msg.content)) return clean(msg.content);
    }
    return null;
  };


  // ---------- on-screen AI check (no need for test-ai.html) ----------
  window.diagAI = async () => {
    addMessage('Kan-tchekki l-AI dyalk, tsenna chwiya...');
    const out = [];
    await keysReady();
    const have = ['gemini', 'groq', 'openrouter', 'mistral'].filter(k => k === 'gemini' ? GEMINI_API_KEY : CFG[k]);
    if (window.__keysErr) out.push('Firebase: ma-9drtch n9ra l-keys (' + window.__keysErr + '). Ghaliban l-rules jdad ma-tpublishawch.');
    else if (!have.length) out.push('Firebase khddam walakin ma-kaynach 7ta key f config/ai. Dkhel l keys.html w 7ett l-keys.');
    else out.push('Keys li lqit f Firebase: ' + have.join(', '));
    if (GEMINI_API_KEY) {
      const body = { contents: [{ role: 'user', parts: [{ text: 'Say hi in one word' }] }], generationConfig: { maxOutputTokens: 50 } };
      let ok = false, last = '';
      for (const ep of GEMINI_ENDPOINTS) {
        const name = ep.split('/').pop().split(':')[0];
        try { const r = await geminiFetch(ep, body);
          if (r.ok) { out.push('Gemini (' + name + '): khdam'); ok = true; break; }
          let msg = ''; try { msg = (await r.json()).error.message; } catch { msg = ''; }
          last = name + ' HTTP ' + r.status + (msg ? ' ' + msg.slice(0, 110) : ''); }
        catch (e) { last = 'network/CORS: ' + e.message; }
      }
      if (!ok) out.push('Gemini: ma-khdamch (' + last + ')');
    }
    const all = [...await groqProviders(), ...otherProviders()];
    for (const p of all.slice(0, 8)) {
      try { const r = await fetch(p.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key }, body: JSON.stringify({ model: p.model, max_tokens: 20, messages: [{ role: 'user', content: 'hi' }] }) });
        out.push(p.name + ': ' + (r.ok ? 'khdam' : 'ma-khdamch (HTTP ' + r.status + (r.status === 429 ? ', limit' : r.status === 401 ? ', key ghalat wla t-7ayydat' : '') + ')')); }
      catch (e) { out.push(p.name + ': network/CORS ' + e.message); }
    }
    addMessage(out.join('\n'));
  };

  // ---------- media + UI ----------
  function readMedia(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader(); fr.onerror = reject;
      if (file.type.startsWith('image/')) {
        fr.onload = () => { const im = new Image(); im.onload = () => {
          const k = Math.min(1, 800 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = im.width * k; c.height = im.height * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          const dataUrl = c.toDataURL('image/jpeg', 0.8); resolve({ kind: 'image', mime: 'image/jpeg', data: dataUrl.split(',')[1], dataUrl });
        }; im.onerror = reject; im.src = fr.result; };
      } else if (file.type.startsWith('video/') && file.size <= 10 * 1024 * 1024) {
        fr.onload = () => resolve({ kind: 'video', mime: file.type, data: fr.result.split(',')[1] });
      } else return reject(new Error('Video khass ykoun < 10MB'));
      fr.readAsDataURL(file);
    });
  }
  function setupUI() {
    const row = document.querySelector('.chat-input-container'); if (!row || row.querySelector('#aiAttach')) return;
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,video/*'; input.hidden = true;
    const btn = document.createElement('button'); btn.id = 'aiAttach'; btn.type = 'button'; btn.textContent = '📎';
    btn.style.cssText = 'background:none;border:1px solid #ff6b9d88;border-radius:50%;width:46px;height:46px;font-size:1.2rem;cursor:pointer;color:#fff';
    btn.onclick = () => input.click();
    input.onchange = async () => {
      const f = input.files[0]; if (!f) return;
      try { pending = await readMedia(f); btn.textContent = pending.kind === 'image' ? '🖼️' : '🎞️'; btn.style.background = '#ff6b9d55'; }
      catch (e) { addMessage(e.message || 'Ma-9dertch nqra had l-fichier'); }
      input.value = '';
    };
    row.insertBefore(btn, row.lastElementChild); row.appendChild(input);
    history.forEach(m => addMessage(m.parts[0].text, m.role === 'user'));
    renderMemories(); firebase.auth().onAuthStateChanged((u) => { if (u) listenMemories(); });
  }


  // Works even when every AI provider is down. Commands are matched loosely, so typos still work.
  const lev = (s, t) => { const d = Array.from({ length: s.length + 1 }, (_, i) => [i, ...Array(t.length).fill(0)]); for (let j = 1; j <= t.length; j++) d[0][j] = j;
    for (let i = 1; i <= s.length; i++) for (let j = 1; j <= t.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1)); return d[s.length][t.length]; };
  const isNear = (tok, w) => tok === w || (tok.length > 3 && lev(tok, w) <= (w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0));
  const hasWord = (toks, words) => toks.some(t => words.some(w => isNear(t, w)));
  const W = {
    mem: ['memory', 'memories', 'memoire', 'dhkriyat', 'dhkriya', 'dkriyat', 'dkra', 'gallery', 'galerie', '7ett', 'hett', 'hetha', 'sjl', 'save', 'zidha'],
    music: ['music', 'musique', 'ghnia', 'ghniya', 'ghnya', 'khdm', 'play', 'chghl', 'chghel', 'sm3ni', 'sma3'],
    send: ['sift', 'siftha', 'goul', 'golih', 'goulih'], noa: ['noamane', 'nouamane', 'noaman', 'nouman'], miss: ['miss', 'wahcht', 'w7acht', 'wahchtni']
  };
  async function localIntent(text, media) {
    const toks = (text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (media?.kind === 'image' && hasWord(toks, W.mem)) {
      const r = await tools.save_memory({ caption: `Dhkra ${new Date().toLocaleDateString('fr-FR')} 💕` });
      return r.ok ? 'Hettitha f Memories dyalna 💕 ghadi tb9a hna dima, w t9der tchoufha mn ay telephone' : 'Ma-9dertch n7fedha: ' + r.error;
    }
    if (hasWord(toks, W.send) && hasWord(toks, W.noa) || (hasWord(toks, ['miss']) && hasWord(toks, ['you']))) {
      const r = await tools.send_to_noamane({ message: `Ilham kat9ol lik: ${text}` });
      if (r.ok) return 'Siftha l Noamane 💖';
      if (r.throttled) return 'Sber chwiya a hbibti, katsift bzzaf mra wa7da 💕 3awdi mn ba3d 30 tanya.';
      return 'Ma-wslatch daba (chi mochkil f l-connexion), walakin 7fedtha 💖 ghadi tsift tlqa2iyan mnin t3awd t7el l-site.';
    }
    if (hasWord(toks, W.music)) {
      const query = (text || '').split(/\s+/).filter(w => !hasWord([w.toLowerCase()], W.music.concat(['li', 'liya', '3tini', 'l', 'dir', 'bghit', 'bghiti', 'chof', 'f', 'youtube', 'yt']))).join(' ').trim();
      const r = await tools.play_music({ song: query });
      return r.ok ? `Hak ${r.playing} 🎵💕` : null;
    }
    return null;
  }

  window.askNoamane = async function () {
    const input = document.getElementById('userQuestion'), text = input.value.trim(), media = pending;
    if (!text && !media) return;
    addMessage((media ? (media.kind === 'image' ? '🖼️ ' : '🎞️ ') : '') + (text || ''), true);
    input.value = ''; pending = null;
    const b = document.getElementById('aiAttach'); if (b) { b.textContent = '📎'; b.style.background = 'none'; }
    addTypingIndicator();
    const reply = await runAgent(text, media);
    removeTypingIndicator();
    if (!reply && /debug/.test(location.search)) addMessage('⚠️ ' + (ERR.slice(-4).join(' | ') || 'no error captured'));
    const local = reply ? null : await localIntent(text, media);
    const st = document.getElementById('heartStatus'); if (st) st.textContent = reply ? 'online, kayjawb lik b 7ob 💖' : 'offline daba, jawab 9sir 🌙';
    const out = reply || local || (media ? 'Ma-9dertch nchof had l-modia daba, 3awdi 7awli mn ba3d 💕' : smartFallback(text));
    addMessage(out);
    if (reply) {
      history.push({ role: 'user', parts: [{ text: (media ? `[${media.kind}] ` : '') + text }] }, { role: 'model', parts: [{ text: reply }] });
      history = history.slice(-24); jset(HIST_KEY, history);
    }
  };
  window.__agent = { runAgent, tools };
  if (document.readyState !== 'loading') setupUI(); else document.addEventListener('DOMContentLoaded', setupUI);
})();
