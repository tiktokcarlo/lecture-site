/* =====================================================================
   config.js — ek hi jagah sab settings
   ===================================================================== */
window.APP_CONFIG = {
  /* Backend ka base URL — trailing slash ke BINA.
     Render pe deploy karne ke baad jo URL mile, wahi yahan daalo. */
  BACKEND: "https://lecture-backend-a6cb.onrender.com",

  /* Lectures ki list (isko mat chhedna) */
  DATA_URL: "data/videos.json",

  /* Site ka naam / branding */
  BRAND: "BERSERK",
  BRAND_SUB: "STREAM",

  /* Upar chhota announcement banner (khali = band) */
  ANNOUNCE: "",

  /* Ek page pe kitne cards (infinite scroll ka chunk size) */
  PAGE_SIZE: 36,

  /* Backend slow ho (Render free tier cold start) to itne ms tak wait karo */
  FETCH_TIMEOUT: 9000,

  /* ⚠️ Sirf testing ke liye — true karoge to saare lectures bina key ke khulenge.
     Live site pe ise FALSE hi rakho. */
  DEV_UNLOCK: false,
};
