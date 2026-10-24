/* =====================================================================
   app.js — BERSERK STREAM home
   Improvements vs purana version:
     • ek hi state object, koi stale closure nahi
     • infinite scroll me duplicate render guard (purane me duplicate cards aate the)
     • locked card par click → premium dialog (preview wale chalte hain)
     • preview list localStorage me cache (backend sleep me bhi chalta hai)
     • batch names clean + pills, search token-based + keyboard-first
     • window.confirm / alert → custom glass dialogs + toasts
     • bookmarks, in-progress tab, sort, command palette
   ===================================================================== */
(() => {
  "use strict";
  const { $, $$, esc, debounce, fmtDur, fmtTime, fmtBytes, fmtDate,
    batchInfo, cleanTitle, toast, openDialog, closeDialog, confirmDialog, copy,
    getProgress, getProgressFor, recentProgress, clearProgress,
    bookmarks, toggleBookmark, initReveal, isTyping, saveProgress } = window.BS;

  const config = window.APP_CONFIG;
  const PER_PAGE = config.PAGE_SIZE || 36;

  /* ------------------------------ STATE ------------------------------ */
  const state = {
    all: [],
    filtered: [],
    rendered: 0,
    tab: "all",
    batch: "all",
    sort: "oldest",
    query: "",
    activated: false,
    previewMids: new Set(),
    tiers: [],
    metaLive: false,
    adminPw: null,
    loading: false,
    firstPaint: true,
  };

  const el = {
    grid: $("#grid"),
    statusSlot: $("#statusSlot"),
    endSlot: $("#endSlot"),
    sentinel: $("#sentinel"),
    resultCount: $("#resultCount"),
    listTitle: $("#listTitle"),
    batchPills: $("#batchPills"),
    sortSelect: $("#sortSelect"),
    searchInput: $("#searchInput"),
    savedBadge: $("#savedBadge"),
  };

  const playerUrl = (n) => `player.html?n=${encodeURIComponent(n)}`;
  const isFree = (v) => state.activated || !!config.DEV_UNLOCK || state.previewMids.has(String(v.msg));

  /* ------------------------------ brand slots ------------------------------ */
  function paintBranding() {
    const mark = $("#brandMark");
    if (mark) mark.innerHTML = window.BS.SIGIL;
    const sig = $("#sigilSlot");
    if (sig) sig.innerHTML = window.BS.SIGIL;
    const gb = $("#gateBrand"); if (gb) gb.innerHTML = window.BS.SIGIL + "<span>Access Gate</span>";
    const ob = $("#offerBrand"); if (ob) ob.innerHTML = window.BS.SIGIL + "<span>Premium</span>";
  }

  /* ------------------------------ status helpers ------------------------------ */
  function showStatus(html) {
    el.statusSlot.innerHTML = `<div class="status">${html}</div>`;
  }
  function clearStatus() { el.statusSlot.innerHTML = ""; }

  function skeleton(n = 8) {
    el.grid.innerHTML = Array.from({ length: n }).map(() => `
      <div class="card skeleton" aria-hidden="true">
        <div class="sk sk-art"></div>
        <div class="sk-gap"></div>
        <div class="sk sk-line" style="width:82%"></div>
        <div class="sk-gap"></div>
        <div class="sk sk-line" style="width:54%"></div>
        <div class="sk-gap"></div>
      </div>`).join("");
  }

  /* ------------------------------ normalise data ------------------------------ */
  function normalise(videos) {
    return videos
      .map((v) => {
        const b = batchInfo(v.batch);
        return {
          ...v,
          n: Number(v.n),
          dur: Number(v.dur) || 0,
          size: Number(v.size) || 0,
          titleClean: cleanTitle(v.title),
          batchShort: b.short,
          institute: b.institute,
          year: b.year,
          haystack: `${cleanTitle(v.title)} ${v.title} ${b.short} ${b.institute} ${b.raw || ""} ${v.n} ${v.res || ""}`.toLowerCase(),
        };
      })
      .sort((a, b) => a.n - b.n);
  }

  /* ------------------------------ stats ------------------------------ */
  function paintStats() {
    const totalSec = state.all.reduce((s, v) => s + (v.dur || 0), 0);
    $("#statLectures").textContent = state.all.length;
    $("#statHours").textContent = Math.round(totalSec / 3600).toLocaleString();
    $("#statBatches").textContent = new Set(state.all.map((v) => v.batchShort)).size;
    const done = Object.keys(getProgress()).length;
    $("#statWatched").textContent = done;
  }

  /* ------------------------------ filtering ------------------------------ */
  function computeFiltered() {
    const tokens = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const prog = getProgress();
    const saved = bookmarks();

    let out = state.all.filter((v) => {
      if (state.batch !== "all" && v.batchShort !== state.batch) return false;
      if (state.tab === "saved" && !saved.has(v.n)) return false;
      if (state.tab === "progress" && !(prog[v.n] && prog[v.n].pct > 0.5)) return false;
      if (tokens.length) {
        return tokens.every((t) => v.haystack.includes(t));
      }
      return true;
    });

    switch (state.sort) {
      case "newest": out = out.sort((a, b) => b.n - a.n); break;
      case "short": out = out.sort((a, b) => (a.dur || 1e9) - (b.dur || 1e9)); break;
      case "long": out = out.sort((a, b) => (b.dur || 0) - (a.dur || 0)); break;
      default: out = out.sort((a, b) => a.n - b.n);
    }
    return out;
  }

  /* ------------------------------ card ------------------------------ */
  function cardHTML(v, index) {
    const prog = getProgressFor(v.n);
    const saved = bookmarks().has(v.n);
    const free = isFree(v);
    const pct = prog ? Math.max(2, Math.min(100, prog.pct || 0)) : 0;

    const chips = [
      v.res ? `<span class="chip chip-res">${esc(v.res)}</span>` : "",
      prog ? `<span class="chip chip-progress">${prog.pct >= 96 ? "Done ✓" : prog.pct + "%"}</span>` : "",
      free ? "" : `<span class="chip chip-lock">${window.BS.icon("lock")} Premium</span>`,
    ].join("");

    return `
    <article class="card" data-n="${v.n}" tabindex="0" role="link"
      aria-label="Lecture ${v.n}: ${esc(v.titleClean)}" style="animation-delay:${Math.min(index, 12) * 18}ms">
      <div class="card-art">
        <span class="card-sigil" aria-hidden="true">${window.BS.SIGIL}</span>
        <div class="card-top">${chips}</div>
        <span class="card-num"><small>#</small>${v.n}</span>
        <div class="card-play"><span class="play-orb">${window.BS.icon(free ? "play" : "lock")}</span></div>
        ${pct ? `<div class="card-bar"><i style="width:${pct}%"></i></div>` : ""}
      </div>
      <div class="card-body">
        <h3 class="card-title">${esc(v.titleClean)}</h3>
        <p class="card-batch">${esc(v.batchShort)}</p>
        <div class="card-foot">
          <span>${window.BS.icon("clock").replace("<svg", '<svg style="width:12px;height:12px;display:inline-block;vertical-align:-2px;margin-right:3px"')} ${fmtDur(v.dur)}</span>
          <span class="dot-sep"></span>
          <span>${esc(v.institute)}</span>
          <span class="spacer"></span>
          <button class="bookmark-btn ${saved ? "on" : ""}" data-bookmark="${v.n}" aria-label="Bookmark" aria-pressed="${saved}">
            ${window.BS.icon("bookmark")}
          </button>
        </div>
      </div>
    </article>`;
  }

  /* ------------------------------ render ------------------------------ */
  function resetAndRender() {
    state.filtered = computeFiltered();
    state.rendered = 0;
    el.grid.innerHTML = "";
    el.endSlot.innerHTML = "";
    el.resultCount.textContent = state.filtered.length;

    // titles
    const tabLabel = { all: "All lectures", progress: "In progress", saved: "Saved lectures" }[state.tab];
    el.listTitle.textContent = state.batch === "all" ? tabLabel : `${tabLabel} · ${state.batch}`;

    if (!state.filtered.length) {
      showStatus(`
        <span class="status-sigil">${window.BS.SIGIL}</span>
        <h3>Kuch nahi mila</h3>
        <p>${state.query
          ? `"<b>${esc(state.query)}</b>" se koi lecture match nahi hua. Spelling check karo, ya filter hata do.`
          : state.tab === "saved" ? "Abhi tak koi lecture save nahi kiya. Card ke corner wale bookmark se save karo."
          : state.tab === "progress" ? "Koi adhoora lecture nahi. Shuru karo — progress khud save hogi."
          : "Is batch me lectures nahi mile."}</p>
        <button class="btn btn-ghost btn-sm" data-reset-filters>Filters reset karo</button>`);
      renderChunk();
      return;
    }
    clearStatus();
    renderChunk();
  }

  function renderChunk() {
    if (state.rendered >= state.filtered.length) return;
    const slice = state.filtered.slice(state.rendered, state.rendered + PER_PAGE);
    const frag = document.createDocumentFragment();
    slice.forEach((v, i) => {
      const wrap = document.createElement("div");
      wrap.innerHTML = cardHTML(v, i);
      frag.appendChild(wrap.firstElementChild);
    });
    el.grid.appendChild(frag);
    state.rendered += slice.length;

    if (state.rendered >= state.filtered.length) {
      el.endSlot.innerHTML = `<div class="end-note">${state.filtered.length ? "Yahin tak — sab dekh liya" : ""}</div>`;
      if (state.firstPaint) { /* noop */ }
      state.firstPaint = false;
    } else {
      el.endSlot.innerHTML = "";
    }
  }

  /* infinite scroll */
  function setupInfiniteScroll() {
    if (!("IntersectionObserver" in window)) {
      window.addEventListener("scroll", () => {
        if (window.innerHeight + window.scrollY > document.body.offsetHeight - 900) renderChunk();
      }, { passive: true });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        if (state.rendered < state.filtered.length) renderChunk();
      }
    }, { rootMargin: "800px 0px" });
    io.observe(el.sentinel);
  }

  /* ------------------------------ resume rail ------------------------------ */
  function renderResume() {
    const recent = recentProgress(8);
    const sec = $("#continueSection");
    const rail = $("#resumeRail");
    const items = recent
      .map((p) => ({ p, v: state.all.find((v) => v.n === p.n) }))
      .filter((x) => x.v);

    if (!items.length) {
      sec.classList.add("hidden");
      $("#resumeTopLabel").textContent = "Pehla lecture shuru karo";
      $("#resumeTopBtn").dataset.n = state.all[0] ? state.all[0].n : "";
      return;
    }

    rail.innerHTML = items.map(({ p, v }) => `
      <a class="resume-card" href="${playerUrl(v.n)}" data-n="${v.n}">
        <div class="resume-art">
          <span>#${v.n}</span>
          <span class="resume-play">${window.BS.icon("play")}</span>
        </div>
        <div class="resume-info">
          <p class="resume-label">Chhoda tha yahan</p>
          <p class="resume-title">${esc(v.titleClean)}</p>
          <p class="resume-meta">${fmtTime(p.t)} / ${fmtDur(v.dur)} · ${p.pct}%</p>
          <div class="progress-track"><div class="progress-fill" style="width:${Math.max(3, p.pct)}%"></div></div>
        </div>
      </a>`).join("");

    sec.classList.remove("hidden");
    $("#resumeTopLabel").textContent = `#${items[0].p.n} se aage`;
    $("#resumeTopBtn").dataset.n = items[0].p.n;
  }

  /* ------------------------------ batch pills ------------------------------ */
  function renderBatchPills() {
    const counts = new Map();
    state.all.forEach((v) => counts.set(v.batchShort, (counts.get(v.batchShort) || 0) + 1));
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

    const html = [`<button class="pill ${state.batch === "all" ? "active" : ""}" data-batch="all">Sab <span class="c">${state.all.length}</span></button>`]
      .concat(sorted.map(([name, c]) =>
        `<button class="pill ${state.batch === name ? "active" : ""}" data-batch="${esc(name)}">${esc(name)} <span class="c">${c}</span></button>`))
      .join("");
    el.batchPills.innerHTML = html;
  }

  /* ------------------------------ events: grid ------------------------------ */
  function openLecture(v, { fromContinue = false } = {}) {
    if (!isFree(v)) { openOffer(v); return; }
    location.href = playerUrl(v.n);
  }

  el.grid.addEventListener("click", (e) => {
    const bm = e.target.closest("[data-bookmark]");
    if (bm) {
      e.preventDefault();
      e.stopPropagation();
      const n = Number(bm.dataset.bookmark);
      const on = toggleBookmark(n);
      bm.classList.toggle("on", on);
      bm.setAttribute("aria-pressed", String(on));
      toast(on ? `#${n} saved — <b>Saved</b> tab me milega.` : `#${n} saved se hata diya.`, { type: on ? "ok" : "info", ttl: 1900 });
      paintSavedBadge();
      if (state.tab === "saved") resetAndRender();
      return;
    }
    const card = e.target.closest(".card");
    if (!card) return;
    const v = state.all.find((x) => x.n === Number(card.dataset.n));
    if (v) openLecture(v);
  });

  el.grid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".card");
    if (!card || e.target.closest("[data-bookmark]")) return;
    e.preventDefault();
    const v = state.all.find((x) => x.n === Number(card.dataset.n));
    if (v) openLecture(v);
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-reset-filters]")) {
      state.query = ""; state.batch = "all"; state.tab = "all"; state.sort = "oldest";
      el.searchInput.value = "";
      el.sortSelect.value = "oldest";
      $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "all"));
      renderBatchPills();
      resetAndRender();
    }
  });

  /* tabs */
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.tab = tab.dataset.tab;
      $$(".tab").forEach((t) => {
        const on = t === tab;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", String(on));
      });
      resetAndRender();
      window.scrollTo({ top: el.grid.offsetTop - 140, behavior: "smooth" });
    });
  });

  /* batch pills */
  el.batchPills.addEventListener("click", (e) => {
    const p = e.target.closest("[data-batch]");
    if (!p) return;
    state.batch = p.dataset.batch;
    $$(".pill", el.batchPills).forEach((x) => x.classList.toggle("active", x === p));
    resetAndRender();
  });

  /* sort */
  el.sortSelect.addEventListener("change", () => {
    state.sort = el.sortSelect.value;
    resetAndRender();
  });

  /* search */
  el.searchInput.addEventListener("input", debounce(() => {
    state.query = el.searchInput.value;
    resetAndRender();
  }, 180));

  function paintSavedBadge() {
    const n = bookmarks().size;
    el.savedBadge.textContent = n;
    el.savedBadge.classList.toggle("hidden", n === 0);
  }

  /* ------------------------------ hero buttons ------------------------------ */
  $("#resumeTopBtn").addEventListener("click", () => {
    const n = Number($("#resumeTopBtn").dataset.n);
    const v = state.all.find((x) => x.n === n) || state.all[0];
    if (v) openLecture(v);
    else toast("Abhi data load nahi hua.", { type: "info" });
  });

  $("#randomBtn").addEventListener("click", () => {
    const pool = state.all.filter(isFree);
    const list = pool.length ? pool : state.all;
    if (!list.length) return;
    const v = list[Math.floor(Math.random() * list.length)];
    toast(`Roulette: <b>#${v.n}</b> — ${esc(v.titleClean)}`, { type: "info", ttl: 2200 });
    openLecture(v);
  });

  $("#clearProgressBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "History saaf karein?",
      body: "Saari <b>progress</b> (kahan tak dekha) mit jayegi. Saved lectures safe rahenge.",
      okLabel: "Haan, saaf karo",
      cancelLabel: "Rehne do",
    });
    if (!ok) return;
    clearProgress();
    renderResume();
    paintStats();
    resetAndRender();
    toast("Watch history clear ho gayi.", { type: "ok" });
  });

  /* ------------------------------ activation UI ------------------------------ */
  function paintPlanNote() {
    const info = window.LS.planInfo();
    const note = $("#planNote");
    const dot = $("#keyDot");
    const cta = $("#unlockCtaLabel");
    if (!info) {
      note.classList.add("hidden");
      dot.classList.remove("hidden");
      cta.textContent = "Premium unlock";
      return;
    }
    dot.classList.add("hidden");
    cta.textContent = "Subscription";
    note.classList.remove("hidden");
    if (info.lifetime) {
      note.className = "msg ok";
      note.innerHTML = `✦ <b>Lifetime access</b> active — saare lectures khule hain.`;
    } else if (info.expired) {
      note.className = "msg err";
      note.innerHTML = `⚠️ Subscription <b>expire</b> ho gayi — naya key le lo.`;
    } else {
      note.className = "msg info";
      const d = info.daysLeft;
      note.innerHTML = `✦ Access active — <b>${d} din</b> baaki${info.key_expires ? ` (expiry ${fmtDate(info.key_expires)})` : ""}.`;
    }
  }

  function openGate() {
    $("#gateMsg").textContent = "";
    openDialog($("#gateOverlay"));
  }

  $("#keyBtn").addEventListener("click", openGate);
  $("#unlockCtaBtn").addEventListener("click", () => {
    if (state.activated) {
      const info = window.LS.planInfo() || {};
      toast(info.lifetime ? "Lifetime access active ✦" : `Access active — ${info.daysLeft ?? "?"} din baaki.`, { type: "ok" });
    } else openGate();
  });

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-close]");
    if (t) closeDialog($("#" + t.dataset.close));
  });

  $("#adminToggle").addEventListener("click", () => $("#adminBox").classList.toggle("hidden"));
  $("#reloadLink").addEventListener("click", (e) => { e.preventDefault(); location.reload(); });

  $("#clearKeyBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Key hata dein?",
      body: "Is device se activation mit jayegi. Wapas key daal ke activate kar sakte ho.",
      okLabel: "Hata do", cancelLabel: "Nahi",
    });
    if (!ok) return;
    window.LS.clearActivation();
    toast("Activation hata di gayi.", { type: "info" });
    setTimeout(() => location.reload(), 600);
  });

  $("#activateBtn").addEventListener("click", async () => {
    const key = $("#keyInput").value.trim();
    const msg = $("#gateMsg");
    if (!key) { msg.className = "msg err"; msg.textContent = "Pehle key daalo."; return; }
    const mode = $("input[name='keyMode']:checked")?.value || "ls";
    const btn = $("#activateBtn");
    btn.disabled = true;
    btn.textContent = "Check kar rahe hain…";
    msg.className = "msg info";
    msg.textContent = "Server se baat ho rahi hai…";

    const r = mode === "sub" ? await window.LS.redeemCode(key) : await window.LS.activate(key);
    btn.disabled = false;
    btn.textContent = "Activate karo";

    if (r.ok) {
      state.activated = true;
      msg.className = "msg ok";
      const valid = r.days ? `${r.days} din` : "Lifetime";
      msg.textContent = `✓ Activated! Validity: ${valid}${r.key_expires ? ` · expiry ${fmtDate(r.key_expires)}` : ""}`;
      toast("Access unlocked — ab saare lectures khule hain 🔥", { type: "ok" });
      paintPlanNote();
      resetAndRender();
      renderResume();
      setTimeout(() => closeDialog($("#gateOverlay")), 900);
    } else {
      msg.className = "msg err";
      msg.textContent = "✕ " + (r.message || "Activation fail.");
    }
  });

  $("#keyInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#activateBtn").click();
  });

  /* ------------------------------ premium offer ------------------------------ */
  let offerVideo = null;

  function paintTiers() {
    const sel = $("#tierSelect");
    sel.innerHTML = "";
    if (!state.tiers.length) {
      sel.innerHTML = `<option value="">Packs load nahi hue (backend off hai?)</option>`;
      $("#tierPrice").innerHTML = "";
      return;
    }
    state.tiers.forEach((t) => {
      const o = document.createElement("option");
      o.value = t.days;
      o.textContent = `${t.label} — ₹${t.price}`;
      sel.appendChild(o);
    });
    paintTierPrice();
  }
  function paintTierPrice() {
    const days = parseInt($("#tierSelect").value || "0", 10);
    const t = state.tiers.find((x) => x.days === days);
    $("#tierPrice").innerHTML = t
      ? `₹${t.price}<small>${esc(t.label)} · one-time</small>`
      : "";
  }
  $("#tierSelect").addEventListener("change", paintTierPrice);

  function openOffer(video) {
    offerVideo = video || null;
    $("#offerResult").classList.add("hidden");
    $("#offerMsg").textContent = "";
    $("#offerBtn").disabled = false;
    if (offerVideo) {
      $("#offerTitle").innerHTML = `<em>#${offerVideo.n}</em> sealed hai`;
      $("#offerTitle").innerHTML = `Lecture <em>#${offerVideo.n}</em> sealed hai`;
    }
    openDialog($("#offerOverlay"));
  }

  $("#haveKeyLink").addEventListener("click", () => {
    closeDialog($("#offerOverlay"));
    setTimeout(openGate, 220);
  });

  $("#offerBtn").addEventListener("click", async () => {
    const email = $("#offerEmail").value.trim();
    const msg = $("#offerMsg");
    const btn = $("#offerBtn");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.className = "msg err"; msg.textContent = "Sahi email daalo (jaise: name@gmail.com)."; return;
    }
    const days = parseInt($("#tierSelect").value || "0", 10);
    if (!state.tiers.length) { msg.className = "msg err"; msg.textContent = "Packs available nahi — backend check karo."; return; }

    btn.disabled = true; btn.textContent = "Request bheji ja rahi hai…";
    const r = await window.LS.request("/voucher/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, days }),
    });
    btn.disabled = false; btn.textContent = "Request karo";

    if (r.ok && r.data && r.data.ok) {
      $("#offerRef").textContent = r.data.ref;
      $("#offerResult").classList.remove("hidden");
      msg.className = "msg ok";
      msg.textContent = `✓ Request ban gayi — ₹${r.data.price} (${r.data.label})`;
      toast("Request save ho gayi — REF code copy karke admin ko bhejo.", { type: "ok", ttl: 4200 });
    } else {
      msg.className = "msg err";
      msg.textContent = "✕ " + ((r.data && (r.data.error || r.data.message)) || "Request fail.");
    }
  });

  /* ------------------------------ ADMIN ------------------------------ */
  const adminMsg = (t, type = "info") => { const m = $("#adminMsg"); m.className = `msg ${type}`; m.textContent = t; };

  async function loadAdminStats(pw) {
    const r = await window.LS.request("/admin/stats", { headers: { "x-admin-pass": pw } });
    const d = r.data || {};
    if (!r.ok || !d.ok) return false;
    $("#statTotal").textContent = d.total ?? 0;
    $("#statUsed").textContent = d.used ?? 0;
    $("#statAvail").textContent = d.available ?? 0;
    $("#statExpired").textContent = d.expired ?? 0;
    const vw = $("#adminViews");
    vw.textContent = `Total views: ${d.views ?? 0}`;
    vw.classList.remove("hidden");
    return true;
  }

  async function loadKeyList(pw) {
    const r = await window.LS.request("/admin/list", { headers: { "x-admin-pass": pw } });
    const d = r.data || {};
    if (!r.ok || !d.ok || !Array.isArray(d.keys)) return;
    const body = $("#keylistBody");
    body.innerHTML = d.keys.length ? d.keys.map((k) => `
      <tr>
        <td class="mono">${esc(k.code)}</td>
        <td>${esc(k.note || "—")}</td>
        <td>${esc(k.email || "—")}</td>
        <td><span class="tag ${esc(k.status || "")}">${esc(k.status || "?")}</span></td>
        <td>${k.days ? k.days + "d" : "∞"}</td>
        <td>${fmtDate(k.expires)}</td>
        <td>${k.status === "revoked" ? "" : `<button class="btn btn-ghost btn-xs revoke-btn" data-code="${esc(k.code)}">Revoke</button>`}</td>
      </tr>`).join("") : `<tr><td colspan="7" class="msg info" style="text-align:center">Koi key nahi.</td></tr>`;
  }

  async function loadRequests() {
    if (!state.adminPw) return;
    const r = await window.LS.request("/admin/requests", { headers: { "x-admin-pass": state.adminPw } });
    const d = r.data || {};
    if (!r.ok || !d.ok || !Array.isArray(d.requests)) return;
    const body = $("#reqBody");
    body.innerHTML = d.requests.length ? d.requests.map((q) => `
      <tr>
        <td class="mono">${esc(q.ref)}</td>
        <td>${esc(q.email || "—")}</td>
        <td>${q.days ? q.days + " din" : "Lifetime"}</td>
        <td>₹${q.price || 0}</td>
        <td><span class="tag ${esc(q.status || "")}">${esc(q.status || "?")}</span></td>
        <td>${q.status === "pending"
          ? `<button class="btn btn-ember btn-xs markpaid-btn" data-ref="${esc(q.ref)}">Mark paid</button>`
          : q.key ? `<span class="mono">${esc(q.key)}</span>` : "<em>—</em>"}</td>
      </tr>`).join("") : `<tr><td colspan="6" class="msg info" style="text-align:center">Koi request nahi.</td></tr>`;
  }

  $("#adminUnlockBtn").addEventListener("click", async () => {
    const pw = $("#adminPassInput").value.trim();
    if (!pw) { adminMsg("Pehle password daalo.", "err"); return; }
    adminMsg("Check kar rahe hain…", "info");
    const ok = await loadAdminStats(pw);
    if (ok) {
      state.adminPw = pw;
      $("#adminStats").classList.remove("hidden");
      adminMsg("✓ Unlock ho gaya — ab generate/revoke/export sab chalega.", "ok");
      loadKeyList(pw);
      loadRequests();
    } else {
      adminMsg("Password galat hai, ya backend off hai.", "err");
    }
  });
  $("#adminPassInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#adminUnlockBtn").click(); });

  $("#genKeyBtn").addEventListener("click", async () => {
    const gm = $("#genMsg");
    if (!state.adminPw) { gm.className = "msg err"; gm.textContent = "Pehle admin password se unlock karo."; return; }
    const note = $("#noteInput").value.trim();
    const days = parseInt($("#daysSelect").value || "0", 10);
    const r = await window.LS.request("/admin/newkey", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-pass": state.adminPw },
      body: JSON.stringify({ note, days }),
    });
    const d = r.data || {};
    if (d.ok) {
      gm.className = "msg ok";
      gm.innerHTML = `Naya key: <b class="mono">${esc(d.code)}</b> ${d.days ? `(${d.days} din)` : "(Lifetime)"} — <button class="link-btn" data-copy="${esc(d.code)}" style="font-size:12px">copy</button>`;
      toast("Key generate ho gayi ✦", { type: "ok" });
      loadAdminStats(state.adminPw);
      loadKeyList(state.adminPw);
    } else {
      gm.className = "msg err";
      gm.textContent = "Fail: " + (d.error || d.message || "unknown");
    }
  });

  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-copy]");
    if (c) copy(c.dataset.copy);
  });

  $("#exportBtn").addEventListener("click", async () => {
    if (!state.adminPw) { const gm = $("#genMsg"); gm.className = "msg err"; gm.textContent = "Pehle unlock karo."; return; }
    try {
      const res = await fetch(`${config.BACKEND}/admin/export`, { headers: { "x-admin-pass": state.adminPw } });
      if (!res.ok) throw new Error("bad");
      const csv = await res.text();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `berserk-keys-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      toast("CSV download ho gaya.", { type: "ok" });
    } catch {
      toast("Export fail — backend off lag raha hai.", { type: "err" });
    }
  });

  $("#keylistBody").addEventListener("click", async (e) => {
    const b = e.target.closest(".revoke-btn");
    if (!b || !state.adminPw) return;
    const code = b.dataset.code;
    const ok = await confirmDialog({
      title: "Key revoke karein?",
      body: `Key <b class="mono">${esc(code)}</b> turant band ho jayegi.`,
      okLabel: "Revoke", cancelLabel: "Nahi",
    });
    if (!ok) return;
    const r = await window.LS.request("/admin/keys/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-pass": state.adminPw },
      body: JSON.stringify({ code }),
    });
    if (r.data && r.data.ok) { toast("Key revoke ho gayi.", { type: "ok" }); loadKeyList(state.adminPw); loadAdminStats(state.adminPw); }
    else toast("Revoke fail: " + ((r.data && r.data.error) || "unknown"), { type: "err" });
  });

  $("#reqBody").addEventListener("click", async (e) => {
    const b = e.target.closest(".markpaid-btn");
    if (!b || !state.adminPw) return;
    const ref = b.dataset.ref;
    const ok = await confirmDialog({
      title: "Cash mil gaya?",
      body: `REF <b class="mono">${esc(ref)}</b> ko paid mark karein? Key generate hoke email pe jayegi.`,
      okLabel: "Mark paid", cancelLabel: "Nahi", danger: false,
    });
    if (!ok) return;
    const r = await window.LS.request("/admin/requests/markpaid", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-pass": state.adminPw },
      body: JSON.stringify({ ref }),
    });
    const d = r.data || {};
    if (d.ok) {
      toast(`Key <b class="mono">${esc(d.key)}</b> → ${esc(d.email || "")}`, { type: "ok", ttl: 5000 });
      loadRequests();
      loadKeyList(state.adminPw);
      loadAdminStats(state.adminPw);
    } else toast("Mark paid fail: " + (d.error || "unknown"), { type: "err" });
  });

  /* ------------------------------ COMMAND PALETTE ------------------------------ */
  const palette = { open: false, items: [], sel: 0 };

  const COMMANDS = [
    { id: "resume", title: "Resume karo jahan chhoda tha", sub: "Latest adhoora lecture", icon: "play", run: () => $("#resumeTopBtn").click() },
    { id: "random", title: "Random lecture kholo", sub: "Roulette", icon: "sword", run: () => $("#randomBtn").click() },
    { id: "theme", title: "Theme badlo — Night / Golden Age", sub: "Appearance", icon: "sun", run: () => window.BS.toggleTheme() },
    { id: "saved", title: "Saved lectures dekho", sub: "Bookmarks", icon: "bookmark", run: () => $(".tab[data-tab='saved']").click() },
    { id: "progress", title: "In-progress lectures", sub: "Adhoore", icon: "clock", run: () => $(".tab[data-tab='progress']").click() },
    { id: "clearhistory", title: "Watch history clear karo", sub: "Progress reset", icon: "alert", run: () => $("#clearProgressBtn").click() },
    { id: "gate", title: "Activation key daalo", sub: "Access gate", icon: "key", run: () => openGate() },
    { id: "unlock", title: "Premium packs dekho", sub: "Subscription", icon: "crown", run: () => openOffer(null) },
  ];

  function buildPalette() {
    const q = $("#paletteInput").value.trim().toLowerCase();
    const out = [];

    if (!q || "theme".includes(q) || "night".includes(q)) { /* noop */ }

    COMMANDS.filter((c) => !q || c.title.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q))
      .forEach((c) => out.push({ ...c, kind: "cmd" }));

    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      const videos = state.all
        .filter((v) => tokens.every((t) => v.haystack.includes(t)))
        .slice(0, 8);
      videos.forEach((v) => out.push({
        kind: "lec", id: `lec-${v.n}`, title: v.titleClean, sub: `#${v.n} · ${v.batchShort} · ${fmtDur(v.dur)}`,
        icon: "play", run: () => { closePalette(); openLecture(v); },
      }));
    }

    palette.items = out;
    palette.sel = 0;
    paintPalette();
  }

  function paintPalette() {
    const list = $("#paletteList");
    if (!palette.items.length) {
      list.innerHTML = `<div class="status" style="padding:26px 10px"><p>Kuch nahi mila.</p></div>`;
      return;
    }
    list.innerHTML = palette.items.map((it, i) => `
      <button class="palette-item ${i === palette.sel ? "sel" : ""}" data-idx="${i}">
        <span class="p-ico">${window.BS.icon(it.icon)}</span>
        <span class="p-txt"><strong>${esc(it.title)}</strong><small>${esc(it.sub || "")}</small></span>
        ${it.kind === "cmd" ? `<span class="p-key">cmd</span>` : ""}
      </button>`).join("");
  }

  function openPalette() {
    palette.open = true;
    $("#paletteInput").value = "";
    openDialog($("#paletteOverlay"), { focus: false });
    buildPalette();
    setTimeout(() => $("#paletteInput").focus(), 80);
  }
  function closePalette() {
    palette.open = false;
    closeDialog($("#paletteOverlay"));
  }
  function paletteMove(dir) {
    if (!palette.items.length) return;
    palette.sel = (palette.sel + dir + palette.items.length) % palette.items.length;
    paintPalette();
    const active = $("#paletteList .palette-item.sel");
    if (active) active.scrollIntoView({ block: "nearest" });
  }
  function paletteRun() {
    const it = palette.items[palette.sel];
    if (!it) return;
    if (it.kind === "cmd") closePalette();
    it.run();
  }

  $("#paletteBtn").addEventListener("click", openPalette);
  $("#paletteInput").addEventListener("input", debounce(buildPalette, 90));
  $("#paletteList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-idx]");
    if (!b) return;
    palette.sel = Number(b.dataset.idx);
    paletteRun();
  });
  $("#paletteOverlay").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); paletteMove(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); paletteMove(-1); }
    else if (e.key === "Enter") { e.preventDefault(); paletteRun(); }
  });

  /* ------------------------------ keyboard shortcuts ------------------------------ */
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      palette.open ? closePalette() : openPalette();
      return;
    }
    if (e.key === "/" && !isTyping()) {
      e.preventDefault();
      el.searchInput.focus();
      el.searchInput.select();
      return;
    }
    if (e.key === "Escape" && palette.open) { closePalette(); return; }
    if (isTyping() || palette.open) return;

    if (e.key === "t") { window.BS.toggleTheme(); return; }
    if (e.key === "r") { $("#randomBtn").click(); return; }
    if (e.key === "s") { $(".tab[data-tab='saved']").click(); return; }
    if (e.key === "?") { openPalette(); }
  });

  /* ------------------------------ announce ------------------------------ */
  function paintAnnounce() {
    if (!config.ANNOUNCE) return;
    $("#announceText").textContent = config.ANNOUNCE;
    $("#announce").classList.remove("hidden");
  }

  /* ------------------------------ BOOT ------------------------------ */
  async function boot() {
    paintBranding();
    paintAnnounce();
    paintSavedBadge();
    window.BS.boot();
    initReveal();

    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    $("#kbdMod").textContent = isMac ? "⌘" : "Ctrl";

    skeleton(10);
    showStatus(`<span class="status-sigil">${window.BS.SIGIL}</span><h3>Lectures load ho rahe hain</h3><p>Ek second — archive khul raha hai.</p>`);

    /* ---- data ---- */
    try {
      const res = await fetch(config.DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      state.all = normalise(data.videos || []);
      if (!state.all.length) throw new Error("empty");

      el.grid.innerHTML = "";
      clearStatus();
      paintStats();
      renderBatchPills();
      renderResume();
      resetAndRender();
      setupInfiniteScroll();
    } catch (err) {
      console.error("[data]", err);
      el.grid.innerHTML = "";
      showStatus(`
        <span class="status-sigil">${window.BS.SIGIL}</span>
        <h3>Archive nahi khula</h3>
        <p><b>data/videos.json</b> load nahi hui. Check karo ki file wahi hai — aur site ko file:// se mat kholo, local server se kholo.</p>
        <button class="btn btn-ghost btn-sm" onclick="location.reload()">Retry</button>`);
      return;
    }

    /* ---- auth + tiers (parallel, non-blocking) ---- */
    paintPlanNote();
    window.LS.isActivated().then((ok) => {
      state.activated = ok;
      paintPlanNote();
      resetAndRender();
      renderResume();
    });

    window.LS.getMeta().then((meta) => {
      state.tiers = meta.tiers || [];
      state.previewMids = new Set(meta.preview || []);
      state.metaLive = meta.live;
      paintTiers();
      if (!meta.live) {
        toast("Backend se connect nahi hua — offlined mode. Pehle se cached previews chalenge.", { type: "info", ttl: 5200 });
      }
      resetAndRender();
    });

    /* ---- deep links: #unlock / #offer ---- */
    const hash = (location.hash || "").toLowerCase();
    if (hash === "#unlock" || hash === "#gate") setTimeout(openGate, 400);
    if (hash === "#offer" || hash === "#premium") setTimeout(() => openOffer(null), 400);

    /* ---- 60s interval: refresh states / re-render resume ---- */
    setInterval(() => {
      if (document.visibilityState !== "visible") return;
      renderResume();
    }, 60000);
  }

  boot();
})();
