/* =====================================================================
   auth.js — device fingerprint + activation / voucher
   FIXES vs purana version:
     • crypto global check (purane me `crypto` undefined hone pe crash hota tha)
     • fetch ke liye timeout + non-JSON response safety
     • token expiry ke 60s pehle hi "expired" maana jata hai (race-free)
     • sab functions ek consistent shape return karte hain
   ===================================================================== */
window.LS = (() => {
  "use strict";

  const config = window.APP_CONFIG || {};
  const DEV_KEY = "lstream_device_id";
  const ACT_KEY = "lstream_activation_v1";
  const FALLBACK_KEY = "lstream_fp_fallback";

  /* ------------------------------ device id ------------------------------ */
  function getDeviceId() {
    try {
      let id = localStorage.getItem(DEV_KEY);
      if (!id) {
        const rnd = () => {
          if (window.crypto && window.crypto.getRandomValues) {
            const a = new Uint32Array(2);
            window.crypto.getRandomValues(a);
            return a[0].toString(36) + a[1].toString(36);
          }
          return Math.random().toString(36).slice(2, 10);
        };
        id = `d_${rnd()}${rnd()}`;
        localStorage.setItem(DEV_KEY, id);
      }
      return id;
    } catch {
      return "d_nostorage";
    }
  }

  /* ------------------------------ fingerprint ------------------------------ */
  const fpCtx = {
    ua: navigator.userAgent || "",
    lang: navigator.language || "",
    langs: (navigator.languages || []).join(","),
    tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })(),
    plat: navigator.platform || "",
    hw: navigator.hardwareConcurrency || 0,
    mem: navigator.deviceMemory || 0,
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
  };

  async function sha256hex(str) {
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
      try {
        const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
        return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
      } catch { /* insecure context — fallback neeche */ }
    }
    // fallback hash (djb2 + length mix) — sirf casual level ka fingerprint
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return "fb" + (h >>> 0).toString(16).padStart(8, "0") + str.length.toString(16);
  }

  let _fpCache = null, _fpPromise = null;
  async function getFingerprint() {
    if (_fpCache) return _fpCache;
    if (_fpPromise) return _fpPromise;
    let extra = "";
    try { extra = localStorage.getItem(FALLBACK_KEY) || ""; } catch {}
    _fpPromise = sha256hex(JSON.stringify(fpCtx) + extra).then((v) => {
      _fpCache = v;
      return v;
    });
    return _fpPromise;
  }

  /* ------------------------------ storage ------------------------------ */
  function getStored() {
    try {
      const v = JSON.parse(localStorage.getItem(ACT_KEY) || "{}");
      return v && typeof v === "object" ? v : {};
    } catch { return {}; }
  }

  function storeToken(data) {
    try {
      localStorage.setItem(ACT_KEY, JSON.stringify({
        token: data.token,
        exp: data.exp,
        device: getDeviceId(),
        code: data.code || null,
        fp: data.fp || null,
        key_expires: data.key_expires || null,
        days: data.days || 0,
        saved_at: Math.floor(Date.now() / 1000),
      }));
    } catch {}
  }

  function clearActivation() {
    try { localStorage.removeItem(ACT_KEY); } catch {}
  }

  /* ------------------------------ network ------------------------------ */
  async function request(path, opts = {}) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), config.FETCH_TIMEOUT || 9000);
    try {
      const res = await fetch(`${config.BACKEND}${path}`, { ...opts, signal: controller.signal });
      let data = null;
      const txt = await res.text();
      try { data = txt ? JSON.parse(txt) : {}; }
      catch { data = { ok: false, message: "Server ne galat response diya (JSON nahi)." }; }
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      const aborted = e && e.name === "AbortError";
      return {
        ok: false,
        status: 0,
        data: { ok: false, message: aborted
          ? "Backend slow hai (cold start). 30-60 sec baad try karo."
          : "Backend se connect nahi hua — internet ya server check karo." },
      };
    } finally {
      clearTimeout(to);
    }
  }

  /* ------------------------------ token ------------------------------ */
  const SKEW = 60; // seconds — expiry se pehle hi expire maan lo

  async function getToken() {
    const st = getStored();
    const now = Date.now() / 1000;
    if (!st.token || !st.exp) return null;
    if (Number(st.exp) <= now + SKEW) return null;
    if (st.device && st.device !== getDeviceId()) return null;
    return { token: st.token, exp: Number(st.exp) };
  }

  async function isActivated() {
    return !!(await getToken());
  }

  /* key_expires (subscription plan ki expiry) — display ke liye */
  function planInfo() {
    const st = getStored();
    if (!st.token) return null;
    const now = Date.now() / 1000;
    const hasPlan = !!st.key_expires;
    const daysLeft = hasPlan ? Math.ceil((Number(st.key_expires) - now) / 86400) : null;
    return {
      days: st.days || 0,
      key_expires: st.key_expires || null,
      daysLeft,
      lifetime: hasPlan && Number(st.key_expires) === 0,
      expired: hasPlan ? Number(st.key_expires) <= now : false,
    };
  }

  /* ------------------------------ activate ------------------------------ */
  async function activate(code) {
    const c = String(code || "").trim();
    if (!c) return { ok: false, message: "Pehle key daalo." };
    const d = getDeviceId();
    const f = await getFingerprint();
    const r = await request(
      `/activate/register?code=${encodeURIComponent(c)}&d=${encodeURIComponent(d)}&f=${encodeURIComponent(f)}`
    );
    const data = r.data || {};
    if (!r.ok || !data.ok) {
      const map = {
        used: "Ye key pehle hi use ho chuki hai.",
        expired: "Ye key expire ho gayi hai.",
        revoked: "Ye key revoke kar di gayi hai.",
        device: "Ye key kisi doosre device pe bind hai.",
        invalid: "Key galat hai.",
      };
      return { ok: false, message: data.message || map[data.error] || "Activation fail ho gaya." };
    }
    storeToken({ token: data.token, exp: data.exp, code: c, fp: f, key_expires: data.key_expires, days: data.days });
    return { ok: true, token: data.token, exp: data.exp, key_expires: data.key_expires, days: data.days };
  }

  /* ------------------------------ voucher ------------------------------ */
  async function redeemCode(code) {
    const c = String(code || "").trim().toUpperCase();
    if (!c) return { ok: false, message: "Pehle voucher code daalo." };
    const d = getDeviceId();
    const f = await getFingerprint();
    const r = await request("/voucher/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: c, d, f }),
    });
    const data = r.data || {};
    if (!r.ok || !data.ok) {
      return { ok: false, message: data.message || "Voucher galat hai, ya use ho chuka hai." };
    }
    storeToken({ token: data.token, exp: data.exp, code: c, fp: f, key_expires: data.key_expires, days: data.days });
    return { ok: true, token: data.token, exp: data.exp, key_expires: data.key_expires, days: data.days };
  }

  /* ------------------------------ stream url ------------------------------ */
  function streamURL(msg, { preview = false } = {}) {
    if (!config.BACKEND) return null;
    if (preview) return `${config.BACKEND}/stream/${msg}`;
    const st = getStored();
    const now = Date.now() / 1000;
    if (!st.token || !st.exp || !st.fp) return null;
    if (Number(st.exp) <= now + SKEW) return null;
    const d = getDeviceId();
    return `${config.BACKEND}/stream/${msg}?t=${encodeURIComponent(st.token)}&d=${encodeURIComponent(d)}&f=${encodeURIComponent(st.fp)}&e=${encodeURIComponent(st.exp)}`;
  }

  /* token expire ho raha ho to saved code se dobara activate */
  async function refreshToken() {
    const st = getStored();
    if (!st.code) return { ok: false };
    return activate(st.code);
  }

  /* ------------------------------ tiers + previews (cached) ------------------------------ */
  let _metaCache = null;

  async function getMeta({ force = false } = {}) {
    if (_metaCache && !force) return _metaCache;
    const r = await request("/api/tiers");
    if (r.ok && r.data && r.data.ok) {
      _metaCache = {
        tiers: Array.isArray(r.data.tiers) ? r.data.tiers : [],
        preview: (r.data.preview || []).map(String),
        live: true,
      };
      try {
        localStorage.setItem("bs_meta_cache_v1", JSON.stringify({ ..._metaCache, ts: Date.now() }));
      } catch {}
      return _metaCache;
    }
    // fallback: pichhli baar ka cache (backend sleep me ho to bhi previews chalein)
    try {
      const cached = JSON.parse(localStorage.getItem("bs_meta_cache_v1") || "null");
      if (cached && Array.isArray(cached.tiers)) {
        _metaCache = { tiers: cached.tiers, preview: cached.preview || [], live: false, stale: true };
        return _metaCache;
      }
    } catch {}
    _metaCache = { tiers: [], preview: [], live: false };
    return _metaCache;
  }

  return {
    getDeviceId, getFingerprint, getToken, isActivated, planInfo,
    activate, redeemCode, streamURL, refreshToken, clearActivation,
    getMeta, request, getStored,
  };
})();
