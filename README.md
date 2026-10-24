# ⚔️ BERSERK STREAM

Lecture site ka **refined rebuild** — Guts / Berserk-inspired dark theme, full glassmorphism UI,
Gen-Z friendly micro-interactions, aur saare purane bugs fix.

```
berserk-stream/
├── index.html          # home — hero, filters, cards, dialogs, command palette
├── player.html         # custom glass player
├── favicon.svg
├── css/
│   └── style.css       # poora design system (tokens + components + responsive)
├── js/
│   ├── config.js       # 👈 BACKEND url, brand, page size, DEV_UNLOCK
│   ├── auth.js         # device fingerprint + activation / voucher + tiers cache
│   ├── ui.js           # shared core: theme, toasts, dialogs, progress, batch names, embers
│   ├── app.js          # home page logic
│   └── player.js       # player logic
└── data/
    └── videos.json     # 1302 lectures (tumhara original data, jaisa tha waisa)
```

---

## 🚀 Chalane ka tarika

`file://` se mat kholo (fetch block ho jayega). Ek chhota local server chalao:

```bash
# Python
python3 -m http.server 8080
# phir browser me: http://localhost:8080
```

Ya `npx serve .` / VS Code ka Live Server.

Deploy karna ho to folder ko **Netlify / Vercel / GitHub Pages / Render static** pe daal do — bas kaam karega.

---

## 🎨 Theme — "Obsidian Glass"

- **Night (default)** — black-obsidian glass, blood red (`#c1121f`) + ember gold (`#e8a33d`).
- **Golden Age (light)** — parchment + gold, Berserk ke Golden Age arc jaisa.
- Toggle: topbar ka ☀️/🌙 button, ya keyboard **`T`**.
- Har surface glass hai: `backdrop-filter: blur(22px) saturate(140%)` + gradient edge border.
- Animated ember particles (canvas), film grain, brand-of-sacrifice sigil watermark, scroll progress bar.
- `prefers-reduced-motion` respect karta hai — particles band ho jate hain.

---

## ✨ Naya kya hai (purane version se)

### UX / UI
| Purana | Naya |
|---|---|
| Inter font, flat cards | Berserk display type, glass cards, poster-style art + hover play orb |
| Sirf dark/light | Night + Golden Age, smooth crossfade |
| Basic grid | Hero, stat chips, batch pills, sort dropdown, tabs (All / In progress / Saved) |
| window.confirm / alert | Custom glass confirm dialogs + toast notifications |
| — | **Command palette** (`Ctrl/⌘ + K`) — search + actions |
| — | **Bookmarks** (per lecture, `Saved` tab me) |
| — | **Continue rail** — 8 tak recent adhiktam, progress bar ke saath |
| — | Keyboard: `/` search, `T` theme, `R` random, `S` saved, `?` palette |
| Batch names gande (`...byऋषभ राजपूत`) | Cleaned: `GS Foundation 2025`, `CSAT Prelims 2024`… |
| Player ke native controls | Custom glass controls: seek-preview tooltip, buffer bar, speed popover, PiP, theatre, autoplay-next countdown |

### Player
- Resume ab **`loadedmetadata`** par set hota hai (pehle `setTimeout(1200)` ka jugaad tha — unreliable).
- Progress **throttled** save: har 5s + pause + tab hide + page close. 300 entries ka cap.
- Keyboard: `space/k` play-pause, `J/L` ±10s, `←/→` ±5s, `↑/↓` volume, `M` mute, `F` fullscreen, `T` theatre, `N` next, `B` bookmark, `0-9` jump.
- Speed 0.5x–2.5x, yaad rehti hai.
- **Autoplay next** — 8s countdown, cancel kar sakte ho, toggle side panel me.
- Volume yaad rehti hai, mute icon sync.
- Error par proper message + Retry + "Key daalo" button.

### Logic / bugs fixed
1. **`crypto` crash** — purane `auth.js` me `if (crypto && ...)` bare global tha, jisse insecure context me `ReferenceError` aata tha. Ab `window.crypto` + full fallback hash.
2. **Infinite scroll duplicates** — render chunk guard + reset par full clear.
3. **Silent failures** — har fetch ab timeout (9s) + non-JSON response safety ke saath, aur user ko readable Hinglish message.
4. **Backend sleep (Render free tier)** — ek baar tiers/preview cache hone ke baad backend off ho to bhi preview list localStorage se chalti hai; toast batata hai.
5. **Token expiry race** — 60s skew, plus `device` mismatch check.
6. **Admin panel** — `alert()`/`confirm()` hata ke glass UI, key copy button, CSV export, revoke, mark-paid — sab structured.
7. **Accessibility** — focus-visible rings, cards `role="link"` + Enter/Space, `aria-*`, `sr-only`, keyboard navigable palette, reduced-motion.
8. **Mobile** — 390px tak zero horizontal overflow, pills apni row me, touch-friendly 44px targets.

---

## ⚙️ config.js

```js
BACKEND: "https://lecture-backend-a6cb.onrender.com",  // tumhara backend
DATA_URL: "data/videos.json",
PAGE_SIZE: 36,
FETCH_TIMEOUT: 9000,
DEV_UNLOCK: false,   // ⚠️ true = saare lectures bina key ke (sirf testing)
```

**`DEV_UNLOCK: true`** karne se gate bypass ho jata hai — apna player test karne ke liye useful.
Live site pe **false** hi rakhna.

---

## 🔑 Access flow (jaisa tha, waise hi kaam karta hai)

1. Key na ho → card par **🔒 Premium** chip.
2. Card kholo → glass "Premium" dialog → pack chuno (1/3/6 mahine / lifetime) → email → **request**.
3. Reference code milta hai (`REF-...`) → admin ko cash + code dikhao.
4. Admin panel (Key icon → Admin panel → password) → **Mark paid** → key generate + email.
5. User wahi key `LS Key` mode me daale — ya offline voucher `SUB Voucher` mode me.
6. Activated → saare lectures khul jate hain, topbar se subscription days dikhte hain.

Same backend endpoints use ho rahe hain (`/api/tiers`, `/activate/register`, `/voucher/redeem`,
`/stream/:msg`, `/admin/*`) — backend me kuch change nahi karna.

---

## 📝 Notes

- `data/videos.json` bilkul tumhara original hai (1302 lectures, 10 batches).
- Batch name mapping `js/ui.js` ke `BATCH_MAP` me hai — naya batch aaye to fallback auto-clean
  kar deta hai; chaaho to wahan ek line add kar do for a perfect short name.
- Berserk © Kentaro Miura / Studio Gaga. Ye ek fan-made study tool hai.
