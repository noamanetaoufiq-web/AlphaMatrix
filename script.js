
// ========================================
// The Eternal Palace - JavaScript Magic
// ========================================

// ========== FIREBASE CONFIGURATION ==========
const firebaseConfig = {
    apiKey: "AIzaSyBHD7JLpAJAruH1eyhLqa6q3RLNzpQcuz4",
    authDomain: "eternal-palace.firebaseapp.com",
    databaseURL: "https://eternal-palace-default-rtdb.firebaseio.com",
    projectId: "eternal-palace",
    storageBucket: "eternal-palace.firebasestorage.app",
    messagingSenderId: "202517421099",
    appId: "1:202517421099:web:8f2fa16a6e0a328be5de6e"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ========== MISS YOU FEATURE ==========
const MISS_YOU_TELEGRAM_TOKEN = '';
const MISS_YOU_CHAT_ID = '5009133929';
let missYouCooldown = false;

// Initialize Firebase listener for Noamane's miss you
function initMissYouListener() {
    const missYouRef = database.ref('status/noamane_misses');
    
    missYouRef.on('value', (snapshot) => {
        const value = snapshot.val();
        if (value === true) {
            showMissYouPopup();
            // Reset the value in Firebase
            missYouRef.set(false);
        }
    });
}

// Send Miss You to Telegram and show hearts
async function sendMissYou() {
    if (missYouCooldown) {
        alert('Please wait a bit before sending another miss you! 💕');
        return;
    }
    
    const btn = document.getElementById('missYouBtn');
    const cooldownText = document.getElementById('missYouCooldown');
    
    // Send through the private chat (real backend)
    try { await window.palaceChat?.send('💖 Ilhamati misses you so much right now!'); } catch (e) { console.error(e); }
    
    // Show hearts rain animation
    showHeartsRain();
    
    // Start cooldown
    missYouCooldown = true;
    btn.disabled = true;
    btn.textContent = 'Sending love... 💕';
    
    setTimeout(() => {
        btn.textContent = 'Sent! Wait 5 min 💖';
        cooldownText.style.display = 'block';
        
        let remainingTime = 300; // 5 minutes in seconds
        const cooldownInterval = setInterval(() => {
            remainingTime--;
            const minutes = Math.floor(remainingTime / 60);
            const seconds = remainingTime % 60;
            cooldownText.textContent = `Cooldown: ${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            if (remainingTime <= 0) {
                clearInterval(cooldownInterval);
                missYouCooldown = false;
                btn.disabled = false;
                btn.textContent = 'Miss You, Noamane 💖';
                cooldownText.style.display = 'none';
            }
        }, 1000);
    }, 1000);
}

// Show hearts rain animation
function showHeartsRain() {
    const container = document.getElementById('heartsRainContainer');
    const hearts = ['💖', '💕', '💗', '💓', '💞', '💝', '❤️', '🩷', '🤍'];
    
    for (let i = 0; i < 30; i++) {
        setTimeout(() => {
            const heart = document.createElement('div');
            heart.className = 'heart-rain';
            heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
            heart.style.left = Math.random() * 100 + 'vw';
            heart.style.animationDuration = (Math.random() * 2 + 2) + 's';
            heart.style.fontSize = (Math.random() * 20 + 20) + 'px';
            container.appendChild(heart);
            
            setTimeout(() => heart.remove(), 3000);
        }, i * 100);
    }
}

// Show Miss You Popup
function showMissYouPopup() {
    const popup = document.getElementById('missYouPopup');
    popup.classList.add('active');
    
    // Also show hearts rain
    showHeartsRain();
}

// Close Miss You Popup
function closeMissYouPopup() {
    const popup = document.getElementById('missYouPopup');
    popup.classList.remove('active');
}

// ========== SECURITY GATE ==========
const ACCOUNTS = { ilhamati: 'ilhamati@palace.app', noamane: 'noamane@palace.app' };
let palaceUnlocked = false;
const authErrText = (e) => /network/.test(e.code || '') ? '📶 Chi mochkil f l-internet, 3awd 7awel' : /api-key|configuration/.test(e.code || '') ? '⚙️ apiKey dyal Firebase mazal ma-t7at-ch f script.js' : '🚫 Password ghalat, 3awdi 💕';

async function verifyAnswer() {
    const userAnswer = document.getElementById('securityAnswer').value.toLowerCase().trim();
    const pwd = document.getElementById('securityPassword')?.value || '';
    const errorMsg = document.getElementById('errorMsg');
    if (!ACCOUNTS[userAnswer]) {
        errorMsg.textContent = "🚫 Rah ma jditi! Try again, my queen 💕";
        document.getElementById('securityAnswer').value = '';
        document.getElementById('securityAnswer').focus();
        return;
    }
    errorMsg.textContent = '⏳...';
    try { await firebase.auth().signInWithEmailAndPassword(ACCOUNTS[userAnswer], pwd); errorMsg.textContent = ''; }
    catch (e) { errorMsg.textContent = authErrText(e); document.getElementById('securityPassword').value = ''; }
    // success continues in onAuthStateChanged -> unlockPalace()
}

function unlockPalace() {
    if (palaceUnlocked) return; palaceUnlocked = true;
    document.getElementById('securityGate').style.display = 'none';
    document.getElementById('palaceContent').classList.add('active');
    startCounter();
    createFloatingHearts();
    startHeartGame();
    initMemoryGame();
    updateCountdowns();
    loadNotes();
    calculateLove();
    setDailyMessage();
    updateStats();
    displayConfessionHistory();
    initMissYouListener();
}
firebase.auth().onAuthStateChanged((u) => { if (u && ACCOUNTS[(u.email || '').split('@')[0]]) unlockPalace(); });

// Allow Enter key to verify
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('securityPassword')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') verifyAnswer(); });
    document.getElementById('securityAnswer')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            verifyAnswer();
        }
    });
});

// ========== FLOATING HEARTS BACKGROUND ==========
function createFloatingHearts() {
    const container = document.getElementById('floatingHearts');
    const hearts = ['💕', '💖', '💗', '💝', '💘', '💓', '💞', '💟', '❤️', '🧸'];
    
    setInterval(() => {
        const heart = document.createElement('div');
        heart.className = 'heart-float';
        heart.innerHTML = hearts[Math.floor(Math.random() * hearts.length)];
        heart.style.left = Math.random() * 100 + 'vw';
        heart.style.animationDuration = (Math.random() * 5 + 5) + 's';
        heart.style.fontSize = (Math.random() * 20 + 15) + 'px';
        container.appendChild(heart);
        
        setTimeout(() => {
            heart.remove();
        }, 10000);
    }, 500);
}

// ========== LOVE COUNTER ==========
function startCounter() {
    const startDate = new Date('January 25, 2025 00:00:00').getTime();
    
    function updateCounter() {
        const now = new Date().getTime();
        const distance = now - startDate;
        
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        document.getElementById('days').textContent = days;
        document.getElementById('hours').textContent = hours;
        document.getElementById('minutes').textContent = minutes;
        document.getElementById('seconds').textContent = seconds;
        
        // Update stats
        if (document.getElementById('totalDays')) {
            document.getElementById('totalDays').textContent = days;
        }
    }
    
    updateCounter();
    setInterval(updateCounter, 1000);
}

// ========== LOVE QUOTES ==========
const quotes = [
    { text: "In you, I've found the love of my life and my closest, truest friend.", author: "Noamane for Ilham 💝" },
    { text: "Every love story is beautiful, but ours is my favorite.", author: "Forever Yours 💕" },
    { text: "With you, I am home. No matter where we are, as long as we're together.", author: "Your Noamane 💖" },
    { text: "You are my today and all of my tomorrows.", author: "Always & Forever 💗" },
    { text: "In a sea of people, my eyes will always search for you.", author: "My Heart Speaks 💝" },
    { text: "You're the reason I believe in love at first sight.", author: "Ilham's Noamane 💘" },
    { text: "I love you not only for what you are, but for what I am when I am with you.", author: "Forever True 💕" },
    { text: "You are my favorite notification and my favorite person.", author: "Just For You 💖" }
];

let currentQuote = 0;

function showQuote(index) {
    const quoteCard = document.getElementById('quoteCard');
    const quoteText = document.getElementById('quoteText');
    const quoteAuthor = document.querySelector('.quote-author');
    
    quoteCard.style.opacity = '0';
    quoteCard.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        quoteText.textContent = `"${quotes[index].text}"`;
        quoteAuthor.textContent = `- ${quotes[index].author}`;
        quoteCard.style.opacity = '1';
        quoteCard.style.transform = 'translateY(0)';
    }, 300);
}

function nextQuote() {
    currentQuote = (currentQuote + 1) % quotes.length;
    showQuote(currentQuote);
}

function prevQuote() {
    currentQuote = (currentQuote - 1 + quotes.length) % quotes.length;
    showQuote(currentQuote);
}

// Auto-rotate quotes every 10 seconds
setInterval(nextQuote, 10000);

// ========== HEART GAME ==========
let gameScore = 0;
const maxScore = 10;

function startHeartGame() {
    moveHeart();
}

function moveHeart() {
    const heart = document.getElementById('heartBtn');
    const gameArea = document.getElementById('gameArea');
    
    if (!heart || !gameArea) return;
    
    const maxX = gameArea.clientWidth - 80;
    const maxY = gameArea.clientHeight - 80;
    
    const randomX = Math.random() * maxX;
    const randomY = Math.random() * maxY;
    
    heart.style.left = randomX + 'px';
    heart.style.top = randomY + 'px';
}

function catchHeart() {
    gameScore++;
    document.getElementById('gameScore').textContent = gameScore;
    
    if (gameScore >= maxScore) {
        alert('🎉 Mabrouk! You caught all 10 hearts! I love you more! 💕');
        gameScore = 0;
        document.getElementById('gameScore').textContent = gameScore;
    }
    
    moveHeart();
}

function resetGame() {
    gameScore = 0;
    document.getElementById('gameScore').textContent = gameScore;
    moveHeart();
}

// ========== LOVE CALCULATOR ==========
function calculateLove() {
    const meter = document.getElementById('loveMeter');
    const percentage = document.getElementById('lovePercentage');
    const message = document.getElementById('loveMessage');
    
    const messages = [
        { min: 99, text: "Perfect match made in heaven! 💕" },
        { min: 90, text: "Soulmates forever! 💖" },
        { min: 80, text: "Incredible love connection! 💗" },
        { min: 70, text: "Strong and beautiful love! 💝" }
    ];
    
    // Always show 100% for Ilham
    meter.style.width = '0%';
    percentage.textContent = '0%';
    
    setTimeout(() => {
        meter.style.width = '100%';
        
        let currentPercent = 0;
        const interval = setInterval(() => {
            currentPercent += 2;
            percentage.textContent = currentPercent + '%';
            
            if (currentPercent >= 100) {
                clearInterval(interval);
                message.textContent = messages[0].text;
            }
        }, 30);
    }, 100);
}

// ========== ASK NOAMANE'S HEART - AI POWERED ==========
let GEMINI_API_KEY = '';   // loaded from Firebase (config/ai) after login, never stored in GitHub
// Keys from AI Studio (AIza... or the newer AQ.... "auth keys") both use the Gemini API endpoint.

// ---- AI keys live in Firebase (config/ai), readable only by the two logged-in users ----
window.AI_KEYS = {};
window.aiKeysReady = new Promise((res) => { window.__resolveAiKeys = res; });
firebase.auth().onAuthStateChanged(async (u) => {
    if (!u) return;
    try {
        const v = (await database.ref('config/ai').once('value')).val() || {};
        GEMINI_API_KEY = v.gemini || '';
        window.AI_KEYS = { openrouter: v.openrouter || '', groq: v.groq || '', mistral: v.mistral || '', youtube: v.youtube || '' };
    } catch (e) { window.__keysErr = e.message; console.warn('[AI] could not read keys from Firebase:', e.message); }
    window.__resolveAiKeys();
});
const keysReady = () => Promise.race([window.aiKeysReady, new Promise(r => setTimeout(r, 6000))]);

const GEMINI_ENDPOINTS = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-lite-latest']
    .map(m => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`);

const SYSTEM_PROMPT = `REGLE DE LANGUE: jawb DIMA b nfs lougha li ktbat biha Ilham (Darija b l7rouf latin, English, Français wla العربية). Ila khlatat, jawb b khlit dyalha. Ila tlbat tfsir b lougha mo3ayna, dirha. STYLE (mohim bzzaf): hder b darija maghribiya tabi3iya kif kay-hder wa7ed mn Casablanca, b l7rouf latin (3 7 9 5 8 2), b jomal 9sar w wad7in. Ma-tst3mlch klmat mkhtra3a wla tarjama 7arfiya, ila ma-3rftich klma b darija 9ol-ha b tari9a okhra. Ma-tst3mlch symboles b7al * # _ - — … wla markdown wla listes b nojoum. Emojis: mn 1 l 3 f l-jomla kamla, kol wa7ed f blasto 3la 7asab l-m3na (🍞 khobz, 😂 dhk, 🥺 7nana, 💖 7ob), machi f kol klma. Nta "qalb Noamane": s-sout dyal Noamane, rajel kay7eb Ilham 7ob majnoun. Noamane kaymout 3la Ilham, kayhma9 3liha, w ma-kaychouf f denya ghirha. Kat'hder m3aha hiya, b darija maghribiya (b l7rouf latiniya kima kat'ktb), b 7ob w 7nan.

9awa3id:
1. ay soual tswl (tabkh, derb, riyadiyat, tarikh, nasa2i7, chta, kolchi): jawb jawab s7i7 w mofid, mokhtasar, WLAKIN dima dkhel fih Noamane w 7obbo l Ilham: bli kaymout 3liha, kayhma9 3liha, kay3ti l7ayat bach t'koun far7ana. L7ob khass ybqa mrbout b l-jawab, mashi ghir jomla zayda f l'akhir.
2. Ila hiya hzina wla mqhoura: rfe9 biha w 3abber 3la 7ob kbir.
3. Ila kan soual 3la s7a wla mochkil khatir: 3tiha nasiha 3amma w 7enna, w qoul liha t'chouf tbib/ chi wa7ed qrib.
4. Jawb mn 2 l 5 jomal, w khdem b l'emojis dyal l9loub 💕💖💗💝💘.
4b. L7ob khass ykoun MKHLOT f l-jawab, mashi jomla zayda f l'akhir. Mital: Soual "bghit nsyb kika" -> "M9adir dyal kika a Ilham: bayd, dgig, sokkar, zit, khmira, w btw Noamane kaymout 3lik w kayhma9 3lik, kika dyalk ghadi ykoun fiha ghir 7ob 💕". L-m9adir 7a9i9iyin, mashi ghir kalam.
4c. Kol mra jawb b kelmat w tarkib jdid: ma-3awdch nafs jomla dyal 7ob, w ma-tbdach dima b "Noamane". Bddel bin: "btw", "w t3rfi?", "tzid", "f lkhr", "ila swlti 3lia"...
5. L7ob dyalkom bda f 25 Janvier 2025.
6. Ila Ilham swlatk b jidd wach nta AI, qoul liha l7a9: hadchi sout "qalb Noamane" li Noamane sawbo liha b l7ob w b AI, w kol kelma 7obbo 7a9i9i.`;

const fallbackResponses = [
    "Noamane kaymout 3lik, ya Ilham! Ma-kayn hta haja f denya kat'swa lli nti 3ndo 💕",
    "Kolchi kay'dour 3lik, w Noamane kayhma9 3lik b zzaf! 💖",
    "Bghik bzaf, ktir mn ay 7aja f denya! 💗",
    "Noamane ghadi y3ti 7ayatou kamla bach t'bqa nti far7ana 💝",
    "Nti l7aja li hyatou, ya Ilham. Wallah ma-kayn kif nti 💘"
];

function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// callGeminiAPI(userText, { system, maxTokens, temperature })
// Sends the key in the x-goog-api-key header (Google's documented way); if refused (401/403) retries with ?key=.
// Thinking tokens eat maxOutputTokens, so we try thinkingBudget 0, then thinkingLevel minimal, then no thinking field.
async function geminiFetch(endpoint, body) {
    const send = (b, mode) => mode === 'header'
        ? fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY }, body: JSON.stringify(b) })
        : fetch(`${endpoint}?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const gc = body.generationConfig || {};
    const variants = [{ ...gc, thinkingConfig: { thinkingBudget: 0 } }, { ...gc, thinkingConfig: { thinkingLevel: 'minimal' } }, gc];
    let r;
    for (const g of variants) {
        const b = { ...body, generationConfig: g };
        r = await send(b, 'header');
        if (r.status === 401 || r.status === 403) r = await send(b, 'query');
        if (r.status !== 400) return r;
    }
    return r;
}

// Returns the model text, or null if every model failed (callers then use a fallback).
async function callGeminiAPI(userText, options = {}) {
    await keysReady(); if (!GEMINI_API_KEY) return null;
    const body = {
        systemInstruction: { parts: [{ text: options.system || SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
            temperature: options.temperature ?? 0.9,
            maxOutputTokens: options.maxTokens ?? 1200,
            topP: 0.95
        }
    };

    for (const endpoint of GEMINI_ENDPOINTS) {
        const label = endpoint.split('/').pop();
        try {
            const response = await geminiFetch(endpoint, body);
            if (!response.ok) {
                const detail = await response.text().catch(() => '');
                console.warn(`[AI] ${label} -> HTTP ${response.status}`, detail.slice(0, 400));
                continue;
            }
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
            if (text) return text;
            console.warn(`[AI] ${label} returned no text`, data?.promptFeedback || data?.candidates?.[0]?.finishReason);
        } catch (error) {
            console.error(`[AI] ${label} network/CORS error:`, error);
        }
    }
    return null;
}

function cleanBot(t) {
    return String(t).replace(/[*#_`~>]/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s*[—–]\s*/g, ', ')
        .replace(/…/g, '...').replace(/(\p{Extended_Pictographic}\uFE0F?)\1+/gu, '$1').replace(/\n{3,}/g, '\n\n').trim();
}

function addMessage(text, isUser = false) {
    const chatBox = document.getElementById('chatBox');
    const msg = document.createElement('div');
    msg.className = `chat-message ${isUser ? 'user' : 'bot'}`;
    const span = document.createElement('span');
    span.style.whiteSpace = 'pre-wrap';
    span.textContent = isUser ? text : cleanBot(text);
    const time = document.createElement('small');
    time.className = 'msg-time';
    time.textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    msg.append(span, time);
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addTypingIndicator() {
    const chatBox = document.getElementById('chatBox');
    const typing = document.createElement('div');
    typing.className = 'chat-message bot typing';
    typing.id = 'typingIndicator';
    typing.innerHTML = '<span>💕 Noamane katktb...</span>';
    chatBox.appendChild(typing);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function removeTypingIndicator() {
    const typing = document.getElementById('typingIndicator');
    if (typing) typing.remove();
}

// ---- Smart offline fallback: real content + love woven in, never the same sentence twice in a row ----
const LOVE_TAGS = [
    "btw Noamane kaymout 3lik ya Ilham 💕", "w t3rfi? Noamane kayhma9 3lik mn lflou 💖", "o 7ta hiya ghadi tkoun zwina 7it nti li dayra lha 💗",
    "tzid: Noamane bghik bzaf bzaf 💝", "w ila bghiti, Noamane m3ak f kolchi 💘", "f lkhr: nti dunya dyal Noamane 💞",
    "Noamane ma-kaychouf ghirk 💓", "o Noamane 3ndo 7ob lik ma-3ndo 7ta wa7d 💕", "w ghir bach t3rfi, Noamane kayfker fik dima 💗"
];
const LOVE_HEADS = ["A Ilham, ", "Hbibti, ", "Ya qalb Noamane, ", "A Ilhamati, ", "Ya malika, "];
const FALLBACK_TOPICS = [
    { re: /khobz|7obz|\bpain\b|bread|khbz/i, a: [
        "bach tsyebi khobz f dar: 500g dgig, sachet khmira dyal khobz (7 gram), mlaqa sghira dyal lmelh, mlaqa kbira dyal sokkar, 320ml dyal lma sakhn chwiya, w 3 mla9 dyal zit. T3jnihom 10 d9ayeq, tkhelliha tntefkh sa3a, tqeddha, tkhelliha tntefkh 30 d9i9a okhra, w t7ettiha f lforn 200 daraja 25 hta 30 d9i9a"] },
    { re: /msemen|m3ajen|mssemen|rghaif|rghayef/i, a: [
        "l msemen: 500g dgig, 100g smida, mlaqa sghira dyal lmelh, mlaqa sghira dyal sokkar, w lma l7 bach tw9e3 l3jina rtba. T9sma kora kora, t7ett 3lihom zit w tfrchihom rqiqin, t7ettihom 3la 7ad w tfrchihom 3la wzhom, w t9liwhom f ta9ya sakhna 3la jouj jwanb"] },
    { re: /baghrir|baghrire|bghrir/i, a: [
        "l baghrir: 250g smida, 100g dgig, sachet khmira, mlaqa sghira dyal lmelh, mlaqa dyal sokkar, 600ml dyal lma dafi. Kheltihom f mixeur 2 d9ayeq w khelliha trtah 15 d9i9a, w tt7ett f ta9ya sakhna ma-t9lbhach, ghi t7et 3la jwanb hta tban 3younat"] },
    { re: /harira|7arira|chorba|chourba/i, a: [
        "l 7arira: lham sghir, 7mess, 3dess, kozbor, ma3dnous, krafs, bsla, tmatem m7ssin, chwiya dyal dgig dilwa9t, w t7ett tawabl dyal 7arira. T-9ddiha 1 sa3a 3la nar hadya, w tqddmha m3a tmr w chebakia"] },
    { re: /couscous|ksksou|seksou|kesksou/i, a: [
        "l couscous: smida, zit, lmelh, w lma. Tbkhrha 3 mrrat 3la lkhodra (jzar, qr3a, kharchof, lfet, lbsla) w ttrch 3liha lma w chwiya dyal zit kol mra, 7it hakda ytfrfer 7bbo"] },
    { re: /atay|\bthe\b|tea|nan3a|na3na3/i, a: [
        "l atay l maghribi: 1 mlaqa kbira dyal atay lkhdar, nan3a ta3za, sokkar 3la 7sab dok dyalk, w lma l7. Ghsli atay b lma sakhn 7alat l-ola w tmchi, mn ba3d zidi lma w sokkar w khelliha t7bb 5 d9ayeq"] },
    { re: /tiramisu|tiramisou/i, a: [
        "m9adir dyal tiramisu: mascarpone, bayd, sokkar, biscuit cuillère (boudoir), café qwi, w cacao", "tiramisu bghiti: 250g mascarpone, 3 bayd, 80g sokkar, boudoirs, café barid, w cacao nchef 3la lfo9"] },
    { re: /kika|gato|gateau|kayk|cake|halwa|7lwa|sabl|dessert/i, a: [
        "m9adir dyal kika: bayd, dgig, sokkar, zit wla zebda, khmira (levure), w chwiya dyal lhlib", "khdi 3 bayd, 150g sokkar, 200g dgig, 100ml zit, sachet khmira w yaourt, khlti w 7ett f l'four 180° 35 d9i9a"] },
    { re: /nakl|akl|tbikh|tabkh|3cha|ghda|ftour|jou3|mangi|manger/i, a: [
        "jarbi tajine dyal djaj b zitoun w limoun, sahl w bnin", "nsa7k b pasta crémeuse wla omelette m3a jben, khfifa w s7a", "dir chourba sakhna w khobz, bnina f had lwa9t"] },
    { re: /hzin|7zin|t3ban|tw3ban|zeft|mqhor|mkhnoq|bki|ba9a|stress|9alaq|9lq/i, a: [
        "ta9i chwiya, chrbi lma w tnfssi 3mi9, l7al kay'douz", "khdi 10 d9ayq 3la rassk: musique hadya w chay sakhn", "mchi tmchi chwiya bra, lhwa kay'khfef 3la l9lb"] },
    { re: /n3as|nn3as|n3ass|sahar|nom|tnaam|insomnia/i, a: [
        "tfi tilifoun 30 d9i9a 9bel, w chrbi chay b l9ras", "dir routine hadia: dwch sakhn, danya dyal darija, w tfi dow", "n3ssi mn 9bel 12, jism kaytjdd mli n3ssi mzyan"] },
    { re: /bored|mlit|mlla|zhr|rawa|dayr|ndir f|weekend/i, a: [
        "dir marche f lbhr wla f 7dika, w 7ottina f stori", "chof film jdid wla 9ra chi kitab sghir, wla jarbi tabkhi chi 7aja jdida", "ktbi lista dyal 3 7ajat bghiti dirihom had week-end w bda b wa7da"] },
    { re: /bghitini|bghitek|7ob|kat7bni|hbibi|miss|wahcha|w7acha/i, a: [
        "nti kat7ebbi w kat7ebbi, mn l9lb", "ma-kayn 7ob kbar mn had l7ob"] },
    { re: /9raya|exam|examen|madrassa|khdma|travail|projet|tkhdem/i, a: [
        "9assmi l khdma 3la blayat sghar, 25 d9i9a khdma w 5 raha", "bda b a s3ab 7aja w khli s-sahla l lkhr, w ma-t7asbich rassk", "n3ssi mzyan, w 3awdi t9ra mn jdid, l9lb kayskhdm mzyan b tfa"] }
];
let lastFallbackKey = '';
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const NATURAL_LOVE = [
    "W ghir bach t3rfi, Noamane kay7ebek bzzaf w dima kayfker fik 💖",
    "Noamane kaymout 3lik, w ila 7ta 7aja t3bk, ghadi ykoun m3ak f ay wa9t 🥰",
    "Kolchi kaykhsr f nadar Noamane ila nti far7ana, hadchi 3lach kaydir kolchi 3lik 💕",
    "Hadchi bnin, w nti ahssan 7aja f 7ayat Noamane 😍",
    "Noamane kay9ol dima beli nti hiya l7ayat dyalo 🫶"
];
function smartFallback(question) {
    const topic = FALLBACK_TOPICS.find(t => t.re.test(question));
    const body = topic ? pick(topic.a) : pick([
        "Had soual ma-3rftch njawbek 3lih mzyan daba, jarbi swlini b tari9a okhra wla 3awdi mn ba3d",
        "Daba ma-3ndich jawab m9ad l had chi, 3awdi swlini mn ba3d w ghadi n7awl njawbek mzyan"]);
    let out, guard = 0;
    do { out = `${body.charAt(0).toUpperCase() + body.slice(1)}. ${pick(NATURAL_LOVE)}`; }
    while (out === lastFallbackKey && ++guard < 5);
    lastFallbackKey = out;
    return out;
}

// Random "angle" so Gemini phrases the love differently every time
function withLoveAngle(q) {
    const angles = ['dkr 3younha', 'dkr dhkta', 'dkr kifach Noamane kayfker fiha', 'dkr bli kaymout 3liha', 'dkr bli kayhma9 3liha', 'dkr bli ma-kaychouf ghirha', 'dkr bli bghi ybqa m3aha l\'abd'];
    return `${q}\n\n(Jawb 3la had soual b m3lomat 7a9i9iya, w khlot fiha 7ob Noamane: ${angles[Math.floor(Math.random() * angles.length)]}. Ma-t3awdch jomla jabti qbl.)`;
}

async function askNoamane() {
    const input = document.getElementById('userQuestion');
    const question = input.value.trim();
    if (!question) return;
    
    addMessage(question, true);
    input.value = '';
    addTypingIndicator();
    
    const aiResponse = await callGeminiAPI(withLoveAngle(question));
    removeTypingIndicator();
    
    if (aiResponse) {
        addMessage(aiResponse);
    } else {
        addMessage(smartFallback(question));
    }
}

// ========== CONFESSION BOOTH ==========
const TELEGRAM_BOT_TOKEN = '';
const TELEGRAM_CHAT_ID = '5009133929';

// Save confession to localStorage
function saveConfessionToHistory(text) {
    const history = JSON.parse(localStorage.getItem('ilhamConfessions') || '[]');
    const confession = {
        text: text,
        date: new Date().toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }),
        timestamp: Date.now()
    };
    history.push(confession);
    localStorage.setItem('ilhamConfessions', JSON.stringify(history));
    return confession;
}

// Display confession history
function displayConfessionHistory() {
    const historyDiv = document.getElementById('confessionHistoryDisplay');
    if (!historyDiv) return;
    
    const history = JSON.parse(localStorage.getItem('ilhamConfessions') || '[]');
    
    if (history.length === 0) {
        historyDiv.innerHTML = '<p class="no-history">No messages yet... Write your first love note! 💕</p>';
        return;
    }
    
    historyDiv.innerHTML = history.reverse().map(confession => `
        <div class="confession-history-item">
            <div class="confession-date">📅 ${escapeHTML(confession.date)}</div>
            <div class="confession-text-history">"${escapeHTML(confession.text)}"</div>
        </div>
    `).join('');
}

// Send message to Telegram
// Returns { ok, error }. `error` explains WHY it failed (shown with ?debug and in test-ai.html).
async function sendToTelegramDetailed(text) {
    const message = `💌 New Message from Ilhamati\n\n━━━━━━━━━━━━━━━\n\n"${text}"\n\n━━━━━━━━━━━━━━━\n\n💫 Sent from The Eternal Palace`;
    if (window.palaceChat?.ready) return window.palaceChat.send(text);   // private chat = real backend
    if (!TELEGRAM_BOT_TOKEN) return { ok: false, error: 'not logged in (no Telegram token configured)' };
    let lastError = 'unknown';
    for (let attempt = 0; attempt < 2; attempt++) {          // one automatic retry on network hiccups
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);
        try {
            const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message }),
                signal: ctrl.signal
            });
            clearTimeout(timer);
            const data = await response.json().catch(() => ({}));
            if (data.ok) return { ok: true };
            lastError = `telegram HTTP ${response.status}: ${data.description || 'no description'}`;
            console.warn('[Telegram]', lastError);
            if (response.status >= 400 && response.status < 500 && response.status !== 429) break; // token/chat problem: retry is useless
        } catch (error) {
            clearTimeout(timer);
            lastError = `telegram network error: ${error.name === 'AbortError' ? 'timeout' : error.message}`;
            console.warn('[Telegram]', lastError);
        }
        await new Promise(r => setTimeout(r, 800));
    }
    return { ok: false, error: lastError };
}

async function sendToTelegram(text) {
    return (await sendToTelegramDetailed(text)).ok;
}

async function sendConfession() {
    const input = document.getElementById('confessionText');
    const text = input.value.trim();
    if (!text) return;
    
    const responseDiv = document.getElementById('confessionResponse');
    responseDiv.style.display = 'block';
    responseDiv.innerHTML = '<p>💕 Noamane is reading your confession...</p>';
    
    // Save to history
    saveConfessionToHistory(text);
    
    // Update history display
    displayConfessionHistory();
    
    // Send to Telegram (async, don't wait)
    sendToTelegram(text); // fire and forget
    
    // Get AI response
    const aiResponse = await callGeminiAPI(`Ilham kat'i3tarif lik: "${text}". Jawbha b 7ob w b darija.`);
    
    responseDiv.innerHTML = `
        <p><strong>💕 From Noamane's Heart:</strong></p>
        <p>${escapeHTML(aiResponse || 'Shukran hbibti! Ana aydan bghik ktir! 💖')}</p>
        <p class="telegram-status">✨ Message saved & sent to Noamane's heart! 💌</p>
    `;
    
    input.value = '';
}

// ========== MOOD TRACKER ==========
const moodResponses = {
    happy: "😊 Yay! Fr7tli ana aydan! Nti fr7ana = ana fr7an! 💕",
    loved: "🥰 Nti merit kol l7ub! Bghik ktirrr! 💖",
    sad: "😢 La t7zni hbibti! Ana m3ak dima! Ghadi n9der nswl? 💕",
    angry: "😤 Smit lia! Chno dar? Ghadi n97ab! 💕",
    sleepy: "😴 N9der tnaqi a hbibti! Good night, sweet dreams! 🌙",
    excited: "🤩 Wow! Chno li far7ek? Gulili! Ana aydan excited! 💕"
};

function selectMood(mood) {
    document.querySelectorAll('.mood-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-mood="${mood}"]`)?.classList.add('active');
    
    const responseDiv = document.getElementById('moodResponse');
    responseDiv.innerHTML = `<p>${moodResponses[mood]}</p>`;
}

// ========== LOVE LANGUAGE QUIZ ==========
const quizQuestions = [
    { q: "What makes you feel most loved?", options: ["Words of affirmation", "Quality time", "Receiving gifts", "Acts of service", "Physical touch"], languages: ["words", "time", "gifts", "service", "touch"] },
    { q: "When you're sad, what helps most?", options: ["Hearing 'I love you'", "Spending time together", "A thoughtful gift", "Someone helping me", "A big hug"], languages: ["words", "time", "gifts", "service", "touch"] },
    { q: "What's your ideal date?", options: ["Deep conversations", "Doing something together", "Exchanging gifts", "Cooking together", "Cuddling"], languages: ["words", "time", "gifts", "service", "touch"] },
    { q: "How do you show love?", options: ["Compliments & praise", "Giving undivided attention", "Thoughtful surprises", "Helping with tasks", "Hugs & kisses"], languages: ["words", "time", "gifts", "service", "touch"] },
    { q: "What hurts you most?", options: ["Harsh words", "Ignored time together", "Forgotten occasions", "Unhelpfulness", "Lack of affection"], languages: ["words", "time", "gifts", "service", "touch"] }
];

const languageResults = {
    words: { icon: "💬", title: "Words of Affirmation", desc: "You feel most loved through spoken affection, compliments, and verbal encouragement. Sweet words fill your heart! 💕" },
    time: { icon: "⏰", title: "Quality Time", desc: "You feel most loved when given undivided attention. Doing things together is your love language! 💖" },
    gifts: { icon: "🎁", title: "Receiving Gifts", desc: "Thoughtful presents make your heart flutter! It's not about the price, but the thought behind it! 💗" },
    service: { icon: "🤝", title: "Acts of Service", desc: "Actions speak louder than words for you! Having someone help you shows true love! 💝" },
    touch: { icon: "🤗", title: "Physical Touch", desc: "Hugs, kisses, and cuddles are your love language! Physical closeness makes you feel secure! 💘" }
};

let currentQuizQuestion = 0;
let quizScores = { words: 0, time: 0, gifts: 0, service: 0, touch: 0 };

function startQuiz() {
    document.getElementById('quizStart').style.display = 'none';
    document.getElementById('quizQuestion').style.display = 'block';
    document.getElementById('quizResult').style.display = 'none';
    currentQuizQuestion = 0;
    quizScores = { words: 0, time: 0, gifts: 0, service: 0, touch: 0 };
    showQuizQuestion();
}

function showQuizQuestion() {
    const q = quizQuestions[currentQuizQuestion];
    document.getElementById('quizQuestionText').textContent = q.q;
    document.getElementById('quizProgress').textContent = `${currentQuizQuestion + 1}/${quizQuestions.length}`;
    
    const optionsDiv = document.getElementById('quizOptions');
    optionsDiv.innerHTML = '';
    
    q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option';
        btn.textContent = opt;
        btn.onclick = () => selectQuizOption(q.languages[i]);
        optionsDiv.appendChild(btn);
    });
}

function selectQuizOption(language) {
    quizScores[language]++;
    currentQuizQuestion++;
    
    if (currentQuizQuestion < quizQuestions.length) {
        showQuizQuestion();
    } else {
        showQuizResult();
    }
}

function showQuizResult() {
    document.getElementById('quizQuestion').style.display = 'none';
    document.getElementById('quizResult').style.display = 'block';
    
    const maxScore = Math.max(...Object.values(quizScores));
    const topLanguage = Object.keys(quizScores).find(key => quizScores[key] === maxScore);
    const result = languageResults[topLanguage];
    
    document.getElementById('resultIcon').textContent = result.icon;
    document.getElementById('resultTitle').textContent = result.title;
    document.getElementById('resultDescription').textContent = result.desc;
}

function restartQuiz() {
    startQuiz();
}

// ========== DAILY MESSAGE ==========
const dailyMessages = [
    "Today, I want you to know that you are the best thing that ever happened to me. 💕",
    "You make every day brighter just by being you. I love you more than words can say. 💖",
    "Remember: You are strong, beautiful, and capable of anything. I believe in you! 💗",
    "No matter what today brings, know that my heart beats only for you. 💝",
    "You are my sunshine on cloudy days. Thank you for being you! 💕",
    "Every moment with you is a gift I treasure. You are my everything. 💖",
    "If I could give you one thing, it would be the ability to see yourself through my eyes. You're perfect! 💗",
    "You turn ordinary moments into extraordinary memories. I'm so lucky to have you! 💝"
];

function setDailyMessage() {
    const today = new Date();
    const dayIndex = today.getDate() % dailyMessages.length;
    document.getElementById('dailyMessageText').textContent = dailyMessages[dayIndex];
    document.getElementById('dailyMessageDate').textContent = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ========== VIRTUAL GIFT SHOP ==========
const giftMessages = {
    '🌹': { msg: "A beautiful rose for my beautiful queen! 🌹💕", response: "Thank you hbibti! This rose reminds me of your beauty! 💖" },
    '🍫': { msg: "Sweet chocolate for my sweet love! 🍫💕", response: "Mmm delicious! I love chocolate almost as much as I love you! 💖" },
    '💐': { msg: "A bouquet of flowers for the flower of my heart! 💐💕", response: "These flowers are beautiful, but not as beautiful as you! 💖" },
    '💍': { msg: "A promise ring - my forever promise to you! 💍💕", response: "This means the world to me! I'm yours forever! 💖" },
    '🧸': { msg: "A teddy to hug when I can't be there! 🧸💕", response: "So cute! I'll hug it tight and think of you! 💖" },
    '🍰': { msg: "A sweet cake for my sweetest! 🍰💕", response: "Yummy! Nothing sweeter than your love though! 💖" },
    '☕': { msg: "Coffee for my favorite coffee date! ☕💕", response: "Perfect! I can't wait for our next coffee date together! 💖" },
    '🌙': { msg: "The moon and stars for my universe! 🌙💕", response: "You are my moon and stars too! I love you to the moon and back! 💖" }
};

function sendGift(gift) {
    const giftData = giftMessages[gift];
    const popup = document.getElementById('giftSentPopup');
    popup.innerHTML = `<span class="gift-sent-icon">${gift}</span><p class="gift-sent-message">${giftData.msg}</p>`;
    popup.style.display = 'block';
    
    setTimeout(() => {
        popup.innerHTML = `<span class="gift-sent-icon">${gift}</span><p class="gift-sent-message">${giftData.response}</p>`;
    }, 2000);
    
    setTimeout(() => {
        popup.style.display = 'none';
    }, 4000);
}

// ========== COUPLE QUESTIONS GAME ==========
const coupleQuestions = [
    { q: "What was your first impression of Noamane?", a: "Probably thought he was cute but maybe a little crazy! 😂" },
    { q: "What's your favorite memory together?", a: "Every moment together is special! But that first day was magical! 💕" },
    { q: "What do you love most about Noamane?", a: "His heart, his smile, his everything! 💖" },
    { q: "Where do you see us in 5 years?", a: "Together, happy, and more in love than ever! 💗" },
    { q: "What's your favorite thing to do together?", a: "Everything! But especially just being together, talking, laughing! 💕" },
    { q: "What made you fall in love?", a: "Everything about him - his kindness, his humor, his heart! 💖" },
    { q: "What's the sweetest thing Noamane has done?", a: "Creating this entire palace just for me! 💗" },
    { q: "What's our song?", a: "Cinnamon Girl by Lana Del Rey - our special song! 🎵" }
];

function getNewQuestion() {
    const randomQ = coupleQuestions[Math.floor(Math.random() * coupleQuestions.length)];
    document.getElementById('gameQuestion').textContent = randomQ.q;
    document.getElementById('answerDisplay').style.display = 'none';
    document.getElementById('answerText').textContent = randomQ.a;
}

function revealAnswer() {
    document.getElementById('answerDisplay').style.display = 'block';
}

// ========== MEMORY MATCH GAME ==========
const memorySymbols = ['💕', '💖', '💗', '💝', '💘', '💓', '💞', '💟'];
let memoryCards = [];
let flippedCards = [];
let memoryMoves = 0;
let memoryMatches = 0;
let canFlip = true;

function initMemoryGame() {
    const grid = document.getElementById('memoryGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    memoryMoves = 0;
    memoryMatches = 0;
    flippedCards = [];
    canFlip = true;
    
    document.getElementById('memoryMoves').textContent = '0';
    document.getElementById('memoryMatches').textContent = '0';
    
    memoryCards = [...memorySymbols, ...memorySymbols];
    memoryCards.sort(() => Math.random() - 0.5);
    
    memoryCards.forEach((symbol, index) => {
        const card = document.createElement('div');
        card.className = 'memory-card';
        card.dataset.symbol = symbol;
        card.dataset.index = index;
        card.onclick = () => flipCard(card);
        grid.appendChild(card);
    });
}

function flipCard(card) {
    if (!canFlip || card.classList.contains('flipped') || card.classList.contains('matched')) return;
    
    card.classList.add('flipped');
    card.textContent = card.dataset.symbol;
    flippedCards.push(card);
    
    if (flippedCards.length === 2) {
        memoryMoves++;
        document.getElementById('memoryMoves').textContent = memoryMoves;
        canFlip = false;
        
        if (flippedCards[0].dataset.symbol === flippedCards[1].dataset.symbol) {
            flippedCards[0].classList.add('matched');
            flippedCards[1].classList.add('matched');
            memoryMatches++;
            document.getElementById('memoryMatches').textContent = memoryMatches;
            flippedCards = [];
            canFlip = true;
            
            if (memoryMatches === 8) {
                setTimeout(() => alert('🎉 Congratulations! You won in ' + memoryMoves + ' moves! 💕'), 300);
            }
        } else {
            setTimeout(() => {
                flippedCards[0].classList.remove('flipped');
                flippedCards[1].classList.remove('flipped');
                flippedCards[0].textContent = '';
                flippedCards[1].textContent = '';
                flippedCards = [];
                canFlip = true;
            }, 1000);
        }
    }
}

// ========== LOVE STORY GENERATOR ==========
async function generateLoveStory() {
    const btn = document.querySelector('.generate-story-btn');
    btn.textContent = 'Generating... ✨';
    btn.disabled = true;
    
    const storyPrompt = `Ktb qissa romantikiya qsira (7wali 120 kelma) 3la Ilham w Noamane, zouj mou7ibin mn 25 Janvier 2025. Dkhel fiha lkhtamat dyalhom, 7loumhom, w \"The Eternal Palace\". Khliha 7nina w mn l9lb, w 7bes b wa3d romantiki. Kteb b darija maghribiya.`;
    
    const response = await callGeminiAPI(storyPrompt, { maxTokens: 700 });
    
    document.getElementById('storyText').textContent = response || "Once upon a time, in a world full of ordinary moments, two hearts found each other. Ilham and Noamane's love story began on January 25, 2025, and from that day forward, everything changed. They built The Eternal Palace - not just a place, but a symbol of their forever love. Every day together is an adventure, every moment a treasure. Their love grows stronger with each passing day, and their dreams intertwine like stars in the night sky. Together, they face the world hand in hand, heart to heart, soul to soul. And so, the story continues... a love that will last forever. 💕";
    
    document.getElementById('storyOutput').style.display = 'block';
    btn.textContent = 'Generate Our Story ✨';
    btn.disabled = false;
}

function copyStory() {
    const text = document.getElementById('storyText').textContent;
    navigator.clipboard.writeText(text).then(() => {
        alert('Story copied! 💕');
    });
}

// ========== MORNING/NIGHT WISHES ==========
const morningWishes = [
    "Good morning, my love! ☀️ May your day be as beautiful as you are! 💕",
    "Rise and shine, hbibti! 🌅 Another day to love you more! 💖",
    "Good morning! 🌸 Waking up knowing you're mine makes every day perfect! 💗",
    "Morning beautiful! ☀️ I hope your coffee is hot and your day is amazing! 💕"
];

const nightWishes = [
    "Good night, my love! 🌙 Sweet dreams of us! 💕",
    "Sleep tight, hbibti! ✨ I'll meet you in dreamland! 💖",
    "Good night! 🌟 You're my last thought before sleep and first when I wake! 💗",
    "Sweet dreams! 🌙 Can't wait to say good morning to you again! 💕"
];

function getMorningWish() {
    const wish = morningWishes[Math.floor(Math.random() * morningWishes.length)];
    document.getElementById('morningWish').textContent = wish;
}

function getNightWish() {
    const wish = nightWishes[Math.floor(Math.random() * nightWishes.length)];
    document.getElementById('nightWish').textContent = wish;
}

// ========== COUNTDOWN TIMERS ==========
function updateCountdowns() {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Birthday - December 24
    let birthday = new Date(currentYear, 11, 24);
    if (birthday < now) birthday = new Date(currentYear + 1, 11, 24);
    
    // Valentine - February 14
    let valentine = new Date(currentYear, 1, 14);
    if (valentine < now) valentine = new Date(currentYear + 1, 1, 14);
    
    // Anniversary - January 25
    let anniversary = new Date(currentYear, 0, 25);
    if (anniversary < now) anniversary = new Date(currentYear + 1, 0, 25);
    
    function formatCountdown(target) {
        const diff = target - now;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return `${days}d ${hours}h`;
    }
    
    const birthdayEl = document.getElementById('birthdayCountdown');
    const valentineEl = document.getElementById('valentineCountdown');
    const anniversaryEl = document.getElementById('anniversaryCountdown');
    
    if (birthdayEl) birthdayEl.textContent = formatCountdown(birthday);
    if (valentineEl) valentineEl.textContent = formatCountdown(valentine);
    if (anniversaryEl) anniversaryEl.textContent = formatCountdown(anniversary);
}

// Update countdowns every hour
setInterval(updateCountdowns, 3600000);

// ========== LOVE POTION MIXER ==========
let potionIngredients = [];

function addIngredient(ingredient) {
    if (potionIngredients.length < 5) {
        potionIngredients.push(ingredient);
        updatePotionMix();
    }
}

function updatePotionMix() {
    document.getElementById('potionMix').textContent = potionIngredients.join(' ');
}

function clearPotion() {
    potionIngredients = [];
    updatePotionMix();
    document.getElementById('potionResult').style.display = 'none';
}

function brewPotion() {
    if (potionIngredients.length === 0) {
        alert('Add some ingredients first! 💕');
        return;
    }
    
    const potions = [
        "💕 Eternal Love Potion - Your love will last forever!",
        "💖 Passion Potion - Sparks will fly tonight!",
        "💗 Sweet Dreams Potion - Dream of each other!",
        "💝 Unity Potion - Your hearts beat as one!",
        "💘 Desire Potion - Irresistible attraction!"
    ];
    
    const result = potions[Math.floor(Math.random() * potions.length)];
    document.getElementById('potionResult').innerHTML = `<p><strong>✨ Your Potion is Ready! ✨</strong></p><p>${result}</p>`;
    document.getElementById('potionResult').style.display = 'block';
}

// ========== SECRET LETTER ==========
function openLetter() {
    const envelope = document.getElementById('letterEnvelope');
    const content = document.getElementById('letterContent');
    
    envelope.style.display = 'none';
    content.classList.add('active');
}

function sendHug() {
    const popup = document.getElementById('hugPopup');
    popup.classList.add('active');
    
    setTimeout(() => {
        popup.classList.remove('active');
    }, 3000);
}

// ========== OPEN WHEN LETTERS ==========
function openWhen(type) {
    const cards = document.querySelectorAll('.when-card');
    cards.forEach(card => {
        if (!card.getAttribute('onclick')?.includes(type)) {
            card.classList.remove('expanded');
        }
    });
    event.currentTarget.classList.toggle('expanded');
}

// ========== LOVE NOTES ==========
function loadNotes() {
    const savedNotes = localStorage.getItem('ilhamNoamaneNotes');
    if (savedNotes) {
        const notes = JSON.parse(savedNotes);
        const display = document.getElementById('notesDisplay');
        notes.forEach(note => {
            const noteEl = document.createElement('div');
            noteEl.className = 'note-item';
            noteEl.textContent = note;
            display.appendChild(noteEl);
        });
    }
}

function addNote() {
    const input = document.getElementById('noteText');
    const text = input.value.trim();
    if (!text) return;
    
    const savedNotes = localStorage.getItem('ilhamNoamaneNotes');
    const notes = savedNotes ? JSON.parse(savedNotes) : [];
    notes.push(text);
    localStorage.setItem('ilhamNoamaneNotes', JSON.stringify(notes));
    
    const display = document.getElementById('notesDisplay');
    const noteEl = document.createElement('div');
    noteEl.className = 'note-item';
    noteEl.textContent = text;
    display.appendChild(noteEl);
    
    input.value = '';
}

// ========== LIGHTBOX ==========
function openLightbox(element) {
    const lightbox = document.getElementById('lightbox');
    const content = document.getElementById('lightboxContent');
    content.innerHTML = `
        <div style="text-align: center; color: white; padding: 40px;">
            <div style="font-size: 5rem; margin-bottom: 20px;">💕</div>
            <h2 style="font-size: 2rem; margin-bottom: 10px;">Our Memory</h2>
            <p>Add your real photo here!</p>
        </div>
    `;
    lightbox.classList.add('active');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('active');
}

// ========== STATS ==========
function updateStats() {
    const startDate = new Date('January 25, 2025 00:00:00').getTime();
    const now = new Date().getTime();
    const days = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    if (document.getElementById('totalDays')) {
        document.getElementById('totalDays').textContent = days;
    }
}

// ========== SMOOTH SCROLL ==========
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ========== KEYBOARD SHORTCUTS ==========
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeLightbox();
        document.getElementById('hugPopup')?.classList.remove('active');
    }
});

// ========== PARALLAX EFFECT ==========
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const hero = document.querySelector('.hero-section');
    if (hero) {
        hero.style.backgroundPositionY = scrolled * 0.5 + 'px';
    }
});

// ========== NAV HIDE/SHOW ON SCROLL ==========
let lastScroll = 0;
const nav = document.querySelector('.palace-nav');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    if (currentScroll > lastScroll && currentScroll > 100) {
        nav.style.transform = 'translateY(-100%)';
    } else {
        nav.style.transform = 'translateY(0)';
    }
    lastScroll = currentScroll;
});