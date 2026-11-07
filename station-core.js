/* =====================================================================
   YAMADA STATION — inti (dimuat SEBELUM app.js, tidak bergantung padanya).
   Isi: deteksi perangkat, haptic, clipboard, tema, favorit, riwayat.
   Semua data disimpan lokal (localStorage). Tidak ada URL/hasil unduhan
   yang disimpan di riwayat: hanya id tool + waktu.
   ===================================================================== */
(() => {
"use strict";

const root = document.documentElement;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* penuh/diblokir */ } };
const mm = q => { try { return window.matchMedia(q).matches; } catch { return false; } };

// ---------------------------------------------------------------------
// Emitter kecil
// ---------------------------------------------------------------------
const handlers = {};
function on(evt, cb) { (handlers[evt] = handlers[evt] || []).push(cb); }
function emit(evt, data) { (handlers[evt] || []).forEach(cb => { try { cb(data); } catch (e) { console.error(e); } }); }

// ---------------------------------------------------------------------
// DEVICE DETECTION
// Urutan: userAgentData (Chromium) -> UA -> petunjuk perangkat keras
// (maxTouchPoints + ukuran layar fisik). iPadOS 13+ dan iPhone "Request
// Desktop Website" berpura-pura jadi Mac; keduanya dibedakan lewat sentuhan
// multi-touch dan sisi terpendek layar (iPhone < 600 CSS px, iPad >= 600).
// ---------------------------------------------------------------------
function detectDevice() {
  const ua = navigator.userAgent || "";
  const uad = navigator.userAgentData || null;
  const touchPoints = navigator.maxTouchPoints || 0;
  const minSide = Math.min(screen.width || 0, screen.height || 0) || Math.min(innerWidth, innerHeight);

  const uaIPhone = /iPhone|iPod/.test(ua);
  const uaIPad = /iPad/.test(ua);
  const macTouch = /Macintosh/.test(ua) && touchPoints > 1 && !(uad && uad.platform && uad.platform !== "macOS" && uad.platform !== "");

  let os = "other", form = "desktop";
  if (uaIPhone || uaIPad || macTouch) {
    os = "ios";
    if (uaIPad) form = "tablet";
    else if (uaIPhone) form = "phone";
    else form = minSide < 600 ? "phone" : "tablet"; // Mac palsu: iPhone desktop-mode vs iPadOS
  } else if ((uad && uad.platform === "Android") || /Android/i.test(ua)) {
    os = "android";
    const mobileFlag = uad && typeof uad.mobile === "boolean" ? uad.mobile : /Mobile/i.test(ua);
    form = !mobileFlag || minSide >= 600 ? "tablet" : "phone";
  } else {
    const p = (uad && uad.platform) || "";
    if (/Windows/i.test(p) || /Windows/.test(ua)) os = "windows";
    else if (/mac/i.test(p) || /Macintosh/.test(ua)) os = "macos";
    else if (/Linux|Chrome OS|CrOS/i.test(p + ua)) os = "linux";
    form = "desktop";
  }
  const standalone = mm("(display-mode: standalone)") || mm("(display-mode: fullscreen)") || mm("(display-mode: minimal-ui)") || navigator.standalone === true;
  return {
    os, form, standalone,
    isIOS: os === "ios", isAndroid: os === "android",
    isIPhone: os === "ios" && form === "phone",
    isIPad: os === "ios" && form === "tablet",
    isTablet: form === "tablet", isPhone: form === "phone", isDesktop: form === "desktop",
    touch: touchPoints > 0 || mm("(pointer: coarse)"),
    label: os === "ios" ? (form === "phone" ? "iPhone" : "iPad") : os === "android" ? (form === "phone" ? "Android" : "Android Tablet") : form === "desktop" ? "Desktop" : "Tablet"
  };
}
const device = detectDevice();
root.dataset.os = device.os;
root.dataset.device = device.form;
root.classList.toggle("is-iphone", device.isIPhone);
root.classList.toggle("is-ipad", device.isIPad);
root.classList.toggle("is-ios", device.isIOS);
root.classList.toggle("is-android", device.isAndroid);
root.classList.toggle("is-touch", device.touch);
function refreshStandalone() {
  device.standalone = mm("(display-mode: standalone)") || mm("(display-mode: fullscreen)") || mm("(display-mode: minimal-ui)") || navigator.standalone === true;
  root.classList.toggle("is-standalone", device.standalone);
}
refreshStandalone();
try { matchMedia("(display-mode: standalone)").addEventListener("change", () => { refreshStandalone(); emit("standalone", device.standalone); }); } catch { /* browser lama */ }

// ---------------------------------------------------------------------
// HAPTIC — hanya iPhone (sesuai spesifikasi) dan hanya bila didukung.
// Safari iOS tidak punya navigator.vibrate. Sejak iOS 17.4 mengetuk
// <input type=checkbox switch> memberi getaran halus; kita memicunya lewat
// label.click() di dalam gestur sentuhan. Di iOS lebih lama tidak terjadi
// apa-apa (aman, tanpa error).
// ---------------------------------------------------------------------
let hapticOn = true, tickLabel = null;
function tick() {
  if (!tickLabel) {
    const l = document.createElement("label");
    l.setAttribute("aria-hidden", "true"); l.setAttribute("data-haptic", "");
    l.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden";
    const i = document.createElement("input");
    i.type = "checkbox"; i.setAttribute("switch", ""); i.tabIndex = -1;
    l.appendChild(i); document.body.appendChild(l);
    tickLabel = l;
  }
  tickLabel.click();
}
const PATTERNS = { light: [0], select: [0], medium: [0], success: [0, 85], warning: [0, 110], error: [0, 70, 140] };
let lastTick = 0;
function haptic(kind = "light") {
  if (!hapticOn || !device.isIPhone) return false;
  const now = performance.now();
  if (kind === "light" && now - lastTick < 60) return false; // jangan membanjiri
  lastTick = now;
  const pat = PATTERNS[kind] || PATTERNS.light;
  pat.forEach(d => (d ? setTimeout(tick, d) : tick()));
  return true;
}
const hapticSupported = () => device.isIPhone;

// ---------------------------------------------------------------------
// CLIPBOARD (Clipboard API + fallback execCommand)
// ---------------------------------------------------------------------
async function copy(text) {
  text = String(text == null ? "" : text);
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* lanjut fallback */ }
  const ta = document.createElement("textarea");
  ta.value = text; ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;font-size:16px";
  document.body.appendChild(ta);
  let ok = false;
  try {
    ta.focus({ preventScroll: true });
    ta.select(); ta.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
  } catch { ok = false; }
  ta.remove();
  return ok;
}

// ---------------------------------------------------------------------
// TEMA: auto | light | dark
// ---------------------------------------------------------------------
let themePref = "auto";
const darkMQ = (() => { try { return matchMedia("(prefers-color-scheme: dark)"); } catch { return null; } })();
function resolveTheme(pref) { return pref === "dark" || (pref === "auto" && darkMQ && darkMQ.matches) ? "dark" : "light"; }
function applyTheme(pref) {
  themePref = ["auto", "light", "dark"].includes(pref) ? pref : "auto";
  const r = resolveTheme(themePref);
  root.dataset.theme = r;
  root.dataset.themePref = themePref;
  root.style.colorScheme = r;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", r === "dark" ? "#0b1533" : "#ffffff");
  emit("theme", { pref: themePref, resolved: r });
}
if (darkMQ) {
  const onChange = () => { if (themePref === "auto") applyTheme("auto"); };
  if (darkMQ.addEventListener) darkMQ.addEventListener("change", onChange); else if (darkMQ.addListener) darkMQ.addListener(onChange);
}

// ---------------------------------------------------------------------
// FAVORITES
// ---------------------------------------------------------------------
const TOOLS = ["youtube", "tiktok", "instagram", "pinterest"];
const FAV_KEY = "ys_favs_v1", REC_KEY = "ys_recent_v1";
function readJSON(k, fallback) { try { const v = JSON.parse(lsGet(k) || "null"); return v == null ? fallback : v; } catch { return fallback; } }
let favs = readJSON(FAV_KEY, []).filter(id => TOOLS.includes(id));
favs = [...new Set(favs)];
const favApi = {
  list: () => favs.slice(),
  has: id => favs.includes(id),
  toggle(id) {
    if (!TOOLS.includes(id)) return false;
    const was = favs.includes(id);
    favs = was ? favs.filter(x => x !== id) : [...favs, id];
    lsSet(FAV_KEY, JSON.stringify(favs));
    emit("favs", { id, on: !was });
    return !was;
  }
};

// ---------------------------------------------------------------------
// RECENTLY USED (riwayat: {id, ts, ok}); maksimum 30 entri
// ---------------------------------------------------------------------
let rec = readJSON(REC_KEY, []);
rec = Array.isArray(rec) ? rec.filter(e => e && TOOLS.includes(e.id) && Number.isFinite(e.ts)).slice(-30) : [];
function saveRec() { lsSet(REC_KEY, JSON.stringify(rec)); emit("recents"); }
const recApi = {
  add(id) { if (!TOOLS.includes(id)) return; rec.push({ id, ts: Date.now(), ok: false }); rec = rec.slice(-30); saveRec(); },
  markOk(id) { for (let i = rec.length - 1; i >= 0; i--) if (rec[i].id === id) { rec[i].ok = true; break; } saveRec(); },
  // 5 tools terakhir (unik), terbaru dulu
  top(n = 5) {
    const seen = new Map();
    for (let i = rec.length - 1; i >= 0; i--) {
      const e = rec[i];
      if (!seen.has(e.id)) seen.set(e.id, { id: e.id, ts: e.ts, count: 0, ok: 0 });
      const s = seen.get(e.id); s.count++; if (e.ok) s.ok++;
    }
    return [...seen.values()].slice(0, n);
  },
  all: () => rec.slice().reverse(),
  clear() { rec = []; saveRec(); }
};
window.addEventListener("storage", e => {
  if (e.key === FAV_KEY) { favs = readJSON(FAV_KEY, []).filter(id => TOOLS.includes(id)); emit("favs", {}); }
  if (e.key === REC_KEY) { rec = readJSON(REC_KEY, []); emit("recents"); }
});


// ---------------------------------------------------------------------
// PERFORMA: mode hemat (html.lite). Pilihan pengguna: auto | lite | full.
// AUTO = heuristik perangkat (RAM/CPU/hemat data) + uji FPS singkat setelah
// halaman tampil. Hasil uji disimpan 7 hari agar tidak diuji ulang terus.
// ---------------------------------------------------------------------
const PERF_KEY = "ys_perf_v1";
let perfPref = "auto", perfAuto = false;
(function initPerfAuto() {
  const c = readJSON(PERF_KEY, null);
  if (c && typeof c.lite === "boolean" && Date.now() - c.ts < 7 * 864e5) { perfAuto = c.lite; return; }
  const conn = navigator.connection || {};
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
  perfAuto = !!(conn.saveData || mem <= 2 || (device.isAndroid && cores <= 4 && mem <= 3));
})();
function applyLite(pref) {
  if (pref) perfPref = ["auto", "lite", "full"].includes(pref) ? pref : "auto";
  const lite = perfPref === "lite" || (perfPref === "auto" && perfAuto);
  root.classList.toggle("lite", lite);
  return lite;
}
// uji FPS: median & proporsi frame lambat selama ~40 frame
function probeFps(frames = 45) {
  return new Promise(resolve => {
    const d = []; let last = 0, n = 0;
    const step = t => {
      if (document.hidden) return resolve(null);
      if (last) d.push(t - last);
      last = t;
      if (++n < frames + 8) requestAnimationFrame(step);
      else {
        const s = d.slice(8).sort((a, b) => a - b);
        const slow = s.filter(x => x > 26).length / s.length;
        resolve({ median: s[s.length >> 1], slow });
      }
    };
    requestAnimationFrame(step);
  });
}
async function autoTune() {
  if (perfPref !== "auto") return null;
  const c = readJSON(PERF_KEY, null);
  if (c && Date.now() - c.ts < 7 * 864e5) return null;
  const r = await probeFps();
  if (!r) return null;
  const lite = r.median > 22 || r.slow > 0.35;
  lsSet(PERF_KEY, JSON.stringify({ lite, ts: Date.now() }));
  if (lite !== perfAuto) { perfAuto = lite; const on = applyLite(); emit("perf", { lite: on, auto: true }); }
  return r;
}

window.YS = {
  device, on, emit, TOOLS,
  haptic, hapticSupported, setHaptic: v => { hapticOn = !!v; },
  copy, applyTheme, resolveTheme, getTheme: () => themePref, refreshStandalone,
  favs: favApi, recents: recApi,
  applyLite, autoTune, probeFps, isLite: () => root.classList.contains("lite")
};
})();
