/* =====================================================================
   ui.js — BERSERK STREAM shared core
   theme • toasts • dialogs • progress store • batch name cleaner • embers
   Koi external dependency nahi. Sab kuch vanilla.
   ===================================================================== */
window.BS = (() => {
  "use strict";

  /* ----------------------------- tiny helpers ----------------------------- */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const debounce = (fn, ms = 160) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  /* ----------------------------- formatting ----------------------------- */
  function fmtDur(sec) {
    if (!sec || !isFinite(sec)) return "—";
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  }
  function fmtBytes(b) {
    if (!b) return "—";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0, n = b;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
  }
  function fmtDate(d) {
    if (!d) return "—";
    const dt = typeof d === "number" ? new Date(d * 1000) : new Date(d);
    if (isNaN(dt)) return "—";
    return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  }

  /* ----------------------------- batch names -----------------------------
     Maal ke original batch names bahut gande hain:
       "GS FOUNDATION 2024 FEB BATCH [VAJIRAM & RAVI IAS]byऋषभ राजपूत"
     Yahan unko clean, chhota aur searchable bana rahe hain.
     Naya batch aaye to fallback normalizer khud handle kar lega.
  ----------------------------------------------------------------------- */
  const BATCH_MAP = {
    "GS FOUNDATION 2025 FEB BATCH M1 [VAJIRAM & RAVI IAS]":
      { short: "GS Foundation 2025", institute: "Vajiram & Ravi", year: "2025" },
    "GS FOUNDATION 2024 FEB BATCH [VAJIRAM & RAVI IAS]byऋषभ राजपूत":
      { short: "GS Foundation 2024", institute: "Vajiram & Ravi", year: "2024" },
    "CSAT_Course_for_UPSC_Prelims_2024_Online/Live_Batch[VAJIRAM & RAVI IAS]byऋषभ राजपूत":
      { short: "CSAT Prelims 2024", institute: "Vajiram & Ravi", year: "2024" },
    "V & R Economics Module For General Studies 2024[VAJIRAM & RAVI IAS]byऋषभ राजपूत":
      { short: "Economics Module 2024", institute: "Vajiram & Ravi", year: "2024" },
    "Current Affairs 2023-24[VAJIRAM & RAVI]byऋषभ राजपूत":
      { short: "Current Affairs 23-24", institute: "Vajiram & Ravi", year: "2024" },
    "General": { short: "General / Misc", institute: "—", year: "" },
    "ESSAY BY BRIJENDRA SINGH GENERAL STUDIES 2023-24 BATCH [VAJIRAM & RAVI]byऋषभ राजपूत":
      { short: "Essay Writing 23-24", institute: "Vajiram & Ravi", year: "2024" },
    "CSAT 500-Rapid Practice Program Crash Course 2024[SUNYA IAS]byऋषभ राजपूत":
      { short: "CSAT 500 Rapid 2024", institute: "Sunya IAS", year: "2024" },
    "Current Affairs- Ruthless Rapid Revision RRR 2024 [SUNYA IAS]byऋषभ राजपूत":
      { short: "RRR Current Affairs", institute: "Sunya IAS", year: "2024" },
    "RRR 2024-Environment and Ecology[SUNYA IAS]byऋषभ राजपूत":
      { short: "RRR Environment", institute: "Sunya IAS", year: "2024" },
  };

  const _batchCache = new Map();
  function batchInfo(raw) {
    const key = String(raw ?? "").trim();
    if (_batchCache.has(key)) return _batchCache.get(key);
    let info = BATCH_MAP[key];
    if (!info) {
      // generic fallback — kuch bhi ho jaye, insaan padh saku
      let t = key
        .replace(/\s*by\s*[^\x00-\x7F][\s\S]*$/u, "")   // "byऋषभ ..." hatao
        .replace(/[_]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      const inst = (t.match(/\[([^\]]+)\]/g) || []).join(" ").replace(/[\[\]]/g, "").trim();
      t = t.replace(/\[[^\]]*\]/g, "").trim();
      const yr = (t.match(/20\d{2}(\s*[-–]\s*\d{2,4})?/) || [""])[0];
      let short = t
        .replace(/\b(BATCH|COURSE|ONLINE|LIVE|PROGRAM|FOR|UPSC|IAS|GENERAL STUDIES|GENERAL)\b/gi, " ")
        .replace(/\s{2,}/g, " ")
        .replace(/[-_/]+\s*$/, "")
        .trim();
      short = short.length > 34 ? short.slice(0, 34).replace(/\s\S*$/, "") + "…" : short;
      info = {
        short: short ? titleish(short) : "Batch",
        institute: titleish(inst.split(/[\/,]/)[0] || "") || "Unknown",
        year: (yr.match(/20\d{2}/) || [""])[0],
      };
    }
    info = { ...info, raw: key };
    _batchCache.set(key, info);
    return info;
  }
  function titleish(s) {
    return String(s).toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase()).replace(/\bIas\b/g, "IAS").replace(/\bG\.?S\.?\b/gi, "GS");
  }

  /* Title cleanup: "01. Intro. to Essay Writing" -> "Intro. to Essay Writing" */
  function cleanTitle(t) {
    return String(t ?? "")
      .replace(/^\s*\d{1,4}\s*[.)\-–]\s*/, "")
      .replace(/\s{2,}/g, " ")
      .trim() || "Untitled lecture";
  }

  /* ----------------------------- storage ----------------------------- */
  const K = {
    theme: "bs_theme",
    progress: "lstream_progress_v1",
    speed: "lstream_speed",
    bookmarks: "bs_bookmarks_v1",
    activation: "lstream_activation_v1",
    preview: "bs_preview_cache_v1",
    autoplay: "bs_autoplay",
    volume: "bs_volume",
  };

  const store = {
    get(key, fallback) {
      try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
      catch { return fallback; }
    },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
    raw(key) { try { return localStorage.getItem(key); } catch { return null; } },
    rawSet(key, val) { try { localStorage.setItem(key, val); } catch {} },
    del(key) { try { localStorage.removeItem(key); } catch {} },
  };

  /* progress: { [n]: { t, dur, pct, updated } } */
  function getProgress() { return store.get(K.progress, {}) || {}; }
  function getProgressFor(n) { return getProgress()[n] || null; }
  function saveProgress(n, t, dur) {
    const all = getProgress();
    const pct = dur && isFinite(dur) ? clamp((t / dur) * 100, 0, 100) : 0;
    if (pct >= 96) { delete all[n]; store.set(K.progress, all); return; }
    if (t < 3) return;
    all[n] = { t: Math.floor(t), dur: Math.floor(dur || 0), pct: Math.round(pct), updated: Date.now() };
    // 300 se zyada entries ki zaroorat nahi
    const keys = Object.keys(all);
    if (keys.length > 300) {
      keys.sort((a, b) => (all[a].updated || 0) - (all[b].updated || 0))
        .slice(0, keys.length - 300)
        .forEach((k) => delete all[k]);
    }
    store.set(K.progress, all);
  }
  function clearProgress(n) {
    const all = getProgress();
    if (n == null) store.set(K.progress, {});
    else { delete all[n]; store.set(K.progress, all); }
  }
  function recentProgress(limit = 6) {
    const all = getProgress();
    return Object.entries(all)
      .map(([n, p]) => ({ n: Number(n), ...p }))
      .filter((p) => p.pct > 0.5 && p.pct < 96)
      .sort((a, b) => (b.updated || 0) - (a.updated || 0))
      .slice(0, limit);
  }

  /* bookmarks */
  function bookmarks() { return new Set((store.get(K.bookmarks, []) || []).map(Number)); }
  function toggleBookmark(n) {
    const set = bookmarks();
    const has = set.has(Number(n));
    has ? set.delete(Number(n)) : set.add(Number(n));
    store.set(K.bookmarks, [...set]);
    return !has;
  }

  /* ----------------------------- theme ----------------------------- */
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    store.rawSet(K.theme, t);
    window.dispatchEvent(new CustomEvent("bs:theme", { detail: t }));
  }
  function currentTheme() { return document.documentElement.getAttribute("data-theme") || "night"; }
  function toggleTheme() {
    const next = currentTheme() === "night" ? "dawn" : "night";
    applyTheme(next);
    const label = next === "dawn" ? "Golden Age — raushni on" : "Black Swordsman — raat on";
    toast(label, { type: "info", icon: "sun", ttl: 2200 });
    return next;
  }
  function initTheme() {
    // FOUC se bachne ke liye <head> me inline boot script hai; yahan sirf sync
    const stored = store.raw(K.theme);
    if (stored === "night" || stored === "dawn") {
      document.documentElement.setAttribute("data-theme", stored);
    }
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-theme-toggle]")) { e.preventDefault(); toggleTheme(); }
    });
  }

  /* ----------------------------- icons ----------------------------- */
  const ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3.5 22 20H2z"/><path d="M12 9.5v4.5M12 17.4h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    command: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6.5a2.5 2.5 0 1 0-2.5 2.5H9m0-2.5v11m0-8.5h6m0 0V6a2.5 2.5 0 1 1 2.5 2.5H15m0 0v11M9 17.5A2.5 2.5 0 1 1 6.5 15H9m6 2.5a2.5 2.5 0 1 0 2.5-2.5H15"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 18h18M4.5 18 2.6 8.2l5.4 3.4L12 4.5l4 7.1 5.4-3.4L19.5 18"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="15.5" r="3.6"/><path d="m10.6 12.9 8.4-8.4M16.4 7.1l2.4 2.4M18.9 4.6l2.4 2.4"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
    skip: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 4.8v14.4a.8.8 0 0 0 1.25.66l9.1-6.2a.8.8 0 0 0 0-1.32l-9.1-6.2A.8.8 0 0 0 5 4.8z"/><rect x="17" y="4.5" width="2.6" height="15" rx="1.1"/></svg>',
    back10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5v6h6"/><path d="M4.6 11a8 8 0 1 1 1.6 6"/><text x="12" y="16" font-size="7" font-family="system-ui" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle">10</text></svg>',
    fwd10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5v6h-6"/><path d="M19.4 11a8 8 0 1 0-1.6 6"/><text x="12" y="16" font-size="7" font-family="system-ui" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle">10</text></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L13 5v14L7.5 14.5H4z" fill="currentColor" stroke="none"/><path d="M17 8.8a4.4 4.4 0 0 1 0 6.4M19.6 6.2a8 8 0 0 1 0 11.6"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L13 5v14L7.5 14.5H4z" fill="currentColor" stroke="none"/><path d="m17 9.5 5 5M22 9.5l-5 5"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg>',
    shrink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 20v-5h5M20 9h-5V4M4 15h5v5"/></svg>',
    pip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><rect x="12" y="11" width="7.5" height="6" rx="1.4" fill="currentColor"/></svg>',
    speed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4.2 17.5a9 9 0 1 1 15.6 0"/><path d="m12 13.5 4.4-4.4"/><circle cx="12" cy="14.5" r="1.6" fill="currentColor"/></svg>',
    theatre: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 20h12"/></svg>',
    discord: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.3 5.6A16 16 0 0 0 15.4 4.4l-.3.6a11.7 11.7 0 0 0-6.2 0l-.3-.6a16 16 0 0 0-3.9 1.2C2.3 9 1.6 12.3 1.9 15.6a16 16 0 0 0 4.8 2.4l.6-1a10 10 0 0 1-1.5-.7l.4-.3a11.4 11.4 0 0 0 9.6 0l.4.3a10 10 0 0 1-1.5.7l.6 1a16 16 0 0 0 4.8-2.4c.4-3.8-.6-7.1-2.8-10zM8.7 13.7c-.9 0-1.7-.9-1.7-1.9 0-1.1.8-1.9 1.7-1.9s1.7.9 1.7 1.9c0 1-.8 1.9-1.7 1.9zm6.6 0c-.9 0-1.7-.9-1.7-1.9 0-1.1.8-1.9 1.7-1.9s1.7.9 1.7 1.9c0 1-.8 1.9-1.7 1.9z"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5s5.5 4.2 5.5 9.2a5.5 5.5 0 0 1-11 0c0-2 1-3.5 1-3.5s.6 1.8 2 1.8c0-3.5 2.5-5.5 2.5-5.5z"/></svg>',
    sword: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 3.5 11 13M20.5 3.5 21 8l-9.5 9.5M20.5 3.5 16 4l-9.5 9.5M5 15l4 4M3.5 20.5 5 15l4 4-1.5 1.5z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.2 2"/></svg>',
  };
  const icon = (name) => ICONS[name] || "";

  /* brand of sacrifice — Berserk sigil (approximation, original vector) */
  const SIGIL = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M50 12c6 9 8 17 8 26 0 8-3 14-8 14s-8-6-8-14c0-9 2-17 8-26z"/>
    <path d="M50 52 22 88M50 52l28 36M28 62h44" opacity=".95"/>
    <path d="M50 52c-8 4-14 9-18 16M50 52c8 4 14 9 18 16" opacity=".55"/>
  </svg>`;

  /* ----------------------------- toasts ----------------------------- */
  function toastStack() {
    let el = $(".toast-stack");
    if (!el) { el = document.createElement("div"); el.className = "toast-stack"; document.body.appendChild(el); }
    return el;
  }
  function toast(message, opts = {}) {
    const { type = "info", ttl = 3200, icon: ico } = opts;
    const stack = toastStack();
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.setAttribute("role", "status");
    const ic = ico || (type === "ok" ? "check" : type === "err" ? "alert" : "info");
    el.innerHTML = `<span class="t-ico">${icon(ic)}</span><div>${message}</div>`;
    stack.appendChild(el);
    const kill = () => {
      if (el.classList.contains("out")) return;
      el.classList.add("out");
      setTimeout(() => el.remove(), 280);
    };
    const timer = setTimeout(kill, ttl);
    el.addEventListener("click", () => { clearTimeout(timer); kill(); });
    return el;
  }

  /* ----------------------------- dialogs ----------------------------- */
  const openDialogs = new Set();

  function openDialog(el, opts = {}) {
    if (!el) return;
    el.classList.remove("hidden", "closing");
    document.body.style.overflow = "hidden";
    openDialogs.add(el);
    const focusable = el.querySelector("[autofocus], input:not([type=hidden]), select, button.btn");
    if (focusable && opts.focus !== false) setTimeout(() => { try { focusable.focus({ preventScroll: true }); } catch {} }, 90);
    // backdrop click
    if (opts.backdropClose !== false) {
      el.addEventListener("click", (e) => {
        if (e.target === el) closeDialog(el);
      }, { once: true });
    }
    return el;
  }

  function closeDialog(el) {
    if (!el || el.classList.contains("hidden")) return;
    el.classList.add("closing");
    setTimeout(() => {
      el.classList.add("hidden");
      el.classList.remove("closing");
      openDialogs.delete(el);
      if (!openDialogs.size) document.body.style.overflow = "";
    }, 190);
  }

  function closeTopDialog() {
    const arr = [...openDialogs];
    if (!arr.length) return false;
    closeDialog(arr[arr.length - 1]);
    return true;
  }

  /* promise-based confirm — window.confirm ka replacement */
  function confirmDialog({ title = "Pakka?", body = "", okLabel = "Haan", cancelLabel = "Nahi", danger = true } = {}) {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.className = "overlay";
      ov.innerHTML = `
        <div class="dialog" style="max-width:420px" role="dialog" aria-modal="true">
          <div class="dialog-brand">${SIGIL}<span>Confirm</span></div>
          <h2 class="dialog-title">${esc(title)}</h2>
          <p class="dialog-sub">${body}</p>
          <div class="confirm-actions">
            <button class="btn btn-ghost" data-act="no">${esc(cancelLabel)}</button>
            <button class="btn ${danger ? "btn-blood" : "btn-ember"}" data-act="yes">${esc(okLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(ov);
      document.body.style.overflow = "hidden";
      const done = (v) => {
        ov.classList.add("closing");
        setTimeout(() => { ov.remove(); if (!document.querySelector(".overlay:not(.hidden)")) document.body.style.overflow = ""; }, 190);
        resolve(v);
      };
      ov.querySelector("[data-act=yes]").onclick = () => done(true);
      ov.querySelector("[data-act=no]").onclick = () => done(false);
      ov.onclick = (e) => { if (e.target === ov) done(false); };
      setTimeout(() => ov.querySelector("[data-act=yes]").focus(), 60);
    });
  }

  /* copy to clipboard (fallback ke saath) */
  async function copy(text, msg = "Copy ho gaya ✦") {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
      }
      toast(esc(msg), { type: "ok" });
      return true;
    } catch { toast("Copy nahi hua — manually select karo.", { type: "err" }); return false; }
  }

  /* ----------------------------- scroll progress ----------------------------- */
  function initScrollProgress() {
    const bar = $(".scroll-progress");
    if (!bar) return;
    let raf = null;
    const update = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const pct = h > 0 ? (window.scrollY / h) * 100 : 0;
      bar.style.width = pct.toFixed(2) + "%";
      raf = null;
    };
    window.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
  }

  /* ----------------------------- embers particle canvas ----------------------------- */
  function initEmbers() {
    const cvs = document.getElementById("embers");
    if (!cvs) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { cvs.remove(); return; }
    const ctx = cvs.getContext("2d", { alpha: true });
    let W = 0, H = 0, dpr = 1, parts = [], raf = null, visible = true;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cvs.clientWidth; H = cvs.clientHeight;
      cvs.width = Math.floor(W * dpr); cvs.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const density = Math.min(70, Math.max(26, Math.floor((W * H) / 26000)));
      parts = Array.from({ length: density }, () => spawn(true));
    };
    const spawn = (init) => ({
      x: Math.random() * W,
      y: init ? Math.random() * H : H + 12,
      r: 0.6 + Math.random() * 1.9,
      vy: -(0.14 + Math.random() * 0.5),
      vx: (Math.random() - 0.5) * 0.22,
      a: 0.12 + Math.random() * 0.42,
      hue: Math.random() > 0.62 ? "ember" : "blood",
      tw: Math.random() * Math.PI * 2,
    });

    const draw = () => {
      if (!visible) { raf = null; return; }
      ctx.clearRect(0, 0, W, H);
      const dawn = document.documentElement.getAttribute("data-theme") === "dawn";
      for (const p of parts) {
        p.tw += 0.02;
        p.y += p.vy; p.x += p.vx + Math.sin(p.tw * 0.6) * 0.16;
        if (p.y < -12 || p.x < -20 || p.x > W + 20) Object.assign(p, spawn(false));
        const alpha = p.a * (0.6 + 0.4 * Math.sin(p.tw));
        const col = p.hue === "ember"
          ? (dawn ? `rgba(155,94,18,${alpha * 0.8})` : `rgba(255,190,90,${alpha})`)
          : (dawn ? `rgba(165,16,27,${alpha * 0.7})` : `rgba(255,72,86,${alpha})`);
        ctx.beginPath();
        ctx.fillStyle = col;
        ctx.shadowBlur = 12; ctx.shadowColor = col;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", debounce(resize, 220), { passive: true });
    document.addEventListener("visibilitychange", () => {
      visible = document.visibilityState === "visible";
      if (visible && !raf) raf = requestAnimationFrame(draw);
    });
  }

  /* ----------------------------- scroll reveal ----------------------------- */
  function initReveal(root = document) {
    const els = $$("[data-reveal]", root);
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "-8% 0px -12% 0px" });
    els.forEach((e) => io.observe(e));
  }

  /* ----------------------------- keyboard ----------------------------- */
  function isTyping() {
    const a = document.activeElement;
    if (!a) return false;
    return /^(input|textarea|select)$/i.test(a.tagName) || a.isContentEditable;
  }

  /* ----------------------------- boot ----------------------------- */
  function boot() {
    initTheme();
    initScrollProgress();
    initEmbers();
    // sonar-ish "Escape closes top dialog"
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (closeTopDialog()) e.preventDefault();
      }
    });
  }

  return {
    $, $$, esc, clamp, debounce,
    fmtDur, fmtTime, fmtBytes, fmtDate,
    batchInfo, cleanTitle, titleish,
    K, store, getProgress, getProgressFor, saveProgress, clearProgress, recentProgress,
    bookmarks, toggleBookmark,
    applyTheme, currentTheme, toggleTheme, initTheme,
    ICONS, icon, SIGIL,
    toast, openDialog, closeDialog, closeTopDialog, confirmDialog, copy,
    initScrollProgress, initEmbers, initReveal, isTyping,
    boot,
  };
})();
