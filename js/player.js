// ============ player.js — Video player logic ============
(() => {
  const config = window.APP_CONFIG;
  const $ = (s) => document.querySelector(s);

  const video = $("#video");
  const playerError = $("#playerError");
  const lecNum = $("#lecNum");
  const lecTitle = $("#lecTitle");
  const lecMeta = $("#lecMeta");
  const resumeNote = $("#resumeNote");
  const upnextEl = $("#upnext");
  const prevBtn = $("#prevBtn");
  const nextBtn = $("#nextBtn");

  const WATCH_KEY = "lstream_progress_v1";
  const SPEED_KEY = "lstream_speed";

  let allVideos = [];
  let current = null;

  // ---------- Theme ----------
  const themeToggle = $("#themeToggle");
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); localStorage.setItem("lstream_theme", t); }
  function initTheme() { applyTheme(localStorage.getItem("lstream_theme") || "dark"); }
  themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  const fmtDur = (s) => {
    if (!s) return "—";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const fmtTime = (sec) => {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const playerUrl = (n) => `player.html?n=${encodeURIComponent(n)}`;

  function loadProgress() {
    try { const t = JSON.parse(localStorage.getItem(WATCH_KEY) || "{}"); return t || {}; } catch { return {}; }
  }
  function saveProgress(n, t, dur) {
    const prog = loadProgress();
    const pct = dur ? Math.round((t / dur) * 100) : 0;
    if (pct >= 97) delete prog[n];
    else prog[n] = { t, pct, updated: Date.now() };
    localStorage.setItem(WATCH_KEY, JSON.stringify(prog));
  }
// ---------- Playback speed ----------
  const speedBtns = $(".speed-btns");
  function setSpeed(sp) {
    video.playbackRate = sp;
    localStorage.setItem(SPEED_KEY, String(sp));
    speedBtns.querySelectorAll("button").forEach((b) => b.classList.toggle("active", parseFloat(b.dataset.speed) === sp));
    if (resumeNote) resumeNote.textContent = `Speed: ${sp}x`;
  }
  speedBtns.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (btn) setSpeed(parseFloat(btn.dataset.speed));
  });

  // ---------- Progress save ----------
  video.addEventListener("timeupdate", () => {
    if (!current) return;
    if (video.duration && isFinite(video.duration)) {
      saveProgress(current.n, video.currentTime, video.duration);
    } else {
      const prog = loadProgress();
      prog[current.n] = { t: video.currentTime, pct: 0, updated: Date.now() };
      localStorage.setItem(WATCH_KEY, JSON.stringify(prog));
    }
  });

  // ---------- Show current ----------
  function showPage() {
    if (!current) return;
    lecNum.textContent = `#${current.n}`;
    lecTitle.textContent = current.title;
    lecMeta.textContent = `${current.batch} • ${current.res || ""} • ${fmtDur(current.dur)}`.replace(/ • •|•  •/g, "•");

    const prog = loadProgress();
    const p = prog[current.n];
    if (p && p.t > 3) {
      setTimeout(() => {
        if (video.readyState >= 1) {
          video.currentTime = p.t;
          resumeNote.textContent = `▶ #${current.n} ke ${fmtTime(p.t)} se resume kiya.`;
        }
      }, 1200);
    }

    const idx = allVideos.findIndex((v) => v.n === current.n);
    if (idx > 0) {
      prevBtn.classList.remove("hidden");
      prevBtn.href = playerUrl(allVideos[idx - 1].n);
      prevBtn.querySelector("span").textContent = `#${allVideos[idx - 1].n}`;
    }
    if (idx >= 0 && idx < allVideos.length - 1) {
      nextBtn.classList.remove("hidden");
      nextBtn.href = playerUrl(allVideos[idx + 1].n);
      nextBtn.querySelector("span").textContent = `#${allVideos[idx + 1].n}`;
    }
  }

  function renderUpNext() {
    const idx = allVideos.findIndex((v) => v.n === current.n);
    if (idx < 0) return;
    const next = allVideos.slice(idx + 1, idx + 13);
    upnextEl.innerHTML = next.map((v) => `
      <a class="upnext-item" href="${playerUrl(v.n)}">
        <span class="upnext-num">#${v.n}</span>
        <span class="upnext-title">${esc(v.title)}</span>
      </a>`).join("");
  }

  async function init() {
    try {
      const res = await fetch(config.DATA_URL);
      const data = await res.json();
      allVideos = data.videos || [];
    } catch (err) {
      console.error(err);
    }
    const n = Number(new URLSearchParams(location.search).get("n"));
    current = allVideos.find((v) => v.n === n) || allVideos[0];
    if (!current) { lecTitle.textContent = "Koi video nahi mila."; return; }

    showPage();
    renderUpNext();

    if (!config.BACKEND) {
      playerError.classList.remove("hidden");
      playerError.textContent = "⚠️ config.js me BACKEND URL set nahi hai. backend deploy ho to wahan URL daalo (README dekho).";
      return;
    }
    // free preview list
    try {
      const r = await fetch(`${config.BACKEND}/api/tiers`);
      const dd = await r.json();
      if (dd.preview) dd.preview.forEach((m) => previewMids.add(String(m)));
    } catch (e) { /* ignore */ }
    video.src = useStreamURL(current.msg);

    // view counter — video chalu hote hi backend ko batata hai (fire & forget)
    let viewSent = false;
    video.addEventListener("play", () => {
      if (viewSent) return;
      viewSent = true;
      try { fetch(`${config.BACKEND}/api/view/${current.msg}`, { method: "POST" }).catch(() => {}); } catch (e) {}
    });

    const savedSpeed = parseFloat(localStorage.getItem(SPEED_KEY) || "1");
    setSpeed(isFinite(savedSpeed) ? savedSpeed : 1);

    video.addEventListener("error", () => playerError.classList.remove("hidden"));
  }

  // activation-secured stream url; preview wale bina token ke stream hote hain
  let previewMids = new Set();
  function useStreamURL(msg) {
    if (previewMids.has(String(msg))) {
      // free preview — backend inhe bina token ke stream karta hai
      return `${config.BACKEND}/stream/${msg}`;
    }
    const url = window.LS.streamURL(msg);
    if (!url) {
      lecTitle.textContent = "Activation zaroori hai 🔐";
      lecMeta.textContent = "Is device pe abhi activation nahi hai. Home pe jake key activate karo.";
      playerError.classList.remove("hidden");
      playerError.textContent = "⚠️ Ye lecture premium hai. Home pe jaake subscription/key activate karo.";
      setTimeout(() => { location.href = "index.html"; }, 4000);
      return "about:blank";
    }
    return url;
  }

  initTheme();
  init();
})();