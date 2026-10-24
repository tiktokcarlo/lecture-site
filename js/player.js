/* =====================================================================
   player.js — custom glass player
   FIXES vs purana version:
     • resume ab `loadedmetadata` event par hota hai (pehle 1200ms ka jugaad tha)
     • progress throttled save (har 5s + pause + visibilitychange + pagehide)
     • prev/next sorted list + keyboard se bhi
     • preview/locked logic saaf — `useStreamURL` ek hi jagah
     • speed popover, PiP, theatre, volume/mute, buffering spinner
     • autoplay next with cancel-able countdown
   ===================================================================== */
(() => {
  "use strict";
  const { $, $$, esc, fmtDur, fmtTime, batchInfo, cleanTitle, toast,
    getProgressFor, saveProgress, clearProgress, bookmarks, toggleBookmark,
    openDialog, closeDialog, isTyping, icon } = window.BS;

  const config = window.APP_CONFIG;
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];

  const video = $("#video");
  const stage = $("#stage");
  const ctrlBar = $("#ctrlBar");
  const errBox = $("#playerError");
  const spin = $("#bufferSpin");

  const state = {
    all: [],
    current: null,
    previewMids: new Set(),
    activated: false,
    autoplay: JSON.parse(localStorage.getItem("bs_autoplay") ?? "true"),
    lastSave: 0,
    countdown: null,
  };

  /* ------------------------------ branding ------------------------------ */
  $("#brandMark").innerHTML = window.BS.SIGIL;
  window.BS.boot();

  /* ------------------------------ icons ------------------------------ */
  $("#ppBtn").innerHTML = icon("pause");
  $("#back10Btn").innerHTML = icon("back10");
  $("#fwd10Btn").innerHTML = icon("fwd10");
  $("#speedBtn").innerHTML = icon("speed");
  $("#pipBtn").innerHTML = icon("pip");
  $("#theatreBtn").innerHTML = icon("theatre");
  $("#fsBtn").innerHTML = icon("expand");
  $("#muteBtn").innerHTML = icon("volume");

  /* ------------------------------ helpers ------------------------------ */
  function setPlayingIcon(playing) {
    $("#ppBtn").innerHTML = icon(playing ? "pause" : "play");
    $("#centerPlay").classList.toggle("hide", playing);
    $("#centerPlayBtn").innerHTML = icon("play");
  }

  function showError(title, body, { locked = false } = {}) {
    $("#peTitle").textContent = title;
    $("#peBody").textContent = body;
    $("#unlockBtn").classList.toggle("hidden", !locked);
    errBox.classList.add("show");
    spin.classList.remove("show");
  }
  function hideError() { errBox.classList.remove("show"); }

  /* ------------------------------ seek bar ------------------------------ */
  const seekWrap = $("#seekWrap");
  let dragging = false;

  function ratioFromEvent(e) {
    const r = seekWrap.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    return Math.min(1, Math.max(0, x / r.width));
  }
  function paintSeek() {
    const d = video.duration || 0;
    const pct = d ? (video.currentTime / d) * 100 : 0;
    $("#seekPlay").style.width = pct + "%";
    $("#seekThumb").style.left = pct + "%";
    $("#tCur").textContent = fmtTime(video.currentTime);
    $("#tDur").textContent = d ? fmtTime(d) : "0:00";
    try {
      if (video.buffered.length) {
        const end = video.buffered.end(video.buffered.length - 1);
        $("#seekBuf").style.width = d ? (end / d) * 100 + "%" : "0%";
      }
    } catch {}
  }

  seekWrap.addEventListener("pointerdown", (e) => {
    dragging = true;
    seekWrap.setPointerCapture?.(e.pointerId);
    const r = ratioFromEvent(e);
    video.currentTime = r * (video.duration || 0);
    paintSeek();
  });
  seekWrap.addEventListener("pointermove", (e) => {
    const r = ratioFromEvent(e);
    const d = video.duration || 0;
    const tip = $("#seekTip");
    tip.textContent = fmtTime(r * d);
    tip.style.left = r * 100 + "%";
    if (dragging) {
      video.currentTime = r * d;
      paintSeek();
    }
  });
  const endDrag = () => { dragging = false; };
  seekWrap.addEventListener("pointerup", endDrag);
  seekWrap.addEventListener("pointercancel", endDrag);
  seekWrap.addEventListener("pointerleave", endDrag);

  /* ------------------------------ playback controls ------------------------------ */
  function togglePlay() {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }
  const skip = (s) => {
    if (!video.duration) return;
    video.currentTime = Math.min(video.duration - 0.2, Math.max(0, video.currentTime + s));
    paintSeek();
    toast(`${s > 0 ? "+" : ""}${s}s`, { type: "info", ttl: 900, icon: s > 0 ? "fwd10" : "back10" });
  };

  $("#ppBtn").addEventListener("click", togglePlay);
  $("#centerPlayBtn").addEventListener("click", togglePlay);
  video.addEventListener("click", togglePlay);
  $("#back10Btn").addEventListener("click", () => skip(-10));
  $("#fwd10Btn").addEventListener("click", () => skip(10));

  /* volume */
  const volInput = $("#volInput");
  const savedVol = parseFloat(localStorage.getItem("bs_volume") ?? "1");
  video.volume = isFinite(savedVol) ? savedVol : 1;
  volInput.value = video.volume;

  function paintVolume() {
    const muted = video.muted || video.volume === 0;
    $("#muteBtn").innerHTML = icon(muted ? "mute" : "volume");
    volInput.value = muted ? 0 : video.volume;
  }
  volInput.addEventListener("input", () => {
    video.volume = parseFloat(volInput.value);
    video.muted = video.volume === 0;
    localStorage.setItem("bs_volume", String(video.volume));
    paintVolume();
  });
  $("#muteBtn").addEventListener("click", () => {
    video.muted = !video.muted;
    paintVolume();
    toast(video.muted ? "Mute" : "Unmute", { type: "info", ttl: 900, icon: video.muted ? "mute" : "volume" });
  });
  video.addEventListener("volumechange", paintVolume);

  /* speed */
  const speedPop = $("#speedPop");
  SPEEDS.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.speed = s;
    b.textContent = s + "x";
    speedPop.appendChild(b);
  });
  function setSpeed(sp, { announce = true } = {}) {
    video.playbackRate = sp;
    localStorage.setItem("lstream_speed", String(sp));
    $$("button", speedPop).forEach((b) => b.classList.toggle("active", parseFloat(b.dataset.speed) === sp));
    $("#speedBtn").classList.toggle("on", sp !== 1);
    if (announce) toast(`Speed: ${sp}x`, { type: "info", ttl: 1100, icon: "speed" });
  }
  speedPop.addEventListener("click", (e) => {
    const b = e.target.closest("[data-speed]");
    if (!b) return;
    setSpeed(parseFloat(b.dataset.speed));
    speedPop.classList.add("hidden");
  });
  $("#speedBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    speedPop.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#speedPop") && !e.target.closest("#speedBtn")) speedPop.classList.add("hidden");
  });

  /* PiP / theatre / fullscreen */
  $("#pipBtn").addEventListener("click", async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch { toast("PiP support nahi karta is browser me.", { type: "err" }); }
  });
  $("#theatreBtn").addEventListener("click", () => {
    stage.classList.toggle("theatre");
    const on = stage.classList.contains("theatre");
    $("#theatreBtn").innerHTML = icon(on ? "shrink" : "theatre");
    toast(on ? "Theatre mode on" : "Theatre mode off", { type: "info", ttl: 1100, icon: "theatre" });
  });
  function fullscreen() {
    const target = stage;
    if (!document.fullscreenElement) {
      (target.requestFullscreen || target.webkitRequestFullscreen || (() => {})).call(target);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
    }
  }
  $("#fsBtn").addEventListener("click", fullscreen);
  document.addEventListener("fullscreenchange", () => {
    const on = !!document.fullscreenElement;
    $("#fsBtn").innerHTML = icon(on ? "shrink" : "expand");
    if (on) {
      stage.style.display = "grid";
      stage.style.placeItems = "center";
    } else {
      stage.style.display = "";
      stage.style.placeItems = "";
    }
  });

  /* idle auto-hide controls */
  let idleTimer = null;
  function wake() {
    stage.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!video.paused) stage.classList.add("idle");
    }, 2800);
  }
  ["mousemove", "pointerdown", "touchstart", "keydown"].forEach((ev) =>
    stage.addEventListener(ev, wake, { passive: true }));
  video.addEventListener("play", wake);
  video.addEventListener("pause", () => { stage.classList.remove("idle"); clearTimeout(idleTimer); });

  /* ------------------------------ video events ------------------------------ */
  video.addEventListener("play", () => { setPlayingIcon(true); hideError(); });
  video.addEventListener("pause", () => setPlayingIcon(false));
  video.addEventListener("waiting", () => spin.classList.add("show"));
  video.addEventListener("playing", () => spin.classList.remove("show"));
  video.addEventListener("canplay", () => spin.classList.remove("show"));
  video.addEventListener("timeupdate", paintSeek);
  video.addEventListener("progress", paintSeek);
  video.addEventListener("durationchange", paintSeek);

  video.addEventListener("error", () => {
    const code = video.error ? video.error.code : 0;
    const map = {
      1: ["Playback cancel hui", "Video load karna band ho gaya."],
      2: ["Network error", "Stream aadha aaya — backend slow ho sakta hai. Retry karo."],
      3: ["Decode error", "Browser ye format decode nahi kar paya (MKV ho to Chrome/Edge try karo)."],
      4: ["Format support nahi", "Ye file browser support nahi karta, ya link expire ho gaya."],
    };
    const [t, b] = map[code] || ["Video nahi chala", "Retry karo, ya backend check karo (free tier sleep me ho sakta hai)."];
    showError(t, b);
    sendView();
  });

  $("#unlockBtn").addEventListener("click", () => { location.href = "index.html#unlock"; });

  $("#retryBtn").addEventListener("click", () => {
    hideError();
    loadVideo(state.current, { keepTime: false });
  });

  /* ------------------------------ progress ------------------------------ */
  function persistProgress(force = false) {
    if (!state.current) return;
    const now = Date.now();
    if (!force && now - state.lastSave < 5000) return;
    state.lastSave = now;
    if (video.duration && isFinite(video.duration)) {
      saveProgress(state.current.n, video.currentTime, video.duration);
    }
  }
  video.addEventListener("timeupdate", () => persistProgress());
  video.addEventListener("pause", () => persistProgress(true));
  video.addEventListener("ended", () => {
    if (state.current) clearProgress(state.current.n);
    setPlayingIcon(false);
    autoplayNext();
  });
  window.addEventListener("pagehide", () => persistProgress(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persistProgress(true);
  });

  /* ------------------------------ stream ------------------------------ */
  function streamURLFor(v) {
    const preview = !!config.DEV_UNLOCK || state.previewMids.has(String(v.msg));
    return {
      url: window.LS.streamURL(v.msg, { preview }),
      preview,
    };
  }

  function loadVideo(v, { keepTime = true } = {}) {
    if (!v) return;
    state.current = v;
    hideError();
    spin.classList.add("show");

    const { url, preview } = streamURLFor(v);
    if (!url) {
      spin.classList.remove("show");
      showError(
        preview ? "Backend se connect nahi hua" : "Ye lecture sealed hai",
        preview
          ? "Preview link nahi ban raha — server shayad sleep me hai. Thodi der baad retry karo."
          : "Is device pe activation nahi hai. Apni key daalo — phir ye lecture turant khul jayega.",
        { locked: !preview }
      );
      return;
    }
    video.src = url;
    video.load();

    if (keepTime) {
      const p = getProgressFor(v.n);
      if (p && p.t > 5) {
        const onMeta = () => {
          video.removeEventListener("loadedmetadata", onMeta);
          try { video.currentTime = Math.min(p.t, (video.duration || p.t) - 1); } catch {}
          toast(`#${v.n} → ${fmtTime(p.t)} se resume`, { type: "info", ttl: 2600, icon: "clock" });
          paintSeek();
        };
        video.addEventListener("loadedmetadata", onMeta);
      }
    }
  }

  let viewSent = false;
  function sendView() {
    if (viewSent || !state.current || !config.BACKEND) return;
    viewSent = true;
    try { fetch(`${config.BACKEND}/api/view/${state.current.msg}`, { method: "POST" }).catch(() => {}); } catch {}
  }
  video.addEventListener("play", sendView, { once: true });

  /* ------------------------------ page paint ------------------------------ */
  function paintLecture() {
    const v = state.current;
    if (!v) return;
    const b = batchInfo(v.batch);
    $("#lecNum").textContent = `#${v.n}`;
    $("#lecBatch").textContent = b.short;
    $("#lecRes").textContent = v.res || "—";
    document.title = `#${v.n} — ${cleanTitle(v.title)} | BERSERK STREAM`;
    $("#lecTitle").textContent = cleanTitle(v.title);
    $("#lecMeta").innerHTML = [
      `<span>${icon("clock").replace("<svg", '<svg style="width:12px;height:12px;display:inline-block;vertical-align:-2px;margin-right:4px"')}${fmtDur(v.dur)}</span>`,
      `<span class="dot-sep"></span>`,
      `<span>${esc(b.institute)}</span>`,
      `<span class="dot-sep"></span>`,
      `<span>${window.BS.fmtBytes(v.size)}</span>`,
      `<span class="dot-sep"></span>`,
      `<span>${esc(v.date ? window.BS.fmtDate(v.date) : "—")}</span>`,
    ].join("");

    // bookmark state
    const saved = bookmarks().has(v.n);
    $("#bmLabel").textContent = saved ? "Saved" : "Save";
    $("#bmBtn").classList.toggle("btn-blood", saved);

    // prev / next
    const idx = state.all.findIndex((x) => x.n === v.n);
    const prev = idx > 0 ? state.all[idx - 1] : null;
    const next = idx >= 0 && idx < state.all.length - 1 ? state.all[idx + 1] : null;

    $("#prevBtn").disabled = !prev;
    $("#nextBtn").disabled = !next;
    $("#prevLabel").textContent = prev ? `#${prev.n}` : "Prev";
    $("#nextLabel").textContent = next ? `#${next.n}` : "Next";

    renderUpNext();
    paintAutoplayToggle();

    // progress in list
    const p = getProgressFor(v.n);
    if (p && p.t > 5) {
      video.addEventListener("loadedmetadata", () => paintSeek(), { once: true });
    }
  }

  function renderUpNext() {
    const idx = state.all.findIndex((x) => x.n === state.current.n);
    if (idx < 0) return;
    const next = state.all.slice(idx + 1, idx + 16);
    const prev = idx > 0 ? [state.all[idx - 1]] : [];
    const list = [...prev.reverse(), state.current, ...next];

    $("#upnext").innerHTML = list.map((v) => {
      const p = getProgressFor(v.n);
      const isCur = v.n === state.current.n;
      return `
      <a class="upnext-item ${isCur ? "current" : ""}" href="player.html?n=${v.n}">
        <span class="upnext-num">#${v.n}</span>
        <span class="upnext-txt">
          <span class="upnext-title">${esc(cleanTitle(v.title))}</span>
          <span class="upnext-sub">${esc(batchInfo(v.batch).short)} · ${fmtDur(v.dur)}</span>
          ${p ? `<span class="upnext-prog"><i style="width:${p.pct}%"></i></span>` : ""}
        </span>
      </a>`;
    }).join("");

    const cur = $("#upnext .current");
    if (cur) setTimeout(() => cur.scrollIntoView({ block: "center" }), 120);
  }

  /* ------------------------------ autoplay next ------------------------------ */
  function paintAutoplayToggle() {
    const cb = $("#autoplayToggle");
    cb.checked = state.autoplay;
    cb.onchange = () => {
      state.autoplay = cb.checked;
      localStorage.setItem("bs_autoplay", JSON.stringify(state.autoplay));
      toast(`Autoplay ${state.autoplay ? "on" : "off"}`, { type: "info", ttl: 1200 });
    };
  }

  function nextLecture() {
    const idx = state.all.findIndex((x) => x.n === state.current.n);
    return idx >= 0 && idx < state.all.length - 1 ? state.all[idx + 1] : null;
  }

  function autoplayNext() {
    const next = nextLecture();
    $("#autoplaySlot")?.remove();
    if (!next) {
      toast("Ye aakhri lecture tha — poora arc khatam 🔥", { type: "ok", ttl: 4200 });
      return;
    }
    if (!state.autoplay) {
      toast("Agla lecture: <b>#" + next.n + "</b> — right side list se kholo.", { type: "info", ttl: 3600 });
      return;
    }

    let left = 8;
    const holder = document.createElement("div");
    holder.id = "autoplaySlot";
    holder.innerHTML = `
      <div class="autoplay-bar">
        <span class="ap-txt">Agla: <b>#${next.n} · ${esc(cleanTitle(next.title))}</b> — <b id="apLeft">${left}</b>s me shuru</span>
        <button class="btn btn-blood btn-sm" id="apGo">Abhi chalao</button>
        <button class="btn btn-ghost btn-sm" id="apCancel">Cancel</button>
      </div>`;
    $(".action-row").insertAdjacentElement("afterend", holder);

    const stop = () => { clearInterval(state.countdown); holder.remove(); };
    holder.querySelector("#apGo").onclick = () => { stop(); location.href = `player.html?n=${next.n}`; };
    holder.querySelector("#apCancel").onclick = () => { stop(); toast("Autoplay cancel.", { type: "info", ttl: 1400 }); };

    state.countdown = setInterval(() => {
      left -= 1;
      const l = holder.querySelector("#apLeft");
      if (l) l.textContent = Math.max(0, left);
      if (left <= 0) { stop(); location.href = `player.html?n=${next.n}`; }
    }, 1000);
  }

  /* ------------------------------ action buttons ------------------------------ */
  $("#bmBtn").addEventListener("click", () => {
    const on = toggleBookmark(state.current.n);
    $("#bmLabel").textContent = on ? "Saved" : "Save";
    $("#bmBtn").classList.toggle("btn-blood", on);
    toast(on ? "Saved ✦" : "Saved se hataya", { type: on ? "ok" : "info", ttl: 1500 });
  });

  $("#doneBtn").addEventListener("click", () => {
    clearProgress(state.current.n);
    toast(`#${state.current.n} complete mark ho gaya ✓`, { type: "ok" });
  });

  $("#copyBtn").addEventListener("click", () => {
    window.BS.copy(location.href, "Lecture link copy ho gaya ✦");
  });

  $("#prevBtn").addEventListener("click", () => {
    const idx = state.all.findIndex((x) => x.n === state.current.n);
    if (idx > 0) { persistProgress(true); location.href = `player.html?n=${state.all[idx - 1].n}`; }
  });
  $("#nextBtn").addEventListener("click", () => {
    const idx = state.all.findIndex((x) => x.n === state.current.n);
    if (idx >= 0 && idx < state.all.length - 1) { persistProgress(true); location.href = `player.html?n=${state.all[idx + 1].n}`; }
  });

  /* ------------------------------ palette ------------------------------ */
  const palette = { items: [], sel: 0 };
  function paletteItems() {
    const q = $("#paletteInput").value.trim().toLowerCase();
    const cmds = [
      { title: "Agla lecture", sub: "Next", icon: "next", run: () => $("#nextBtn").click() },
      { title: "Pichhla lecture", sub: "Previous", icon: "back", run: () => $("#prevBtn").click() },
      { title: "Theatre mode toggle", sub: "Layout", icon: "theatre", run: () => $("#theatreBtn").click() },
      { title: "Fullscreen", sub: "View", icon: "expand", run: fullscreen },
      { title: "Speed 1.5x", sub: "Playback", icon: "speed", run: () => setSpeed(1.5) },
      { title: "Speed 2x", sub: "Playback", icon: "speed", run: () => setSpeed(2) },
      { title: "Theme badlo", sub: "Night / Golden Age", icon: "sun", run: () => window.BS.toggleTheme() },
      { title: "Home jao", sub: "All lectures", icon: "grid", run: () => (location.href = "index.html") },
    ].filter((c) => !q || c.title.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q));

    const lecs = !q ? [] : state.all
      .filter((v) => `${v.title} ${v.batch} ${v.n}`.toLowerCase().includes(q))
      .slice(0, 8)
      .map((v) => ({
        title: cleanTitle(v.title), sub: `#${v.n} · ${batchInfo(v.batch).short}`, icon: "play",
        run: () => (location.href = `player.html?n=${v.n}`),
      }));

    return [...cmds, ...lecs];
  }
  function paintPalette() {
    palette.items = paletteItems();
    palette.sel = Math.min(palette.sel, Math.max(0, palette.items.length - 1));
    $("#paletteList").innerHTML = palette.items.length
      ? palette.items.map((it, i) => `
        <button class="palette-item ${i === palette.sel ? "sel" : ""}" data-idx="${i}">
          <span class="p-ico">${icon(it.icon)}</span>
          <span class="p-txt"><strong>${esc(it.title)}</strong><small>${esc(it.sub)}</small></span>
        </button>`).join("")
      : `<div class="status" style="padding:26px"><p>Kuch nahi mila.</p></div>`;
  }
  function openPalette() {
    openDialog($("#paletteOverlay"), { focus: false });
    $("#paletteInput").value = "";
    palette.sel = 0;
    paintPalette();
    setTimeout(() => $("#paletteInput").focus(), 80);
  }
  $("#paletteBtn").addEventListener("click", openPalette);
  $("#paletteInput").addEventListener("input", () => { palette.sel = 0; paintPalette(); });
  $("#paletteList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-idx]");
    if (!b) return;
    palette.sel = Number(b.dataset.idx);
    closeDialog($("#paletteOverlay"));
    palette.items[palette.sel].run();
  });
  $("#paletteOverlay").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); palette.sel = (palette.sel + 1) % Math.max(1, palette.items.length); paintPalette(); $("#paletteList .sel")?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palette.sel = (palette.sel - 1 + palette.items.length) % Math.max(1, palette.items.length); paintPalette(); $("#paletteList .sel")?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const it = palette.items[palette.sel];
      if (it) { closeDialog($("#paletteOverlay")); it.run(); }
    }
  });

  /* ------------------------------ keyboard ------------------------------ */
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      $("#paletteOverlay").classList.contains("hidden") ? openPalette() : closeDialog($("#paletteOverlay"));
      return;
    }
    if (isTyping()) return;
    if (!$("#paletteOverlay").classList.contains("hidden")) return;

    const k = e.key.toLowerCase();
    if (e.key === " " || k === "k") { e.preventDefault(); togglePlay(); return; }
    if (k === "j") { e.preventDefault(); skip(-10); return; }
    if (k === "l") { e.preventDefault(); skip(10); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); skip(-5); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); skip(5); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); video.muted = false; video.volume = Math.min(1, video.volume + 0.1); paintVolume(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); paintVolume(); return; }
    if (k === "m") { $("#muteBtn").click(); return; }
    if (k === "f") { fullscreen(); return; }
    if (k === "t") { $("#theatreBtn").click(); return; }
    if (k === "n") { $("#nextBtn").click(); return; }
    if (k === "p") { $("#prevBtn").click(); return; }
    if (k === "b") { $("#bmBtn").click(); return; }
    if (/^[0-9]$/.test(e.key)) {
      const pct = Number(e.key) / 10;
      if (video.duration) { video.currentTime = video.duration * pct; paintSeek(); }
      return;
    }
    if (e.key === ">" || e.key === ".") {
      const i = SPEEDS.indexOf(video.playbackRate);
      setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, i + 1)]);
      return;
    }
    if (e.key === "<" || e.key === ",") {
      const i = SPEEDS.indexOf(video.playbackRate);
      setSpeed(SPEEDS[Math.max(0, i - 1)]);
    }
  });

  /* ------------------------------ boot ------------------------------ */
  async function boot() {
    setPlayingIcon(false);
    paintVolume();
    setSpeed(parseFloat(localStorage.getItem("lstream_speed") || "1"), { announce: false });

    /* data */
    try {
      const res = await fetch(config.DATA_URL, { cache: "no-cache" });
      const data = await res.json();
      state.all = (data.videos || [])
        .map((v) => ({ ...v, n: Number(v.n), dur: Number(v.dur) || 0, msg: v.msg }))
        .sort((a, b) => a.n - b.n);
    } catch (err) {
      showError("Data load nahi hua", "data/videos.json nahi mili. Site ko local server se kholo.");
      return;
    }

    /* meta + activation */
    const [meta, activated] = await Promise.all([window.LS.getMeta(), window.LS.isActivated()]);
    state.previewMids = new Set(meta.preview || []);
    state.activated = activated;

    const n = Number(new URLSearchParams(location.search).get("n"));
    let current = state.all.find((v) => v.n === n);
    if (!current) {
      // invalid link → latest in-progress ya lecture #1
      const prog = Object.entries(window.BS.getProgress());
      if (prog.length) {
        prog.sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0));
        current = state.all.find((v) => v.n === Number(prog[0][0]));
        if (current) toast(`Invalid link tha — #${current.n} se resume kar rahe hain.`, { type: "info", ttl: 3600 });
      }
      if (!current) current = state.all[0];
    }
    if (!current) { showError("Koi lecture nahi mila", "Archive khali hai."); return; }

    state.current = current;
    paintLecture();
    loadVideo(current);
  }

  boot();
})();
