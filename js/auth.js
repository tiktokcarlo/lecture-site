// ============ auth.js — Device fingerprint + activation ============
// Isse app.js aur player.js dono use karte hain.
// Device binding (fingerprint) -> ek key ek hi device pe activate hogi (subscription).
window.LS = (() => {
  const config = window.APP_CONFIG;
  const DEV_KEY = "lstream_device_id";

  // ---- stable-ish device/fingerprint (localStorage se) ----
  function getDeviceId() {
    let id = localStorage.getItem(DEV_KEY);
    if (!id) {
      id = new Array(4).fill(0)
        .map(() => Math.random().toString(36).slice(2, 10))
        .join("");
      localStorage.setItem(DEV_KEY, id);
    }
    return id;
  }

  // halka fingerprint: browser data mix. casual sharing ko rokne ke liye kaafi.
  const fpCtx = {
    ua: navigator.userAgent,
    lang: navigator.language,
    tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })(),
    plat: navigator.platform || "",
    hw: navigator.hardwareConcurrency || 0,
  };
  function sha1hex(str) {
    if (crypto && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str))
        .then((b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""));
    }
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
    return Promise.resolve("h" + (h >>> 0).toString(16));
  }
  const fpCache = { val: null, p: null };
  async function getFingerprint() {
    if (fpCache.val) return fpCache.val;
    if (fpCache.p) return fpCache.p;
    const str = JSON.stringify(fpCtx);
    fpCache.p = sha1hex(str).then((v) => { fpCache.val = v; return v; });
    return fpCache.p;
  }

  // ---- activation ----
  const ACT_KEY = "lstream_activation_v1";   // { token, exp, device, code }
  function getStored() {
    try { const x = JSON.parse(localStorage.getItem(ACT_KEY) || "{}"); return x || {}; } catch { return {}; }
  }
  function storeToken(st) {
    localStorage.setItem(ACT_KEY, JSON.stringify({
      token: st.token, exp: st.exp, device: getDeviceId(), code: st.code || null,
      fp: st.fp || null, key_expires: st.key_expires || null, days: st.days || 0,
    }));
  }

  // returns null if not activated; else { token, exp }
  async function getToken() {
    const st = getStored();
    if (st.token && st.exp && Number(st.exp) > (Date.now() / 1000) + 60 && st.device === getDeviceId()) {
      return { token: st.token, exp: st.exp };
    }
    return null;
  }

  async function activate(code) {
    const d = getDeviceId();
    const f = await getFingerprint();
    const res = await fetch(`${config.BACKEND}/activate/register?code=${encodeURIComponent(code)}&d=${encodeURIComponent(d)}&f=${encodeURIComponent(f)}`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, message: data.message || (data.error === "used" ? "Key pehle use ho chuki hai." : "Key galat hai ya backend off hai.") };
    }
    storeToken({ token: data.token, exp: data.exp, code, fp: f, key_expires: data.key_expires, days: data.days });
    return { ok: true, token: data.token, exp: data.exp, key_expires: data.key_expires, days: data.days };
  }

    // redeem a SUB voucher code (offline-cash path) -> /voucher/redeem
  async function redeemCode(code) {
    const d = getDeviceId();
    const f = await getFingerprint();
    const res = await fetch(`${config.BACKEND}/voucher/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.toUpperCase(), d, f }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, message: data.message || "Voucher galat hai ya backend off hai." };
    }
    storeToken({ token: data.token, exp: data.exp, code, fp: f, key_expires: data.key_expires, days: data.days });
    return { ok: true, token: data.token, exp: data.exp, key_expires: data.key_expires, days: data.days };
  }

  // check karo: kya is device pe active activation hai
  async function isActivated() {
    const t = await getToken();
    return !!(t && getStored().token);
  }

  // stream url — token hota to bhi check karke return karo else null
  function streamURL(msg) {
    const st = getStored();
    if (!st.token || !st.exp || !st.fp) return null;
    if (Number(st.exp) <= (Date.now() / 1000) + 60) return null;
    const d = getDeviceId();
    return `${config.BACKEND}/stream/${msg}?t=${encodeURIComponent(st.token)}&d=${encodeURIComponent(d)}&f=${encodeURIComponent(st.fp)}&e=${encodeURIComponent(st.exp)}`;
  }

  // refreshToken: token expire ke paas hai to try re-activate with stored code (agar hoga)
  async function refreshToken() {
    const st = getStored();
    if (st.code) {
      const r = await activate(st.code);
      if (r.ok) return r;
    }
    return { ok: false };
  }

  function clearActivation() {
    localStorage.removeItem(ACT_KEY);
  }

    return {
    getDeviceId, getFingerprint, getToken, activate, redeemCode, isActivated,
    streamURL, refreshToken, clearActivation,
  };
})();
