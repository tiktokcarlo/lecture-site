// ============ app.js — Home page logic ============
(() => {
  const config = window.APP_CONFIG;
  const $ = (s, c = document) => c.querySelector(s);

  let allVideos = [];
  let searchTerm = "";
  let activeBatch = "all";
  const PER_PAGE = 36;
  let rendered = 0;

  const grid = $("#grid");
  const statusMsg = $("#statusMsg");
  const sentinel = $("#sentinel");
  const totalCount = $("#totalCount");
  const batchFilter = $("#batchFilter");
  const continueSection = $("#continueSection");

  // ---------- Theme ----------
  const themeToggle = $("#themeToggle");
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); localStorage.setItem("lstream_theme", t); }
  function initTheme() { applyTheme(localStorage.getItem("lstream_theme") || "dark"); }
  themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  // ---------- Utils ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  const playerUrl = (n) => `player.html?n=${encodeURIComponent(n)}`;

  // ---------- Preview / subscription state ----------
  let previewMids = new Set();   // ye Telegram msg IDs bina key chalte hain
  let isActivatedFlag = false;
  let TIERS_CACHE = [];
  const isFree = (v) => isActivatedFlag || previewMids.has(String(v.msg));

  // ---------- Continue Watching ---------- 
  const WATCH_KEY = "lstream_progress_v1";
  function loadProgress() {
    try { const t = JSON.parse(localStorage.getItem(WATCH_KEY) || "{}"); return t || {}; } catch { return {}; }
  }
  function renderContinue() {
    const prog = loadProgress();
    let best = null;
    for (const key in prog) {
      const p = prog[key];
      if (!p) continue;
      if (!best || (p.updated || 0) > (best.updated || 0)) best = { n: Number(key), p };
    }
    if (!best) return;
    const vid = allVideos.find((v) => v.n === best.n);
    if (!vid) return;
    const pct = vid.dur ? Math.min(100, best.p.pct || 0) : 0;
    $("#continueNum").textContent = `#${vid.n}`;
    $("#continueTitle").textContent = vid.title;
    $("#continueMeta").textContent = `${fmtTime(best.p.t)} / ${fmtDur(vid.dur)} • ${vid.batch}`;
    $("#continueBar").style.width = pct + "%";
    $("#continueCard").href = playerUrl(vid.n);
    continueSection.classList.remove("hidden");
  }
// ---------- Card ----------
  function cardHTML(v) {
    return `
      <a class="video-card" href="${playerUrl(v.n)}">
        <div class="thumbs">
          <div class="thumb-top">
            <span class="lec-num-chip">#${v.n}</span>
            <span class="lec-res-chip">${esc(v.res || "")}</span>
            ${isFree(v) ? "" : '<span class="lock-chip">🔒</span>'}
          </div>
          <h3 class="thumb-title">${esc(v.title)}</h3>
          <div class="thumb-batch">${esc(v.batch)}</div>
        </div>
        <div class="card-footer">
          <span class="lec-batch-name">${esc(v.batch)}</span>
          <span class="lec-dur">▶ ${fmtDur(v.dur)}</span>
        </div>
      </a>`;
  }

  // ---------- Filtering ----------
  function getFiltered() {
    const term = searchTerm.trim().toLowerCase();
    return allVideos.filter((v) => {
      if (activeBatch !== "all" && v.batch !== activeBatch) return false;
      if (!term) return true;
      return v.title.toLowerCase().includes(term) ||
             v.batch.toLowerCase().includes(term) ||
             String(v.n).includes(term) ||
             (v.res || "").toLowerCase().includes(term);
    });
  }

  // ---------- Render (infinite scroll) ----------
  function renderChunk() {
    const filtered = getFiltered();
    const slice = filtered.slice(rendered, rendered + PER_PAGE);
    const frag = document.createDocumentFragment();
    slice.forEach((v) => {
      const d = document.createElement("div");
      d.innerHTML = cardHTML(v);
      frag.appendChild(d.firstElementChild);
    });
    grid.appendChild(frag);
    rendered += slice.length;

    if (rendered > 0) statusMsg.classList.add("hidden");
    const done = sentinel.querySelector(".status-done");
    if (rendered >= filtered.length) {
      if (!done) {
        const el = document.createElement("div");
        el.className = "status-done";
        el.textContent = filtered.length ? `🎉 Saare ${filtered.length} lectures aa gaye.` : "Koi lecture nahi mila.";
        sentinel.appendChild(el);
      }
    } else if (done) {
      done.remove();
    }
  }

  function resetRender() {
    grid.innerHTML = ""; rendered = 0; sentinel.innerHTML = "";
    const filtered = getFiltered();
    if (!filtered.length) {
      statusMsg.classList.remove("hidden");
      statusMsg.textContent = searchTerm ? "Koi result nahi mila 😕" : "Koi lecture nahi.";
    } else {
      statusMsg.textContent = "Scroll karo ya search me type karo 🔎";
      renderChunk();
    }
  }
// ---------- Infinite scroll ----------
  const io = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) renderChunk();
  }, { rootMargin: "600px" });
  io.observe(sentinel);

  // ---------- Batch filter ----------
  function populateBatches() {
    const counts = {};
    allVideos.forEach((v) => (counts[v.batch] = (counts[v.batch] || 0) + 1));
    Object.keys(counts).sort((a, b) => a.localeCompare(b)).forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b; opt.textContent = `${b} (${counts[b]})`;
      batchFilter.appendChild(opt);
    });
  }
  batchFilter.addEventListener("change", (e) => { activeBatch = e.target.value; resetRender(); });

  // ---------- Search ----------
  const searchInput = $("#searchInput");
  let debounce;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { searchTerm = searchInput.value; resetRender(); }, 150);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault(); searchInput.focus();
    }
  });

  // ---------- Load data ----------
  async function loadData() {
    try {
      const res = await fetch(config.DATA_URL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      allVideos = data.videos || [];
      totalCount.textContent = allVideos.length + " lectures";
      populateBatches();
      renderContinue();
      resetRender();
      // plan expiry note
      try {
        const st = JSON.parse(localStorage.getItem("lstream_activation_v1") || "{}");
        if (st && st.key_expires) {
          const left = Math.ceil((st.key_expires - Date.now() / 1000) / 86400);
          const sub = $("#subNote");
          if (left > 0) sub.textContent = `⏳ Aapki subscription ${left} din baaki hai (expiry: ${new Date(st.key_expires * 1000).toLocaleDateString()})`;
          else if (left <= 0) sub.textContent = "⏳ Aapki subscription expire ho gayi hai — naya key le lo.";
          sub.classList.remove("hidden");
        }
      } catch (e) { /* ignore */ }
    } catch (err) {
      console.error(err);
      statusMsg.textContent = "❌ videos.json load nahi hua. scraper.py chala ke generate karo (README dekho).";
      statusMsg.classList.remove("hidden");
    }
  }

  // ---------- Activation gate ----------
  function showStatus(t) { statusMsg.textContent = t || ""; statusMsg.classList.remove("hidden"); }

  async function initActivation() {
    if (!config.BACKEND) { showStatus("⚠️ config.js me BACKEND URL set nahi hai. Backend deploy karke wahan daalo (README)."); return; }
    // tiers + free-preview list (public endpoints)
    try {
      const res = await fetch(`${config.BACKEND}/api/tiers`);
      const d = await res.json();
      if (d.ok) {
        TIERS_CACHE = d.tiers || [];
        (d.preview || []).forEach((m) => previewMids.add(String(m)));
      }
    } catch (e) { /* backend off — gate fallback */ }
    populateTiers();
    isActivatedFlag = await window.LS.isActivated();
    if (!isActivatedFlag) $("#activateLinkBtn").classList.remove("hidden");
    loadData(); // grid hamesha dikhega — locked cards offer overlay kholenge
  }
  function showGate() {
    statusMsg.classList.add("hidden");
    const ov = $("#gateOverlay");
    ov.classList.remove("hidden");
    $("#gateMsg").textContent = "";
  }

  // ---------- Premium offer (locked lectures) ----------
  function populateTiers() {
    const sel = $("#tierSelect");
    if (!sel) return;
    sel.innerHTML = "";
    if (!TIERS_CACHE.length) {
      const o = document.createElement("option");
      o.textContent = "Tiers load nahi hue (backend off?)";
      sel.appendChild(o);
      return;
    }
    TIERS_CACHE.forEach((t) => {
      const o = document.createElement("option");
      o.value = t.days;
      o.textContent = `${t.label} — ₹${t.price}`;
      sel.appendChild(o);
    });
    updateTierPrice();
  }
  function updateTierPrice() {
    const days = parseInt($("#tierSelect").value || "0", 10);
    const t = TIERS_CACHE.find((x) => x.days === days);
    $("#tierPrice").textContent = t ? `💰 Price: ₹${t.price}` : "";
  }
  function openOffer() {
    $("#offerResult").classList.add("hidden");
    $("#offerMsg").textContent = "";
    $("#offerOverlay").classList.remove("hidden");
  }
  $("#offerClose").addEventListener("click", () => $("#offerOverlay").classList.add("hidden"));
  $("#haveKeyLink").addEventListener("click", () => {
    $("#offerOverlay").classList.add("hidden");
    showGate();
  });
  $("#activateLinkBtn").addEventListener("click", showGate);
  $("#tierSelect").addEventListener("change", updateTierPrice);

  $("#offerBtn").addEventListener("click", async () => {
    const email = $("#offerEmail").value.trim();
    const msg = $("#offerMsg");
    if (!email || !email.includes("@")) {
      msg.style.color = "#f87171"; msg.textContent = "Sahi email daalo."; return;
    }
    const days = parseInt($("#tierSelect").value || "0", 10);
    try {
      const res = await fetch(`${config.BACKEND}/voucher/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, days }),
      });
      const d = await res.json();
      if (d.ok) {
        $("#offerRef").textContent = d.ref;
        $("#offerResult").classList.remove("hidden");
        msg.style.color = "var(--accent-2)";
        msg.textContent = `✅ Request ban gayi! Price: ₹${d.price} (${d.label})`;
        $("#offerBtn").disabled = true;
      } else {
        msg.style.color = "#f87171";
        msg.textContent = "❌ " + (d.error || "request fail");
      }
    } catch (e) {
      msg.style.color = "#f87171";
      msg.textContent = "Backend se connect nahi hua.";
    }
  });

  // locked card click → offer overlay (preview wale free chalte hain)
  function gateCardClick(e) {
    if (isActivatedFlag) return;
    const a = e.target.closest("a.video-card");
    if (!a) return;
    const n = Number(new URL(a.href, location.href).searchParams.get("n"));
    const v = allVideos.find((x) => x.n === n);
    if (v && previewMids.has(String(v.msg))) return; // free preview — chalne do
    e.preventDefault();
    openOffer();
  }
  grid.addEventListener("click", gateCardClick);
  const continueCardEl = $("#continueCard");
  if (continueCardEl) continueCardEl.addEventListener("click", gateCardClick);
  function activateSubmit() {
    const key = $("#keyInput").value.trim();
    const msg = $("#gateMsg");
    if (!key) { msg.textContent = "Pehle key daalo."; return; }
    // LS key vs SUB voucher dono mode mein kaam karega
    const mode = $("input[name='keyMode']:checked") ? $("input[name='keyMode']:checked").value : "ls";
    const action = mode === "sub" ? window.LS.redeemCode : window.LS.activate;
    $("#activateBtn").disabled = true;
    action(key).then((r) => {
      $("#activateBtn").disabled = false;
      if (r.ok) {
        isActivatedFlag = true;
        $("#activateLinkBtn").classList.add("hidden");
        msg.style.color = "var(--accent-2)";
        const daysTxt = r.days ? `${r.days} din` : "Lifetime";
        const expTxt = r.key_expires ? ` • Expiry: ${new Date(r.key_expires * 1000).toLocaleDateString()}` : "";
        msg.textContent = `✅ Activated! Validity: ${daysTxt}${expTxt}`;
        setTimeout(() => {
          $("#gateOverlay").classList.add("hidden");
          loadData();
        }, 700);
      } else {
        msg.style.color = "#f87171";
        msg.textContent = "❌ " + (r.message || "Activation failed.");
      }
    });
  }
  $("#activateBtn").addEventListener("click", activateSubmit);
  $("#keyInput").addEventListener("keydown", (e) => { if (e.key === "Enter") activateSubmit(); });

    // ---------- Announcement banner ----------
  if (config.ANNOUNCE) {
    const a = $("#announce");
    a.textContent = config.ANNOUNCE;
    a.classList.remove("hidden");
  }

  // admin key-gen
  const adminToggle = $("#adminToggle");
  adminToggle.addEventListener("click", () => {
    $("#adminBox").classList.toggle("hidden");
  });

  let adminPw = null; // unlock hone ke baad save

  // admin stats (key counting + views) — password sahi hone pe dikhate hain
  async function loadAdminStats(pw) {
    const res = await fetch(`${config.BACKEND}/admin/stats`, { headers: { "x-admin-pass": pw } });
    const d = await res.json();
    if (!res.ok || !d.ok) return false;
    $("#statTotal").textContent = d.total;
    $("#statUsed").textContent = d.used;
    $("#statAvail").textContent = d.available;
    $("#statExpired").textContent = d.expired || 0;
    const vw = $("#adminViews");
    vw.textContent = `👀 Total views: ${d.views || 0}`;
    vw.classList.remove("hidden");
    return true;
  }

  // saari keys ki list dikhata hai (unlock ke baad)
  async function loadKeyList(pw) {
    try {
      const res = await fetch(`${config.BACKEND}/admin/list`, { headers: { "x-admin-pass": pw } });
      const d = await res.json();
      if (!res.ok || !d.ok) return;
      const body = $("#keylistBody");
      body.innerHTML = "";
      const statusColor = (s) => s === "available" ? "var(--accent-2)" : s === "used" ? "var(--accent)" : "#f87171";
      const fmtDate = (ts) => { if (!ts) return "—"; const dt = new Date(ts * 1000); return dt.toLocaleDateString(); };
            d.keys.forEach((k) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="mono">${k.code}</td>
          <td>${esc(k.note || "")}</td>
          <td>${esc(k.email || "—")}</td>
          <td><span style="color:${statusColor(k.status)};font-weight:700">${k.status}</span></td>
          <td>${k.days ? k.days + "d" : "∞"}</td>
          <td>${fmtDate(k.expires)}</td>
          <td>${k.status === "revoked" ? "" : `<button class="gate-btn secondary revoke-btn" data-code="${k.code}">❌</button>`}</td>`;
        body.appendChild(tr);
      });
      $("#adminKeyList").classList.remove("hidden");
    } catch (e) { /* backend off */ }
  }

  // ---------- Redeem requests (offline cash) ----------
  async function loadRequests() {
    if (!adminPw) return;
    try {
      const res = await fetch(`${config.BACKEND}/admin/requests`, { headers: { "x-admin-pass": adminPw } });
      const d = await res.json();
      if (!res.ok || !d.ok) return;
      const body = $("#reqBody");
      body.innerHTML = "";
      const stColor = (s) => s === "paid" ? "var(--accent-2)" : s === "pending" ? "#fbbf24" : "#f87171";
      const fmtDate = (ts) => { if (!ts) return "—"; return new Date(ts * 1000).toLocaleString(); };
      d.requests.forEach((r) => {
        const tr = document.createElement("tr");
        const daysLbl = r.days ? r.days + " din" : "Lifetime";
        tr.innerHTML = `
          <td class="mono">${esc(r.ref)}</td>
          <td>${esc(r.email || "—")}</td>
          <td>${daysLbl}</td>
          <td>₹${r.price || 0}</td>
          <td><span style="color:${stColor(r.status)};font-weight:700">${r.status}</span></td>
          <td>${r.status === "pending"
            ? `<button class="gate-btn gen markpaid-btn" data-ref="${r.ref}">✅ Mark Paid</button>`
            : r.key ? `<span class="mono">${r.key}</span>` : "<em>—</em>"}</td>`;
        body.appendChild(tr);
      });
      $("#adminReqList").classList.remove("hidden");
    } catch (e) { /* backend off */ }
  }

  // event delegation: revoke (keys) + mark-paid (requests)
  $("#keylistBody").addEventListener("click", async (e) => {
    const b = e.target.closest(".revoke-btn");
    if (!b || !b.dataset.code) return;
    if (!confirm(`Key ${b.dataset.code} ko revoke karo? Use turant bandh.`)) return;
    try {
      const res = await fetch(`${config.BACKEND}/admin/keys/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-pass": adminPw },
        body: JSON.stringify({ code: b.dataset.code }),
      });
      const d = await res.json();
      if (d.ok) loadKeyList(adminPw);
      else alert("Revoke fail: " + (d.error || "unknown"));
    } catch (err) { alert("Backend off?"); }
  });

  $("#reqBody").addEventListener("click", async (e) => {
    const b = e.target.closest(".markpaid-btn");
    if (!b || !b.dataset.ref) return;
    if (!confirm(`Cash mil gaya REF ${b.dataset.ref} ka? Key generate + email bhejenge.`)) return;
    try {
      const res = await fetch(`${config.BACKEND}/admin/requests/markpaid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-pass": adminPw },
        body: JSON.stringify({ ref: b.dataset.ref }),
      });
      const d = await res.json();
      if (d.ok) {
        alert(`Key generate: ${d.key} → ${d.email} ko email bheja (agar SMTP set hai).`);
        loadRequests();
        loadKeyList(adminPw);
      } else alert("Mark paid fail: " + (d.error || "unknown"));
    } catch (err) { alert("Backend off connect."); }
  });

  $("#adminUnlockBtn").addEventListener("click", async () => {
    const pw = $("#adminPassInput").value.trim();
    const am = $("#adminMsg");
    if (!pw) { am.style.color = "#f87171"; am.textContent = "Pehle password daalo."; return; }
    try {
      const ok = await loadAdminStats(pw);
      if (ok) {
        adminPw = pw;
        $("#adminStats").classList.remove("hidden");
        $("#adminGen").classList.remove("hidden");
        am.style.color = "var(--accent-2)";
        am.textContent = "✅ Unlock ho gaya! Ab key bana sakte ho.";
        loadKeyList(pw);
        loadRequests();
      } else {
        am.style.color = "#f87171";
        am.textContent = "Galat password ya backend off hai.";
      }
    } catch (e) {
      am.style.color = "#f87171";
      am.textContent = "Backend se connect nahi hua.";
    }
  });
  $("#adminPassInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#adminUnlockBtn").click(); });

  $("#genKeyBtn").addEventListener("click", async () => {
    const gm = $("#genMsg");
    if (!adminPw) { gm.textContent = "Pehle admin password se unlock karo."; return; }
    const note = $("#noteInput").value.trim();
    const days = parseInt($("#daysSelect").value || "0", 10);
    try {
      const res = await fetch(`${config.BACKEND}/admin/newkey`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-pass": adminPw },
        body: JSON.stringify({ note, days }),
      });
      const d = await res.json();
      if (d.ok) {
        gm.style.color = "var(--accent-2)";
        gm.textContent = `Naya key: ${d.code}${d.days ? " (" + d.days + " din)" : " (Lifetime)"}`;
        loadAdminStats(adminPw); // counting update
        loadKeyList(adminPw);
      }
      else gm.textContent = "Failed: " + (d.error || "unknown");
    } catch (e) { gm.textContent = "Backend connect nahi hua."; }
  });

  $("#exportBtn").addEventListener("click", () => {
    if (!adminPw) { $("#genMsg").textContent = "Pehle unlock karo."; return; }
    // CSV file seedha download (admin endpoint se)
    fetch(`${config.BACKEND}/admin/export`, { headers: { "x-admin-pass": adminPw } })
      .then((r) => {
        if (!r.ok) throw new Error("bad");
        return r.text();
      })
      .then((csv) => {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "keys.csv";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => { $("#genMsg").textContent = "Export fail — backend off?"; });
  });

  initTheme();
  initActivation();
})();
