// FILE: frontend/app.js
// PURPOSE: All frontend logic — page transitions, API calls,
//          result rendering, metrics display, theme toggle.
//
// ⚠️  BEFORE DEPLOYING: Replace the API_BASE URL below with your
//     actual Render backend URL. You get this after deploying the backend.
//     It looks like: https://spamshield-api.onrender.com

// ─────────────────────────────────────────────
// SECTION 1 — CONFIGURATION
// ─────────────────────────────────────────────


const API_BASE = "https://abhishek1805-spamshield-api.hf.space";

// ─────────────────────────────────────────────
// SECTION 2 — ELEMENT REFERENCES
// ─────────────────────────────────────────────

const landingPage   = document.getElementById("landing-page");
const mainApp       = document.getElementById("main-app");
const startBtn      = document.getElementById("start-button");
const backBtn       = document.getElementById("back-button");
const themeToggle   = document.getElementById("theme-toggle");
const iconMoon      = document.getElementById("icon-moon");
const iconSun       = document.getElementById("icon-sun");

const messageInput  = document.getElementById("message-input");
const charCount     = document.getElementById("char-count");
const clearBtn      = document.getElementById("clear-btn");
const classifyBtn   = document.getElementById("classify-btn");
const btnText       = classifyBtn.querySelector(".btn-text");
const btnSpinner    = classifyBtn.querySelector(".btn-spinner");

const resultCard    = document.getElementById("result-card");
const verdictBadge  = document.getElementById("verdict-badge");
const verdictIcon   = document.getElementById("verdict-icon");
const verdictLabel  = document.getElementById("verdict-label");
const langBadge     = document.getElementById("lang-badge");
const langName      = document.getElementById("lang-name");
const langWarning   = document.getElementById("lang-warning");
const confBar       = document.getElementById("conf-bar");
const confMarker    = document.getElementById("conf-marker");
const hamPct        = document.getElementById("ham-pct");
const spamPct       = document.getElementById("spam-pct");
const resultAction  = document.getElementById("result-action");
const apiStatus     = document.getElementById("api-status");
const statusText    = document.getElementById("status-text");

const mAccuracy = document.getElementById("m-accuracy");
const mF1       = document.getElementById("m-f1");
const mPrec     = document.getElementById("m-precision");
const mRecall   = document.getElementById("m-recall");
const mAuc      = document.getElementById("m-auc");
const barAcc    = document.getElementById("bar-accuracy");
const barF1     = document.getElementById("bar-f1");
const barPrec   = document.getElementById("bar-precision");
const barRecall = document.getElementById("bar-recall");
const barAuc    = document.getElementById("bar-auc");
const dLangs    = document.getElementById("d-langs");
const dTestSize = document.getElementById("d-testsize");
const statAccuracy = document.getElementById("stat-accuracy");
const statF1       = document.getElementById("stat-f1");
const statAuc      = document.getElementById("stat-auc");

// ─────────────────────────────────────────────
// SECTION 3 — PAGE TRANSITIONS
// ─────────────────────────────────────────────

function switchPage(from, to) {
    from.classList.remove("active");
    setTimeout(() => {
        to.classList.add("active");
        window.scrollTo(0, 0);
    }, 260);
}

startBtn.addEventListener("click", () => switchPage(landingPage, mainApp));
backBtn.addEventListener("click", () => {
    messageInput.value = "";
    updateCharCount();
    resetResultCard();
    switchPage(mainApp, landingPage);
});

// ─────────────────────────────────────────────
// SECTION 4 — THEME TOGGLE
// ─────────────────────────────────────────────

function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("spamshield-theme", theme);
    if (theme === "light") {
        iconMoon.style.display = "none";
        iconSun.style.display  = "block";
    } else {
        iconMoon.style.display = "block";
        iconSun.style.display  = "none";
    }
}
themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "light" : "dark");
});
const savedTheme = localStorage.getItem("spamshield-theme") || "dark";
setTheme(savedTheme);

// ─────────────────────────────────────────────
// SECTION 5 — INPUT HANDLING
// ─────────────────────────────────────────────

function updateCharCount() {
    const len = messageInput.value.length;
    charCount.textContent = `${len} / 5000`;
    classifyBtn.disabled = len === 0;
}
messageInput.addEventListener("input", updateCharCount);

clearBtn.addEventListener("click", () => {
    messageInput.value = "";
    updateCharCount();
    resetResultCard();
    messageInput.focus();
});

document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const type = btn.dataset.type;
        messageInput.placeholder = type === "email"
            ? "Paste your email content here (subject line + body)…"
            : "Paste your SMS content here…";
    });
});

document.querySelectorAll(".mtab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".mtab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const target = tab.dataset.tab;
        document.querySelectorAll(".tab-panel").forEach(p => {
            p.classList.toggle("hidden", p.id !== `tab-${target}`);
        });
    });
});

// ─────────────────────────────────────────────
// SECTION 6 — API COMMUNICATION
// ─────────────────────────────────────────────

async function callPredict(text) {
    const response = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${response.status}`);
    }
    return response.json();
}

async function fetchMetrics() {
    try {
        const res = await fetch(`${API_BASE}/metrics`);
        if (!res.ok) return null;
        return res.json();
    } catch { return null; }
}

async function checkApiHealth() {
    try {
        const res = await fetch(`${API_BASE}/`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            apiStatus.className = "api-status online";
            statusText.textContent = "API online";
            return true;
        }
    } catch { /* fall through */ }
    apiStatus.className = "api-status offline";
    statusText.textContent = "API offline";
    return false;
}

// ─────────────────────────────────────────────
// SECTION 7 — METRICS DISPLAY
// ─────────────────────────────────────────────

function animateBar(barEl, value, delay = 0) {
    setTimeout(() => { barEl.style.width = `${(value * 100).toFixed(1)}%`; }, delay);
}

function displayMetrics(metrics) {
    if (!metrics) return;
    const fmt = v => v != null ? v.toFixed(4) : "—";
    const pct = v => v != null ? `${(v * 100).toFixed(2)}%` : "—";
    mAccuracy.textContent = pct(metrics.accuracy);
    mF1.textContent       = fmt(metrics.f1);
    mPrec.textContent     = fmt(metrics.precision);
    mRecall.textContent   = fmt(metrics.recall);
    mAuc.textContent      = fmt(metrics.auc_roc);
    animateBar(barAcc,    metrics.accuracy  ?? 0, 100);
    animateBar(barF1,     metrics.f1        ?? 0, 150);
    animateBar(barPrec,   metrics.precision ?? 0, 200);
    animateBar(barRecall, metrics.recall    ?? 0, 250);
    animateBar(barAuc,    metrics.auc_roc   ?? 0, 300);
    if (metrics.trained_on_languages) {
        dLangs.textContent = metrics.trained_on_languages.map(l => l.toUpperCase()).join(", ");
    }
    if (metrics.test_set_size) {
        dTestSize.textContent = metrics.test_set_size.toLocaleString() + " messages";
    }
    if (statAccuracy && metrics.accuracy != null) {
        statAccuracy.textContent = pct(metrics.accuracy);
        statF1.textContent       = fmt(metrics.f1);
        statAuc.textContent      = fmt(metrics.auc_roc);
    }
}

// ─────────────────────────────────────────────
// SECTION 8 — RESULT RENDERING
// ─────────────────────────────────────────────

const ICONS = {
    spam: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
             <circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.6"/>
             <path d="M6 6l6 6M12 6l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
           </svg>`,
    ham:  `<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
             <circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.6"/>
             <path d="M5.5 9.5L8 12l4.5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>`
};
const ACTIONS = {
    spam: "⚠️ Move to junk folder. Do not click any links or call back any numbers in this message.",
    ham:  "✅ This message appears safe to open. No suspicious patterns detected."
};

function resetResultCard() {
    resultCard.classList.add("hidden");
    resultCard.classList.remove("is-spam", "is-ham");
}

function showResult(data) {
    const { label, confidence, spam_prob,
            detected_language, detected_language_code,
            language_supported } = data;

    const isSpam = label === "spam";
    const spamP  = parseFloat(spam_prob) || 0;
    const hamP   = parseFloat((1 - spamP).toFixed(4));

    verdictBadge.className   = `verdict-badge ${label}`;
    verdictIcon.innerHTML    = ICONS[label];
    verdictLabel.textContent = label.toUpperCase();

    langName.textContent = detected_language || detected_language_code || "Unknown";
    langWarning.classList.toggle("hidden", language_supported);

    confBar.className       = `conf-bar ${label}`;
    confBar.style.width     = `${(spamP * 100).toFixed(1)}%`;
    confMarker.style.left   = `${(spamP * 100).toFixed(1)}%`;
    hamPct.textContent      = `${(hamP  * 100).toFixed(1)}%`;
    spamPct.textContent     = `${(spamP * 100).toFixed(1)}%`;
    resultAction.textContent = ACTIONS[label];

    resultCard.classList.remove("hidden", "is-spam", "is-ham");
    resultCard.classList.add(isSpam ? "is-spam" : "is-ham");

    if (data.model_metrics) displayMetrics(data.model_metrics);
}

// ─────────────────────────────────────────────
// SECTION 9 — CLASSIFY BUTTON
// ─────────────────────────────────────────────

classifyBtn.addEventListener("click", async () => {
    const text = messageInput.value.trim();
    if (!text) return;

    classifyBtn.disabled = true;
    btnText.textContent  = "Analyzing…";
    btnSpinner.classList.remove("hidden");
    resetResultCard();

    try {
        const data = await callPredict(text);
        showResult(data);
    } catch (error) {
        resultCard.classList.remove("hidden");
        resultCard.classList.add("is-spam");
        verdictBadge.className   = "verdict-badge spam";
        verdictIcon.innerHTML    = "⚠️";
        verdictLabel.textContent = "ERROR";
        langName.textContent     = "—";
        confBar.style.width      = "0%";
        hamPct.textContent       = "—";
        spamPct.textContent      = "—";
        resultAction.textContent = error.message.includes("Failed to fetch")
            ? "Cannot reach the API. Check that your Render backend is running."
            : `Error: ${error.message}`;
        checkApiHealth();
    } finally {
        classifyBtn.disabled = false;
        btnText.textContent  = "Classify Message";
        btnSpinner.classList.add("hidden");
    }
});

// ─────────────────────────────────────────────
// SECTION 10 — INITIALIZATION
// ─────────────────────────────────────────────

async function init() {
    const online = await checkApiHealth();
    if (online) {
        const metrics = await fetchMetrics();
        if (metrics) displayMetrics(metrics);
    }
    setInterval(checkApiHealth, 30_000);
}
document.addEventListener("DOMContentLoaded", init);
