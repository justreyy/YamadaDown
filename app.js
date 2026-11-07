/* =====================================================================
   YAMADA DOWN — logika aplikasi.
   Bagian downloader, panel admin, statistik, maintenance, dan Website
   Setting dibawa dari versi sebelumnya dengan endpoint & isi request yang
   sama; yang baru: tampilan game, maskot, tutorial, setting, dan akses
   admin rahasia (7x ketuk maskot).
   ===================================================================== */
(() => {
"use strict";

// ---------------------------------------------------------------------
// Service Worker (PWA)
// ---------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const VERSION = "7.0.0";

const CONFIG = {
  whatsappChannel: "https://whatsapp.com/channel/0029Vb87O3oF6smw9uLgOD0U",
  customerService: "https://wa.me/6283869485575",
  downloadEndpoint: "/api/download",
  pinterestEndpoint: "/api/download-pinterest",
  proxyEndpoint: "/api/fetch",
  trackEndpoint: "/api/track",
  adminAuthEndpoint: "/api/admin-auth",
  adminStatsEndpoint: "/api/admin-stats",
  adminTokenStorageKey: "yamada_admin_token",
  popularToolsEndpoint: "/api/popular-tools",
  settingsEndpoint: "/api/settings",
  adminSettingsEndpoint: "/api/admin-settings"
};

const DEFAULT_PLATFORM_SETTINGS = {
  tiktok: { enabled: true, name: "TikTok" },
  instagram: { enabled: true, name: "Instagram" },
  youtube: { enabled: true, name: "YouTube" },
  pinterest: { enabled: true, name: "Pinterest" }
};
let platformSettings = structuredCloneSafe(DEFAULT_PLATFORM_SETTINGS);
let maintenanceSettings = { enabled: false, message: "" };

// Harus sama dengan DEFAULT_SITE di api/_lib/settings.mjs
const DEFAULT_SITE_SETTINGS = {
  name: "YAMADA DOWN",
  description: "YAMADA DOWN - Your Personal Media Tools. Download video dari YouTube, TikTok, Instagram, dan Pinterest.",
  logoUrl: "LOGO.jpg",
  csLink: "https://wa.me/6283869485575"
};
let siteSettings = { ...DEFAULT_SITE_SETTINGS };

// Urutan default kartu (tetap 4 tools sesuai permintaan).
const TOOL_ORDER = ["youtube", "tiktok", "instagram", "pinterest"];
const TOOL_META = {
  youtube:   { icon: "Youtube.jpg",   label: "YouTube" },
  tiktok:    { icon: "Tiktok.jpg",    label: "TikTok" },
  instagram: { icon: "Instagram.jpg", label: "Instagram" },
  pinterest: { icon: "Pinterest.jpg", label: "Pinterest" }
};
let popularity = {}; // { youtube: 12, ... } dari /api/popular-tools

// ---------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}
const escapeAttr = escapeHtml;
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage penuh/diblokir */ } }
function icon(id) { return `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`; }

let toastTimer, bigTimer;
function showToast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.dispatchEvent(new CustomEvent("yd:toast", { detail: { message } }));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
function showBigNotice(message) {
  const el = $("#bigNotice");
  $("#bigNoticeText").textContent = message || t("tool.bigDone");
  el.classList.add("show");
  clearTimeout(bigTimer);
  bigTimer = setTimeout(() => el.classList.remove("show"), 3000);
}
$("#bigNotice").addEventListener("click", () => $("#bigNotice").classList.remove("show"));

// Fire-and-forget; tidak boleh mengganggu fitur utama.
function trackEvent(payload) {
  try {
    fetch(CONFIG.trackEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), keepalive: true
    }).catch(() => {});
  } catch { /* no-op */ }
}

// ---------------------------------------------------------------------
// Pengaturan pengguna (LocalStorage)
// ---------------------------------------------------------------------
const SETTINGS_KEY = "yd_settings_v1";
function osReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}
function defaultSettings() {
  return { lang: "id", sound: true, anim: true, reduced: osReducedMotion(), confirmLeave: false, textSize: 1, intensity: 1, showChar: true, glass: true, theme: "auto", haptic: true };
}
function loadSettings() {
  const base = defaultSettings();
  try {
    const raw = JSON.parse(lsGet(SETTINGS_KEY) || "null");
    if (!raw || typeof raw !== "object") return base;
    const pick = (k, ok) => (ok(raw[k]) ? raw[k] : base[k]);
    return {
      lang: pick("lang", v => v === "id" || v === "en"),
      sound: pick("sound", v => typeof v === "boolean"),
      anim: pick("anim", v => typeof v === "boolean"),
      reduced: pick("reduced", v => typeof v === "boolean"),
      confirmLeave: pick("confirmLeave", v => typeof v === "boolean"),
      textSize: pick("textSize", v => [0, 1, 2].includes(v)),
      intensity: pick("intensity", v => [0, 1, 2].includes(v)),
      showChar: pick("showChar", v => typeof v === "boolean"),
      glass: pick("glass", v => typeof v === "boolean"),
      theme: pick("theme", v => v === "auto" || v === "light" || v === "dark"),
      haptic: pick("haptic", v => typeof v === "boolean")
    };
  } catch { return base; }
}
let S = loadSettings();
function saveSettings() { lsSet(SETTINGS_KEY, JSON.stringify(S)); }
const fancy = () => S.anim && !S.reduced;

// ---------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------
function t(key, vars) {
  const dict = window.YD_I18N || {};
  let v = (dict[S.lang] && dict[S.lang][key]);
  if (v === undefined) v = dict.id && dict.id[key];
  if (v === undefined) return key;
  if (typeof v === "string" && vars) v = v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ""));
  return v;
}
function applyI18n(root = document) {
  $$("[data-i18n]", root).forEach(el => {
    const v = t(el.dataset.i18n);
    if (typeof v === "string") el.textContent = v;
  });
  $$("[data-i18n-ph]", root).forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
}

// ---------------------------------------------------------------------
// Suara (disintesis WebAudio, tanpa file)
// ---------------------------------------------------------------------
let actx = null;
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; } }
  if (actx && actx.state === "suspended") actx.resume().catch(() => {});
  return actx;
}
function tone(freq, dur, { type = "sine", vol = 0.05, delay = 0, to = 0 } = {}) {
  const ctx = audio(); if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function sfx(name, step = 0) {
  if (window.YS && (name === "success" || name === "error")) YS.haptic(name);
  if (!S.sound) return;
  try {
    switch (name) {
      case "click": tone(660, .07, { type: "triangle" }); break;
      case "tap": tone(520 + step * 90, .09, { type: "sine", vol: .06 }); break;
      case "start": [523, 659, 784, 1046].forEach((f, i) => tone(f, .13, { type: "triangle", delay: i * .07, vol: .05 })); break;
      case "back": tone(520, .08, { type: "triangle" }); tone(390, .1, { type: "triangle", delay: .07 }); break;
      case "success": [660, 880, 1175].forEach((f, i) => tone(f, .14, { type: "triangle", delay: i * .09 })); break;
      case "error": tone(220, .2, { type: "sawtooth", vol: .035, to: 150 }); break;
      case "secret": tone(220, .7, { type: "sawtooth", vol: .04, to: 1320 }); tone(880, .3, { type: "triangle", delay: .65 }); break;
      case "toggle": tone(760, .06, { type: "square", vol: .025 }); break;
    }
  } catch { /* audio opsional */ }
}
document.addEventListener("pointerdown", e => {
  if (e.target.closest(".btn,.icon-btn,.tab,.dock button,.tool-card,.guide-card,.seg button,.download-option,.switch")) sfx(e.target.closest(".switch") ? "toggle" : "click");
}, { passive: true });

// ---------------------------------------------------------------------
// Maskot Ryo Yamada
// ---------------------------------------------------------------------
function mascotInner() {
  return `
    <div class="m-shadow"></div>
    <div class="m-body"><div class="m-head"><div class="m-disc">
      <img class="m-layer m-img" src="assets/ryo.webp" alt="Ryo Yamada" width="480" height="480" decoding="async" draggable="false">
      <svg class="m-layer m-lids" viewBox="0 0 720 720" aria-hidden="true">
        <g class="blushx"><ellipse cx="190" cy="530" rx="46" ry="24"/><ellipse cx="572" cy="488" rx="46" ry="24"/></g>
        <g class="lid m-lid-l"><ellipse cx="205" cy="436" rx="94" ry="80"/><path class="lash" d="M118 470 Q205 520 292 470"/></g>
        <g class="lid m-lid-r"><ellipse cx="548" cy="402" rx="92" ry="74"/><path class="lash" d="M462 432 Q548 478 634 432"/></g>
      </svg>
      <span class="m-layer m-shine"></span>
    </div></div>
    <svg class="i fx-i fx-q"><use href="#i-help"/></svg>
    <span class="fx-i fx-sweat"></span>
    <svg class="i fx-i fx-spark fx-s1"><use href="#i-sparkles"/></svg>
    <svg class="i fx-i fx-spark fx-s2"><use href="#i-sparkles"/></svg>
    <svg class="i fx-i fx-spark fx-s3"><use href="#i-sparkles"/></svg>
    <span class="fx-talk"><i></i><i></i><i></i></span>
    </div>`;
}
function initMascots(root = document) {
  $$("[data-mascot]:not([data-ready])", root).forEach(el => { el.innerHTML = mascotInner(); el.dataset.ready = "1"; });
}
function setMood(el, mood) { if (el) el.dataset.mood = mood; }
function act(el, name, ms = 850) {
  if (!el || !fancy()) return;
  const cls = "act-" + name;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
function gearPop(el) {
  if (!el || !fancy()) return;
  const g = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  g.setAttribute("class", "i gear-pop");
  g.innerHTML = '<use href="#i-gear"/>';
  el.appendChild(g);
  setTimeout(() => g.remove(), 1100);
}

// ---------------------------------------------------------------------
// Penerapan setting ke tampilan
// ---------------------------------------------------------------------
function syncSettingControls() {
  $$('input[data-setting]').forEach(inp => { inp.checked = Boolean(S[inp.dataset.setting]); });
  $$('.seg[data-setting]').forEach(seg => {
    const key = seg.dataset.setting;
    $$("button", seg).forEach(b => b.classList.toggle("active", String(S[key]) === b.dataset.value));
  });
}
let leaveHandler = null;
function applySettings() {
  const root = document.documentElement;
  root.lang = S.lang;
  root.dataset.anim = S.anim ? "on" : "off";
  root.dataset.rm = S.reduced ? "on" : "off";
  root.dataset.text = String(S.textSize);
  root.dataset.int = String(S.intensity);
  root.classList.toggle("fx", fancy());
  root.classList.toggle("nochar", !S.showChar);
  root.classList.toggle("noglass", !S.glass);
  if (window.YS) { YS.applyTheme(S.theme); YS.setHaptic(S.haptic); }

  if (S.confirmLeave && !leaveHandler) {
    leaveHandler = e => { e.preventDefault(); e.returnValue = t("confirm.leave"); return e.returnValue; };
    window.addEventListener("beforeunload", leaveHandler);
  } else if (!S.confirmLeave && leaveHandler) {
    window.removeEventListener("beforeunload", leaveHandler);
    leaveHandler = null;
  }
  syncSettingControls();
  window.dispatchEvent(new CustomEvent("yd:settings"));
}
function rerenderTexts() {
  applyI18n();
  applySiteSettingsToUI(siteSettings);
  renderToolList();
  renderFavorites();
  renderGuideList();
  if (current === "tool") refreshToolTexts();
  window.dispatchEvent(new CustomEvent("yd:lang"));
  if (guideRun && !$("#guideRun").hidden) renderGuideStep(false);
  refreshSystemStatus();
  renderCfgAndStats();
  const bubble = $("#menuBubbleText");
  if (bubble && current === "menu") bubble.textContent = t("menu.welcome");
  if (!$("#panelDashboard").hidden) { buildPlatformManager(); fillAdminForms(); }
}
function changeSetting(key, value) {
  S[key] = value;
  saveSettings();
  applySettings();
  if (key === "lang") rerenderTexts();
}

// ---------------------------------------------------------------------
// Navigasi antar layar
// ---------------------------------------------------------------------
const SCREENS = ["menu", "tools", "tool", "favorites", "guide", "setting", "admin"];
const DOCK_SCREENS = new Set(["tools", "tool", "favorites", "guide", "setting"]);
const NAV_ORDER = ["menu", "tools", "guide", "setting"];
let current = null, navLock = false, histIdx = 0, adminAllowed = false, toolId = null;

function show(name, { dir = "fwd", tool } = {}) {
  if (name === "admin" && !adminAllowed) name = "menu";
  if (name === "tool") { if (tool) toolId = tool; if (!toolId || !TOOL_META[toolId]) name = "tools"; }
  const prev = current;
  SCREENS.forEach(n => { $("#screen-" + n).hidden = n !== name; });
  const el = $("#screen-" + name);
  el.classList.remove("enter", "enter-back"); void el.offsetWidth;
  el.classList.add(dir === "back" ? "enter-back" : "enter");
  el.scrollTop = 0;
  current = name;
  document.body.dataset.screen = name;

  const dock = $("#dock");
  dock.hidden = !DOCK_SCREENS.has(name);
  const navTarget = (name === "tool" || name === "favorites") ? "tools" : name;
  $$("[data-nav]", dock).forEach(b => b.classList.toggle("active", b.dataset.nav === navTarget));

  // Maintenance menutup layar pengunjung, tapi tidak halaman admin.
  if (name === "admin") hideMaintenanceOverlay();
  else if (maintenanceSettings.enabled) showMaintenanceOverlay(maintenanceSettings.message);

  if (name === "menu") onEnterMenu(prev);
  if (name === "tools") { renderToolList(); renderRecent(); }
  if (name === "favorites") renderFavorites();
  if (name === "tool") openToolView(toolId);
  if (name === "guide") showGuideList(false);
  if (name === "setting") { const m = $("#settingMascot"); act(m, "nod"); gearPop(m); }
  if (name === "admin") onEnterAdmin();
  window.dispatchEvent(new CustomEvent("yd:screen", { detail: { name, dir, prev } }));
}

function go(name, { replace = false, tool, wipe = false, delay = 0, dir = "fwd" } = {}) {
  if (navLock) return;
  if (name === current && name !== "tool") return;
  navLock = true;
  const swap = () => {
    const st = { i: replace ? histIdx : ++histIdx, s: name, t: tool || toolId };
    try { replace ? history.replaceState(st, "") : history.pushState(st, ""); } catch { /* no-op */ }
    show(name, { dir, tool });
    setTimeout(() => { navLock = false; }, 120);
  };
  if (wipe && fancy()) {
    setTimeout(() => {
      const w = $("#wipe"); w.classList.add("run");
      setTimeout(swap, 310);
      setTimeout(() => w.classList.remove("run"), 700);
    }, delay);
  } else {
    setTimeout(swap, delay ? Math.min(delay, 140) : 0);
  }
}
function navDir(to) {
  const a = NAV_ORDER.indexOf(current === "tool" || current === "favorites" ? "tools" : current), b = NAV_ORDER.indexOf(to);
  return a >= 0 && b >= 0 && b < a ? "back" : "fwd";
}
function goBack() {
  if (navLock) return;
  sfx("back");
  if (histIdx > 0) history.back();
  else { navLock = true; show("menu", { dir: "back" }); setTimeout(() => { navLock = false; }, 150); }
}
window.addEventListener("popstate", e => {
  const st = e.state || { i: 0, s: "menu" };
  const dir = st.i < histIdx ? "back" : "fwd";
  histIdx = st.i;
  if (st.s === "guide") { show("guide", { dir }); return; }
  show(st.s || "menu", { dir, tool: st.t });
});

document.addEventListener("click", e => {
  const dockBtn = e.target.closest("#dock [data-go]");
  if (dockBtn) { go(dockBtn.dataset.go, { replace: true, dir: navDir(dockBtn.dataset.go) }); return; }
  const menuBtn = e.target.closest("[data-go][data-act]");
  if (menuBtn) {
    const mascot = $("#screen-menu .mascot");
    const kind = menuBtn.dataset.act;
    if (kind === "start") { sfx("start"); act(mascot, "jump", 750); setMood(mascot, "happy"); }
    else if (kind === "guide") { sfx("click"); act(mascot, "nod"); setMood(mascot, "explain"); }
    else { sfx("click"); act(mascot, "wiggle"); gearPop(mascot); }
    go(menuBtn.dataset.go, { wipe: true, delay: fancy() ? 340 : 0 });
    return;
  }
  if (e.target.closest("[data-back]")) { goBack(); return; }
  const fav = e.target.closest("[data-fav]");
  if (fav) { e.preventDefault(); toggleFav(fav.dataset.fav); return; }
  if (e.target.closest("#recentClear")) { YS.recents.clear(); renderRecent(); showToast(t("ys.recentCleared")); sfx("click"); return; }
  const card = e.target.closest(".tool-card[data-tool], .recent-item[data-tool]");
  if (card) { openToolFromCard(card.dataset.tool); }
});


// ---------------------------------------------------------------------
// Keyboard (PC): panah = pilih, Enter = OK, Esc = kembali
// ---------------------------------------------------------------------
function kbItems() {
  const scr = $("#screen-" + current); if (!scr || scr.hidden) return [];
  const sel = {
    menu: ".mi", tools: ".tool-card, .recent-item", favorites: ".tool-card", guide: ".guide-card, #guidePrev, #guideNext",
    setting: ".tab, .pane.active .switch input, .pane.active .seg button, .pane.active .btn", tool: "#videoUrl, #pasteBtn, #downloadBtn, .download-option",
    admin: ".tab, .pane.active .btn"
  }[current];
  return sel ? $$(sel, scr).filter(el => el.offsetParent !== null) : [];
}
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-fav]")) { e.preventDefault(); toggleFav(e.target.dataset.fav); return; }
  if (e.target.matches("input[type=text],input[type=url],input[type=password],textarea")) {
    if (e.key === "Escape") e.target.blur();
    return;
  }
  if (!$("#loading") && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    if (!$("#secretDialog").hidden || !$("#resetDialog").hidden) return;
    const items = kbItems(); if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
    const next = i < 0 ? items[0] : items[(i + (fwd ? 1 : items.length - 1)) % items.length];
    next.focus(); next.scrollIntoView({ block: "nearest" });
    sfx("click"); e.preventDefault();
  } else if (e.key === "Escape") {
    if (!$("#secretDialog").hidden) { $("#secretDialog").hidden = true; return; }
    if (!$("#resetDialog").hidden) { openResetDialog(false); return; }
    if (current && current !== "menu") { if (current === "guide" && guideRun) $("#guideBack").click(); else goBack(); }
  }
});

// ---------------------------------------------------------------------
// MAIN MENU
// ---------------------------------------------------------------------
let typeTimer = null;
function typeInto(el, text) {
  clearInterval(typeTimer);
  if (!fancy()) { el.textContent = text; return; }
  el.textContent = ""; let i = 0;
  typeTimer = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i >= text.length) clearInterval(typeTimer);
  }, 22);
}
function onEnterMenu(prev) {
  const mascot = $("#screen-menu .mascot");
  setMood(mascot, "normal");
  if (prev) act(mascot, "jump", 750);
  typeInto($("#menuBubbleText"), t("menu.welcome"));
}

// ---------------------------------------------------------------------
// SELECT YOUR TOOLS
// ---------------------------------------------------------------------
function toolName(id) {
  const s = platformSettings[id];
  return (s && s.name) || TOOL_META[id].label;
}
function sortedToolIds() {
  return TOOL_ORDER.slice().sort((a, b) => (popularity[b] || 0) - (popularity[a] || 0) || TOOL_ORDER.indexOf(a) - TOOL_ORDER.indexOf(b));
}
function toolCardHTML(id, n, topId) {
  const s = platformSettings[id] || DEFAULT_PLATFORM_SETTINGS[id];
  const off = s.enabled === false;
  const fav = !!(window.YS && YS.favs.has(id));
  const tags = off
    ? `<span class="tag tag-off">${t("tools.disabled")}</span>`
    : `<span class="tag tag-ok">${t("tools.available")}</span>` +
      (id === topId ? `<span class="tag tag-pop">${icon("flame")}${t("tools.popular")}</span>` : "");
  return `
      <button class="tool-card${off ? " is-disabled" : ""}" data-tool="${id}" type="button" ${off ? 'aria-disabled="true"' : ""}>
        <span class="idx">0${n + 1}</span>
        <img class="ico" src="${TOOL_META[id].icon}" alt="" width="62" height="62">
        <span class="fav-btn${fav ? " on" : ""}" role="button" tabindex="0" data-fav="${id}" aria-pressed="${fav}" aria-label="${escapeAttr(t("ys.favBtn"))}">${icon("star")}</span>
        <span class="info">
          <span class="name">${escapeHtml(toolName(id))}</span>
          <span class="desc">${escapeHtml(t("tool." + id + ".desc"))}</span>
          <span class="tags">${tags}</span>
        </span>
        <span class="btn btn-primary open">${t("btn.open")}</span>
      </button>`;
}
function renderToolList() {
  const list = $("#toolList"); if (!list) return;
  const ids = sortedToolIds();
  const topId = ids[0] && (popularity[ids[0]] || 0) > 0 ? ids[0] : null;
  list.innerHTML = ids.map((id, n) => toolCardHTML(id, n, topId)).join("");
}
function renderFavorites() {
  const list = $("#favList"); if (!list) return;
  const ids = window.YS ? YS.favs.list().filter(id => TOOL_META[id]) : [];
  list.innerHTML = ids.map((id, n) => toolCardHTML(id, n, null)).join("");
  $("#favEmpty").hidden = ids.length > 0;
}
function timeAgo(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return t("ys.justNow");
  if (m < 60) return t("ys.minAgo", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("ys.hrAgo", { n: h });
  return t("ys.dayAgo", { n: Math.round(h / 24) });
}
function renderRecent() {
  const box = $("#recentBox"); if (!box || !window.YS) return;
  const items = YS.recents.top(5);
  if (!items.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `
    <div class="recent-h"><span class="label">${icon("clock")} ${t("ys.recent")}</span>
      <button class="recent-clear" id="recentClear" type="button">${icon("trash")}<span>${t("ys.recentClear")}</span></button></div>
    <div class="recent-list">${items.map(it => `
      <button class="recent-item" type="button" data-tool="${it.id}" title="${escapeAttr(t("ys.recentOpen"))}">
        <img src="${TOOL_META[it.id].icon}" alt="" width="34" height="34">
        <span class="r-txt"><b>${escapeHtml(toolName(it.id))}</b><small>${escapeHtml(timeAgo(it.ts))} • ${escapeHtml(t("ys.recentUses", { n: it.count }))}</small></span>
      </button>`).join("")}</div>`;
}
function syncToolFav() {
  const b = $("#toolFav"); if (!b || !window.YS) return;
  const on = YS.favs.has(toolId);
  b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
}
function toggleFav(id) {
  if (!window.YS || !TOOL_META[id]) return;
  const on = YS.favs.toggle(id);
  sfx("toggle"); YS.haptic("select");
  showToast(t(on ? "ys.favAdd" : "ys.favDel"));
  renderToolList(); renderFavorites(); syncToolFav();
  const fb = $(`#toolList [data-fav="${id}"]`); if (fb && fancy()) { fb.classList.add("pop"); setTimeout(() => fb.classList.remove("pop"), 400); }
}
async function loadPopularity() {
  try {
    const r = await fetch(CONFIG.popularToolsEndpoint);
    const d = await r.json().catch(() => null);
    if (r.ok && Array.isArray(d?.popularTools)) {
      popularity = {};
      d.popularTools.forEach(x => { popularity[x.tool] = x.count || 0; });
      renderToolList();
    }
  } catch { /* urutan default */ }
}
function openToolFromCard(id) {
  const s = platformSettings[id];
  if (s && s.enabled === false) {
    sfx("error");
    showToast(t("tools.disabledMsg", { name: s.name || TOOL_META[id].label }));
    return;
  }
  go("tool", { tool: id });
}

// ---------------------------------------------------------------------
// DOWNLOADER (logika & endpoint sama seperti versi sebelumnya)
// ---------------------------------------------------------------------
function refreshToolTexts() {
  if (!toolId) return;
  $("#toolTitle").textContent = `${toolName(toolId)} Downloader`;
  $("#toolDescription").textContent = t("tool." + toolId + ".long");
  $("#videoUrl").placeholder = t("tool.placeholder", { name: toolName(toolId) });
}
function setToolBubble(key, mood) {
  $("#toolBubble").textContent = t(key);
  $("#toolBubble").dataset.i18n = key;
  setMood($("#toolMascot"), mood);
}
function openToolView(id) {
  const setting = platformSettings[id];
  if (setting && setting.enabled === false) { show("tools", { dir: "back" }); return; }
  $("#toolBigIcon").src = TOOL_META[id].icon;
  refreshToolTexts();
  $("#videoUrl").value = "";
  const box = $("#resultBox"); box.hidden = true; box.className = "result-box";
  $("#downloadBtn").dataset.activeTool = id; // dipakai getActiveDownloadEndpoint()
  setToolBubble("tool.idle", "explain");
  if (window.YS) YS.recents.add(id);
  syncToolFav();
  window.dispatchEvent(new CustomEvent("yd:tool", { detail: { tool: id } }));
  trackEvent({ event: "tool", tool: id });
}
async function pasteUrl() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) throw new Error("empty");
    $("#videoUrl").value = text.trim();
    showToast(t("tool.pasted"));
    act($("#toolMascot"), "nod");
  } catch {
    const inp = $("#videoUrl"); inp.focus();
    showToast(t("ys.pasteHint"));
  }
}
function getActivePlatform() { return $("#downloadBtn")?.dataset.activeTool || ""; }
function getActiveDownloadEndpoint() {
  return getActivePlatform() === "pinterest" ? CONFIG.pinterestEndpoint : CONFIG.downloadEndpoint;
}
function setDownloadBtn(busy) {
  const btn = $("#downloadBtn");
  btn.disabled = busy;
  btn.innerHTML = busy
    ? `<span class="spinner"></span><span>${t("tool.processing")}</span>`
    : `${icon("download")}<span>${t("btn.download")}</span>`;
}
async function downloadVideo() {
  const url = $("#videoUrl").value.trim();
  const box = $("#resultBox");

  if (!url || !/^https?:\/\//i.test(url)) {
    box.hidden = false;
    box.className = "result-box error";
    box.innerHTML = `<strong>${t("tool.invalidTitle")}</strong><br>${t("tool.invalidBody")}`;
    setToolBubble("tool.fail", "confused"); sfx("error");
    return;
  }

  if (navigator.onLine === false) {
    box.hidden = false; box.className = "result-box error";
    box.innerHTML = `<strong>${t("ys.offline")}</strong><br>${t("ys.offlineBlock")}`;
    setToolBubble("tool.fail", "confused"); sfx("error");
    return;
  }
  const actTool = getActivePlatform();
  const emitAct = state => window.dispatchEvent(new CustomEvent("yd:activity", { detail: { state, tool: actTool, name: toolName(actTool) } }));
  emitAct("start");
  setDownloadBtn(true);
  box.hidden = false;
  box.className = "result-box loading";
  box.innerHTML = `<span class="spinner"></span><span>${t("tool.fetching")}</span>`;
  setToolBubble("tool.working", "explain");

  try {
    const response = await fetch(getActiveDownloadEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, platform: getActivePlatform() })
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 503 && data.maintenance) {
      applyMaintenanceState({ enabled: true, message: data.error });
      box.hidden = true;
      return;
    }
    if (!response.ok || data.error) {
      throw new Error(data.error || t("tool.errTitle"));
    }
    renderDownloadResult(data);
    if (window.YS) YS.recents.markOk(actTool);
    emitAct("ok");
    setToolBubble("tool.success", "happy"); sfx("success");
    act($("#toolMascot"), "jump");
    box.scrollIntoView({ behavior: S.reduced || !S.anim ? "auto" : "smooth", block: "nearest" });
  } catch (error) {
    console.error("Download error:", error);
    box.className = "result-box error";
    box.innerHTML = `<strong>${t("tool.errTitle")}</strong><br>${escapeHtml(error.message)}<br><small>${t("tool.errHint")}</small>`;
    emitAct("fail");
    setToolBubble("tool.fail", "confused"); sfx("error");
  } finally {
    setDownloadBtn(false);
  }
}
function renderDownloadResult(data) {
  const box = $("#resultBox");
  box.className = "result-box";

  if (data.status !== "picker" || !Array.isArray(data.picker)) throw new Error(t("tool.noPicker"));
  const items = data.picker.filter(item => item?.url);
  if (!items.length) throw new Error(t("tool.noMedia"));

  const title = data.title ? `<div class="result-title">${escapeHtml(data.title)}</div>` : "";
  const author = data.author ? `<small>${t("tool.creator")}: ${escapeHtml(data.author)}</small>` : "";
  const first = items[0];
  const isImage = /gambar|image|jpg|jpeg|png|webp/i.test(`${first?.type || ""} ${first?.extension || ""}`);
  const preview = isImage
    ? `<img class="preview" src="${escapeAttr(first.url)}" alt="${escapeAttr(data.title || "Preview")}" referrerpolicy="no-referrer">`
    : `<video controls playsinline preload="metadata" src="${escapeAttr(first.url)}"></video>`;

  box.innerHTML = `
    ${title}${author}${preview}
    <div class="result-pick">${t("tool.pickFormat").toUpperCase()}</div>
    <div class="download-list">
      ${items.map((item, index) => `
        <div class="opt-row">
          <button type="button" class="download-option" data-media-index="${index}">
            <span>${escapeHtml(item.type || "Media")}${item.quality ? ` • ${escapeHtml(item.quality)}` : ""}</span>
            <span class="go">${t("btn.download")} ${icon("download")}</span>
          </button>
          <button type="button" class="copy-btn" data-copy="${escapeAttr(item.url)}" aria-label="${escapeAttr(t("ys.copyLink"))}" title="${escapeAttr(t("ys.copyLink"))}">${icon("copy")}</button>
        </div>`).join("")}
    </div>
    ${data.title ? `<button type="button" class="btn btn-soft btn-sm copy-title" data-copy="${escapeAttr(data.title)}">${icon("copy")}<span>${t("ys.copyTitle")}</span></button>` : ""}`;

  $$(".download-option[data-media-index]", box).forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.mediaIndex);
      downloadSelectedMedia($("#videoUrl").value.trim(), index, data.title || "YamadaDown", items[index]?.extension || "mp4", button);
    });
  });
}
async function downloadSelectedMedia(originalUrl, mediaIndex, title, extension, button) {
  if (!originalUrl) { showToast(t("tool.noUrl")); return; }
  const originalLabel = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span><span class="spinner"></span></span><span class="go">${t("tool.processing")}</span>`;

  try {
    const response = await fetch(getActiveDownloadEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: originalUrl, download: true, mediaIndex, platform: getActivePlatform() })
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 503 && data.maintenance) {
      applyMaintenanceState({ enabled: true, message: data.error });
      return;
    }
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (!data.url) throw new Error(t("tool.noUrl"));

    const safeTitle = String(title || "YamadaDown").replace(/[\\/:*?"<>|]/g, "").trim();
    const safeExtension = String(extension || "mp4").replace(/[^a-zA-Z0-9]/g, "");
    const fileName = `${safeTitle || "YamadaDown"}.${safeExtension || "mp4"}`;

    // Lewat proxy same-origin (/api/fetch) supaya header Content-Disposition:
    // attachment membuat file langsung terunduh tanpa dialog tambahan.
    const proxyUrl = `${CONFIG.proxyEndpoint}?url=${encodeURIComponent(data.url)}&filename=${encodeURIComponent(fileName)}`;
    const link = document.createElement("a");
    link.href = proxyUrl; link.download = fileName; link.style.display = "none";
    document.body.appendChild(link); link.click(); link.remove();

    showToast(t("tool.started"));
    showBigNotice(t("tool.bigDone"));
    window.dispatchEvent(new CustomEvent("yd:activity", { detail: { state: "ok", tool: getActivePlatform(), name: toolName(getActivePlatform()) } }));
    sfx("success");
  } catch (error) {
    console.error("Download error:", error);
    showToast(t("tool.failShort", { msg: error.message }));
    sfx("error");
  } finally {
    button.disabled = false;
    button.innerHTML = originalLabel;
  }
}

// ---------------------------------------------------------------------
// GUIDE (tutorial interaktif)
// ---------------------------------------------------------------------
let guideRun = null, guideStep = 0;
const GUIDE_DONE_KEY = "yd_guide_done";
function guideDone() { try { return JSON.parse(lsGet(GUIDE_DONE_KEY) || "[]"); } catch { return []; } }
function markGuideDone(id) { const d = guideDone(); if (!d.includes(id)) { d.push(id); lsSet(GUIDE_DONE_KEY, JSON.stringify(d)); } }
const L = o => (o && (o[S.lang] || o.id)) || "";

function renderGuideList() {
  const wrap = $("#guideCards"); if (!wrap || !window.YD_GUIDES) return;
  const done = guideDone();
  wrap.innerHTML = YD_GUIDES.map((g, i) => `
    <button class="guide-card" type="button" data-guide="${i}">
      ${g.icon ? `<img class="gi" src="${g.icon}" alt="" width="52" height="52">` : `<span class="gi">${icon("sparkles")}</span>`}
      <span><b>${escapeHtml(L(g.title))}</b><small>${t("guide.steps", { n: g.steps.length })}</small></span>
      ${done.includes(g.id) ? `<span class="done">${icon("check")}${t("guide.done")}</span>` : icon("chev-r")}
    </button>`).join("");
}
function showGuideList(animate = true) {
  guideRun = null;
  $("#guideList").hidden = false; $("#guideRun").hidden = true;
  $("#guideTitle").textContent = t("guide.title");
  $("#guideTitle").dataset.i18n = "guide.title";
  renderGuideList();
  if (animate) act($("#screen-guide .topbar .mascot"), "nod");
}
function openGuide(i) {
  guideRun = YD_GUIDES[i]; guideStep = 0;
  $("#guideList").hidden = true; $("#guideRun").hidden = false;
  $("#guideTitle").removeAttribute("data-i18n");
  $("#guideTitle").textContent = L(guideRun.title);
  try { history.pushState({ i: ++histIdx, s: "guide", run: true }, ""); } catch { /* no-op */ }
  $("#screen-guide").scrollTop = 0;
  renderGuideStep(true);
}
function sceneWords() {
  return S.lang === "en"
    ? { share: "Share", copy: "Copy link", chat: "Chat", more: "More", paste: "PASTE", dl: "DOWNLOAD", url: "https://...", lang: "Language", sound: "Sound", install: "Install", open: "OPEN", pop: "POPULAR", start: "START", guide: "GUIDE", setting: "SETTING", fmt: "Video 720p", fmt2: "Audio" }
    : { share: "Bagikan", copy: "Salin link", chat: "Chat", more: "Lainnya", paste: "PASTE", dl: "DOWNLOAD", url: "https://...", lang: "Bahasa", sound: "Suara", install: "Pasang", open: "OPEN", pop: "POPULER", start: "START", guide: "GUIDE", setting: "SETTING", fmt: "Video 720p", fmt2: "Audio" };
}
function sceneHTML(step, g) {
  const w = sceneWords();
  const h = k => (step.hl === k ? " hl" : "");
  switch (step.scene) {
    case "source": {
      const meta = TOOL_META[step.platform] || {};
      return `<div class="mock"><div class="bar"><img src="${meta.icon}" alt="">${escapeHtml(meta.label || "")}</div>
        <div class="thumb">${icon("play")}</div>
        <div class="acts"><span class="m-btn">${icon("zap")}</span><span class="m-btn${h("share")}">${icon("share")}</span><span class="m-btn${h("menu")}">${icon("dots")}</span></div></div>`;
    }
    case "sheet":
      return `<div class="mock"><div class="sheet-h">${w.share.toUpperCase()}</div>
        <div class="m-row">${icon("chat")}${w.chat}</div>
        <div class="m-row${h("copy")}">${icon("link")}${w.copy}</div>
        <div class="m-row">${icon("dots")}${w.more}</div></div>`;
    case "tools":
      return `<div class="mock">${TOOL_ORDER.map((id, i) => `
        <div class="m-card${step.hl === id ? " hl" : ""}"><img src="${TOOL_META[id].icon}" alt=""><b>${TOOL_META[id].label}</b>
        <span class="t${i === 0 && step.hl === "popular" ? " hl" : ""}">${i === 0 && step.hl === "popular" ? w.pop : w.open}</span></div>`).join("")}</div>`;
    case "tool":
      return `<div class="mock"><div class="m-flex"><span class="m-input${h("input")}">${w.url}</span><span class="m-btn${h("paste")}">${icon("clip")}${w.paste}</span></div>
        <span class="m-btn solid" style="height:38px">${icon("download")}${w.dl}</span>
        <div class="m-row${h("format")}">${w.fmt}<span class="m-btn" style="margin-left:auto;height:26px;min-width:26px">${icon("download")}</span></div>
        <div class="m-row">${w.fmt2}<span class="m-btn" style="margin-left:auto;height:26px;min-width:26px">${icon("download")}</span></div></div>`;
    case "menu":
      return `<div class="mock" style="align-items:center"><img src="assets/ryo-sm.webp" alt="" width="64" height="64" style="border-radius:50%;border:3px solid var(--sky)">
        <span class="m-btn solid${h("start")}" style="width:100%;height:36px">${icon("play")}${w.start}</span>
        <div class="m-flex" style="width:100%"><span class="m-btn${h("guide")}" style="flex:1">${icon("book")}${w.guide}</span><span class="m-btn${h("setting")}" style="flex:1">${icon("sliders")}${w.setting}</span></div></div>`;
    case "setting":
      return `<div class="mock"><div class="m-row${h("lang")}">${icon("globe")}${w.lang}<span class="m-btn" style="margin-left:auto;height:26px">ID | EN</span></div>
        <div class="m-row">${icon("vol")}${w.sound}<span class="m-btn solid" style="margin-left:auto;height:26px">ON</span></div>
        <div class="m-row${h("install")}">${icon("plus-sq")}${w.install}</div></div>`;
  }
  return "";
}
function renderGuideStep(animate, back = false) {
  const g = guideRun; if (!g) return;
  const step = g.steps[guideStep], n = g.steps.length;
  $("#guideProgress").innerHTML = g.steps.map((_, i) => `<i class="${i < guideStep ? "on" : i === guideStep ? "on now" : ""}"></i>`).join("");
  $("#guideStepLabel").textContent = t("guide.step", { a: guideStep + 1, b: n });
  const scene = $("#guideScene");
  scene.classList.toggle("back", back);
  scene.innerHTML = sceneHTML(step, g);
  $("#guideStepTitle").textContent = L(step.title);
  $("#guideStepText").textContent = L(step.text);
  const m = $("#guideMascot");
  setMood(m, step.mood || "explain");
  if (animate) act(m, "nod");
  $("#guidePrev").style.visibility = guideStep === 0 ? "hidden" : "visible";
  const last = guideStep === n - 1;
  const nxt = $("#guideNext");
  nxt.innerHTML = `<span>${last ? t("btn.finish") : t("btn.next")}</span>${icon(last ? "check" : "chev-r")}`;
}
function guideMove(delta) {
  if (!guideRun) return;
  const n = guideRun.steps.length, next = guideStep + delta;
  if (next < 0) return;
  if (next >= n) { finishGuide(); return; }
  guideStep = next;
  renderGuideStep(true, delta < 0);
}
function finishGuide() {
  markGuideDone(guideRun.id);
  sfx("success");
  showToast(t("guide.finished"));
  const m = $("#guideMascot"); setMood(m, "happy"); act(m, "jump");
  setTimeout(() => {
    // kembali ke daftar tutorial dan rapikan riwayat
    if (history.state && history.state.run) { histIdx = Math.max(0, histIdx - 1); try { history.back(); } catch { showGuideList(); } }
    else showGuideList();
  }, fancy() ? 700 : 0);
}
$("#guideCards").addEventListener("click", e => {
  const card = e.target.closest("[data-guide]");
  if (card) openGuide(Number(card.dataset.guide));
});
$("#guideNext").addEventListener("click", () => guideMove(1));
$("#guidePrev").addEventListener("click", () => guideMove(-1));
$("#guideBack").addEventListener("click", () => {
  if (guideRun) { if (history.state && history.state.run) history.back(); else showGuideList(); }
  else goBack();
});

// ---------------------------------------------------------------------
// SETTING
// ---------------------------------------------------------------------
function bindTabs(container) {
  container.addEventListener("click", e => {
    const tab = e.target.closest(".tab"); if (!tab) return;
    const scope = container.parentElement;
    $$(".tab", container).forEach(b => b.classList.toggle("active", b === tab));
    $$(":scope > .pane", scope).forEach(p => p.classList.toggle("active", p.dataset.pane === tab.dataset.tab));
  });
}
bindTabs($("#settingTabs"));
bindTabs($("#adminTabs"));

$$('input[data-setting]').forEach(inp => inp.addEventListener("change", () => changeSetting(inp.dataset.setting, inp.checked)));
$$('.seg[data-setting]').forEach(seg => seg.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const key = seg.dataset.setting;
  const v = (key === "lang" || key === "theme") ? b.dataset.value : Number(b.dataset.value);
  changeSetting(key, v);
}));

function openResetDialog(open) { $("#resetDialog").hidden = !open; }
$("#resetBtn").addEventListener("click", () => openResetDialog(true));
$("#resetCancel").addEventListener("click", () => openResetDialog(false));
$("#resetOk").addEventListener("click", () => {
  S = defaultSettings(); saveSettings(); applySettings(); rerenderTexts();
  openResetDialog(false); showToast(t("setting.resetDone")); sfx("success");
});

// ---------------------------------------------------------------------
// AKSES ADMIN RAHASIA (ketuk maskot 7x). Ini hanya menyembunyikan jalan
// masuk secara visual; keamanan sesungguhnya ada di server (/api/admin-*).
// ---------------------------------------------------------------------
let tapCount = 0, tapTimer = null, tapMascot = null;
document.addEventListener("click", e => {
  const m = e.target.closest(".mascot[data-secret]");
  if (!m) return;
  tapMascot = m;
  tapCount++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 2000);
  act(m, "tap", 300);
  sfx("tap", Math.min(tapCount, 7));
  if (tapCount >= 7) { tapCount = 0; clearTimeout(tapTimer); revealSecret(m); }
});
function revealSecret(m) {
  sfx("secret");
  setMood(m, "happy"); act(m, "jump", 900);
  const fx = $("#secretFx");
  fx.classList.remove("run"); void fx.offsetWidth;
  if (fancy() || S.anim) fx.classList.add("run");
  const dlg = $("#secretDialog");
  setTimeout(() => { dlg.hidden = false; setTimeout(() => $("#secretGo").focus(), 80); fx.classList.remove("run"); }, S.anim ? 1000 : 0);
}
$("#secretClose").addEventListener("click", () => { $("#secretDialog").hidden = true; });
$("#secretGo").addEventListener("click", () => {
  $("#secretDialog").hidden = true;
  adminAllowed = true;
  go("admin", { wipe: true });
});

// ---------------------------------------------------------------------
// PANEL ADMIN (fungsi sama seperti sebelumnya, tampilan baru)
// ---------------------------------------------------------------------
let lastStats = null;
function getAdminToken() { try { return sessionStorage.getItem(CONFIG.adminTokenStorageKey) || ""; } catch { return ""; } }
function setAdminToken(token) {
  try { token ? sessionStorage.setItem(CONFIG.adminTokenStorageKey, token) : sessionStorage.removeItem(CONFIG.adminTokenStorageKey); } catch { /* no-op */ }
}
function showPanelLocked(msg) {
  $("#panelLocked").hidden = false;
  $("#panelDashboard").hidden = true;
  const err = $("#panelError");
  err.hidden = !msg; err.textContent = msg || "";
}
function showPanelDashboard() { $("#panelLocked").hidden = true; $("#panelDashboard").hidden = false; }

async function onEnterAdmin() {
  buildPlatformManager();
  const token = getAdminToken();
  if (!token) { showPanelLocked(); setTimeout(() => $("#panelKeyInput")?.focus(), 300); return; }
  // Token lama hanya dipakai kalau server masih menerimanya.
  showPanelDashboard();
  await Promise.all([loadPanelStats(), loadAdminSettings()]);
}
async function unlockPanel() {
  const input = $("#panelKeyInput");
  const key = input.value.trim();
  const btn = $("#panelUnlockBtn");
  if (!key) { showPanelLocked(t("admin.empty")); return; }

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span><span>${t("admin.checking")}</span>`;
  try {
    const response = await fetch(CONFIG.adminAuthEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token) {
      sfx("error");
      showPanelLocked(data.error || t("admin.wrong"));
      return;
    }
    setAdminToken(data.token);
    input.value = "";
    sfx("success");
    showPanelDashboard();
    await Promise.all([loadPanelStats(), loadAdminSettings()]);
  } catch (error) {
    showPanelLocked(t("admin.netErr", { msg: error.message }));
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${icon("lock")}<span>${t("btn.login")}</span>`;
  }
}
function logoutPanel() { setAdminToken(null); showPanelLocked(); }

function fmtNum(n) { return Number(n || 0).toLocaleString(S.lang === "en" ? "en-US" : "id-ID"); }
async function loadPanelStats() {
  const token = getAdminToken();
  const list = $("#popularToolsList");
  list.innerHTML = `<p class="helper">${t("admin.loading")}</p>`;
  $("#panelKvNotice").hidden = true;
  try {
    const response = await fetch(CONFIG.adminStatsEndpoint, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) { setAdminToken(null); showPanelLocked(t("admin.expired")); return; }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { list.innerHTML = `<p class="helper">${t("admin.loadFail", { msg: escapeHtml(data.error || "Unknown error") })}</p>`; return; }
    lastStats = data;
    renderCfgAndStats();
  } catch (error) {
    list.innerHTML = `<p class="helper">${t("admin.netErr", { msg: escapeHtml(error.message) })}</p>`;
  }
}
function cfgRow(label, text, cls) { return `<li><code>${escapeHtml(label)}</code><span class="st ${cls}">${escapeHtml(text)}</span></li>`; }
function renderCfgAndStats() {
  const data = lastStats; if (!data) return;
  $("#statTotalVisits").textContent = fmtNum(data.totalVisits);
  const tools = Array.isArray(data.popularTools) ? data.popularTools : [];
  $("#statToolsUsed").textContent = fmtNum(tools.reduce((s, x) => s + (x.count || 0), 0));
  $("#statTotalDownloads").textContent = fmtNum(data.totalDownloads);
  $("#statDownloadsToday").textContent = fmtNum(data.downloadsToday);
  $("#statApiRequests").textContent = fmtNum(data.apiRequests);
  $("#statApiFailed").textContent = fmtNum(data.apiFailed);
  renderApiStatusBadge(data.apiStatus);

  const list = $("#popularToolsList");
  if (!tools.length) list.innerHTML = `<p class="helper">${t("admin.noData")}</p>`;
  else {
    const max = Math.max(...tools.map(x => x.count || 0), 1);
    list.innerHTML = tools.map((x, i) => `
      <div class="rank"><span class="n">#${i + 1}</span><b>${escapeHtml(x.tool)}</b><span>${fmtNum(x.count)}x</span>
      <span class="bar"><i style="width:${Math.max(4, Math.round(((x.count || 0) / max) * 100))}%"></i></span></div>`).join("");
  }

  const c = data.config || {};
  $("#cfgList").innerHTML =
    cfgRow(t("admin.cfgKv"), c.kv ? t("admin.cfgOk") : t("admin.cfgMissing"), c.kv ? "ok" : "no") +
    cfgRow(t("admin.cfgKey"), c.adminKey ? t("admin.cfgOk") : t("admin.cfgMissing"), c.adminKey ? "ok" : "no") +
    cfgRow(t("admin.cfgSecret"), c.sessionSecret ? t("admin.cfgOk") : t("admin.cfgOptional"), c.sessionSecret ? "ok" : "mid") +
    cfgRow(t("admin.cfgApi"), c.downloaderApi === "custom" ? t("admin.cfgCustom") : t("admin.cfgDefault"), "mid");

  const notice = $("#panelKvNotice");
  if (data.kvConfigured === false) { notice.textContent = t("admin.kvMissing"); notice.hidden = false; }
  else notice.hidden = true;
}
function renderApiStatusBadge(apiStatus) {
  const badge = $("#statApiStatus"), timeEl = $("#statApiStatusTime");
  const status = apiStatus?.status || "unknown";
  badge.className = "badge badge-" + (status === "online" || status === "offline" ? status : "unknown");
  badge.textContent = status === "online" ? t("admin.statusOnline") : status === "offline" ? t("admin.statusOffline") : t("admin.statusUnknown");
  timeEl.textContent = apiStatus?.at ? t("admin.lastChecked", { t: new Date(apiStatus.at).toLocaleString(S.lang === "en" ? "en-US" : "id-ID") }) : "";
}

function buildPlatformManager() {
  const wrap = $("#platformList"); if (!wrap) return;
  const keep = {};
  $$(".platform-toggle", wrap).forEach(el => { keep[el.dataset.platform] = { enabled: el.checked, name: $(`.platform-name-input[data-platform="${el.dataset.platform}"]`, wrap)?.value }; });
  wrap.innerHTML = ["tiktok", "instagram", "youtube", "pinterest"].map(id => {
    const s = keep[id] || platformSettings[id] || DEFAULT_PLATFORM_SETTINGS[id];
    return `<div class="platform-row${s.enabled === false ? " off" : ""}" data-platform-row="${id}">
      <img src="${TOOL_META[id].icon}" alt="">
      <div class="nm"><input type="text" class="platform-name-input" data-platform="${id}" maxlength="40" value="${escapeAttr(s.name || "")}"><small>${id}</small></div>
      <label class="switch"><input type="checkbox" class="platform-toggle" data-platform="${id}" ${s.enabled === false ? "" : "checked"}><span class="knob"></span></label>
    </div>`;
  }).join("");
  $$(".platform-toggle", wrap).forEach(el => el.addEventListener("change", () => el.closest(".platform-row").classList.toggle("off", !el.checked)));
}
function fillAdminForms() {
  $("#maintenanceToggle").checked = Boolean(maintenanceSettings.enabled);
  $("#maintenanceMessageInput").value = maintenanceSettings.message || "";
  $("#siteNameInput").value = siteSettings.name || "";
  $("#siteDescriptionInput").value = siteSettings.description || "";
  $("#siteLogoInput").value = siteSettings.logoUrl || "";
  $("#siteLogoPreview").src = siteSettings.logoUrl || DEFAULT_SITE_SETTINGS.logoUrl;
  $("#siteCsLinkInput").value = siteSettings.csLink || "";
}
async function loadAdminSettings() {
  const token = getAdminToken(); if (!token) return;
  try {
    const response = await fetch(CONFIG.adminSettingsEndpoint, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) return; // sesi expired ditangani loadPanelStats()
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    if (data.platforms) { platformSettings = data.platforms; buildPlatformManager(); renderToolList(); }
    if (data.maintenance) maintenanceSettings = data.maintenance;
    if (data.site) applySiteSettingsToUI(data.site);
    fillAdminForms();
  } catch { /* biarkan form menampilkan data terakhir */ }
}
async function saveAdminSettings(payload, statusElId) {
  const token = getAdminToken();
  const statusEl = statusElId ? $(statusElId) : null;
  const say = (msg, ok) => { if (!statusEl) return; statusEl.textContent = msg; statusEl.className = "msg " + (ok ? "msg-ok" : "msg-bad"); statusEl.hidden = false; if (ok) setTimeout(() => { statusEl.hidden = true; }, 3500); };
  if (!token) { showToast(t("admin.noSession")); return; }
  try {
    const response = await fetch(CONFIG.adminSettingsEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { setAdminToken(null); showPanelLocked(t("admin.expired")); return; }
    if (!response.ok) throw new Error(data.error || "HTTP " + response.status);

    if (data.platforms) { platformSettings = data.platforms; renderToolList(); }
    if (data.maintenance) maintenanceSettings = data.maintenance;
    if (data.site) { applySiteSettingsToUI(data.site); $("#siteLogoPreview").src = data.site.logoUrl || DEFAULT_SITE_SETTINGS.logoUrl; }
    say(t("admin.savedOk"), true);
    showToast(t("toast.saved")); sfx("success");
  } catch (error) {
    say(t("admin.saveFail", { msg: error.message }), false);
    showToast(t("admin.saveFail", { msg: error.message })); sfx("error");
  }
}
function collectPlatformFormPayload() {
  const platforms = {};
  $$(".platform-toggle").forEach(toggle => {
    const id = toggle.dataset.platform; if (!id) return;
    const nameInput = $(`.platform-name-input[data-platform="${id}"]`);
    platforms[id] = { enabled: toggle.checked, name: nameInput ? nameInput.value.trim() : undefined };
  });
  return platforms;
}
$("#platformSaveBtn").addEventListener("click", () => saveAdminSettings({ platforms: collectPlatformFormPayload() }, "#platformSaveStatus"));
$("#maintenanceSaveBtn").addEventListener("click", () => saveAdminSettings({ maintenance: { enabled: $("#maintenanceToggle").checked, message: $("#maintenanceMessageInput").value.trim() } }, "#maintenanceSaveStatus"));
$("#siteSaveBtn").addEventListener("click", () => saveAdminSettings({ site: {
  name: $("#siteNameInput").value.trim(), description: $("#siteDescriptionInput").value.trim(),
  logoUrl: $("#siteLogoInput").value.trim(), csLink: $("#siteCsLinkInput").value.trim() } }, "#siteSaveStatus"));
$("#siteLogoInput").addEventListener("input", () => { $("#siteLogoPreview").src = $("#siteLogoInput").value.trim() || DEFAULT_SITE_SETTINGS.logoUrl; });
$("#panelUnlockBtn").addEventListener("click", unlockPanel);
$("#panelKeyInput").addEventListener("keydown", e => { if (e.key === "Enter") unlockPanel(); });
$("#panelRefreshBtn").addEventListener("click", () => { loadPanelStats(); loadAdminSettings(); });
$("#panelLogoutBtn").addEventListener("click", logoutPanel);

// ---------------------------------------------------------------------
// Website Setting (nama, deskripsi, logo, CS) & Maintenance (pengunjung)
// ---------------------------------------------------------------------
function applyLogoText(name) {
  const words = String(name || "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  const l1 = words.length > 1 ? words.slice(0, -1).join(" ") : (words[0] || "");
  const l2 = words.length > 1 ? words[words.length - 1] : "";
  $$(".logo").forEach(el => {
    el.setAttribute("aria-label", words.join(" "));
    $(".l1", el).textContent = l1;
    const e2 = $(".l2", el); e2.textContent = l2; e2.hidden = !l2;
  });
}
function applySiteSettingsToUI(site) {
  siteSettings = { ...DEFAULT_SITE_SETTINGS, ...(site || {}) };
  document.title = siteSettings.name;
  const meta = $('meta[name="description"]'); if (meta) meta.setAttribute("content", siteSettings.description);
  const fav = $('link[rel="icon"]'); if (fav) fav.href = siteSettings.logoUrl;
  $$(".site-logo-img").forEach(img => { img.src = siteSettings.logoUrl; });
  applyLogoText(siteSettings.name);
  $("#aboutName").textContent = siteSettings.name;
  const hn = $("#hudName"); if (hn) hn.textContent = siteSettings.name.toUpperCase();
  const cs = $("#csLink"); if (cs) cs.href = safeHref(siteSettings.csLink, CONFIG.customerService);
  CONFIG.customerService = siteSettings.csLink;
}
// Hanya izinkan http(s)/mailto agar nilai dari pengaturan tidak bisa berisi javascript:
function safeHref(url, fallback) { return /^(https?:\/\/|mailto:)/i.test(String(url || "").trim()) ? String(url).trim() : fallback; }

function applyMaintenanceState(m) {
  maintenanceSettings = m || { enabled: false, message: "" };
  if (maintenanceSettings.enabled && current !== "admin") showMaintenanceOverlay(maintenanceSettings.message);
  else hideMaintenanceOverlay();
  refreshSystemStatus();
}
function showMaintenanceOverlay(message) {
  const el = $("#maintenanceOverlay"); if (!el) return;
  $("#maintenanceMessage").textContent = message || t("maint.default");
  el.hidden = false;
}
function hideMaintenanceOverlay() { const el = $("#maintenanceOverlay"); if (el) el.hidden = true; }
async function loadPublicSettings() {
  try {
    const response = await fetch(CONFIG.settingsEndpoint, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!data) return;
    if (data.platforms) { platformSettings = data.platforms; renderToolList(); }
    if (data.site) applySiteSettingsToUI(data.site);
    if (data.maintenance) applyMaintenanceState(data.maintenance);
  } catch { /* web tetap bisa dipakai kalau /api/settings gagal */ }
}
$("#maintenanceRetryBtn").addEventListener("click", async () => {
  const btn = $("#maintenanceRetryBtn"), label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `<span class="spinner"></span><span>${t("maint.checking")}</span>`;
  await loadPublicSettings();
  btn.disabled = false; btn.innerHTML = label;
});

// ---------------------------------------------------------------------
// Status sistem (perangkat, baterai, jaringan, layanan)
// ---------------------------------------------------------------------
let batteryRef = null;
function refreshSystemStatus() {
  const D = window.YS ? YS.device : null;
  let dev = t("sys.desktop");
  if (D) dev = D.isIPhone ? "iPhone" : D.isIPad ? "iPad" : D.isTablet ? t("sys.tablet") : D.isPhone ? t("sys.phone") : t("sys.desktop");
  $("#deviceType").textContent = dev;

  const bat = $("#deviceBatteryStatus");
  bat.classList.remove("low", "medium");
  if (!batteryRef) { if (bat.dataset.na) bat.textContent = t("sys.na"); }
  else {
    const pct = Math.max(0, Math.min(100, Math.round(Number(batteryRef.level) * 100)));
    if (pct <= 20) bat.classList.add("low"); else if (pct <= 50) bat.classList.add("medium");
    bat.textContent = `${pct}% • ${batteryRef.charging ? t("sys.charging") : t("sys.notcharging")}`;
  }
  const online = navigator.onLine !== false;
  $("#netStatus").textContent = online ? t("sys.online") : t("sys.offline");
  const maint = maintenanceSettings.enabled;
  $("#serviceStatus").textContent = maint ? t("sys.maint") : t("sys.ready");
  const chip = $("#menuStatus");
  chip.classList.toggle("off", !online);
  chip.classList.toggle("maint", online && maint);
  $("#menuStatusText").textContent = !online ? "OFFLINE" : maint ? "MAINTENANCE" : "ONLINE";
}
function initDeviceStatus() {
  const bat = $("#deviceBatteryStatus");
  bat.textContent = t("sys.checking");
  if (typeof navigator.getBattery !== "function") { bat.dataset.na = "1"; bat.textContent = t("sys.na"); }
  else {
    navigator.getBattery().then(b => {
      batteryRef = b;
      b.addEventListener("levelchange", refreshSystemStatus);
      b.addEventListener("chargingchange", refreshSystemStatus);
      refreshSystemStatus();
    }).catch(() => { bat.dataset.na = "1"; refreshSystemStatus(); });
  }
  window.addEventListener("online", () => { refreshSystemStatus(); showToast(t("online.toast")); });
  window.addEventListener("offline", () => { refreshSystemStatus(); showToast(t("offline.toast")); });
  refreshSystemStatus();
}

// ---------------------------------------------------------------------
// PWA install
// ---------------------------------------------------------------------
let deferredInstall = null;
function initPWA() {
  const btn = $("#installBtn");
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; btn.hidden = false; window.dispatchEvent(new CustomEvent("yd:installready")); });
  window.addEventListener("appinstalled", () => { btn.hidden = true; deferredInstall = null; window.dispatchEvent(new CustomEvent("yd:installed")); });
  btn.addEventListener("click", () => installApp());
}
async function installApp() {
  if (!deferredInstall) return false;
  const d = deferredInstall; deferredInstall = null; $("#installBtn").hidden = true;
  d.prompt();
  const r = await d.userChoice.catch(() => null);
  return !!(r && r.outcome === "accepted");
}

// ---------------------------------------------------------------------
// Notifikasi WhatsApp (5 detik)
// ---------------------------------------------------------------------
function initWaNotice() {
  const notice = $("#waNotice");
  $("#waLink").href = CONFIG.whatsappChannel;
  $("#waLinkAbout").href = CONFIG.whatsappChannel;
  $("#closeNotice").addEventListener("click", () => notice.classList.remove("show"));
  setTimeout(() => notice.classList.add("show"), 800);
  setTimeout(() => notice.classList.remove("show"), 6000);
}

// ---------------------------------------------------------------------
// LOADING SCREEN (progres nyata: font, gambar maskot, pengaturan server)
// ---------------------------------------------------------------------
function runLoading() {
  return new Promise(resolve => {
    const screen = $("#loading");
    const seg = $("#segBar");
    seg.innerHTML = "<i></i>".repeat(20);
    const bars = [...seg.children];
    const tips = t("loading.tips");
    let tipIdx = Math.floor(Math.random() * tips.length);
    $("#loadTip").textContent = tips[tipIdx];
    const tipTimer = setInterval(() => { tipIdx = (tipIdx + 1) % tips.length; $("#loadTip").textContent = tips[tipIdx]; }, 1800);

    const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
    const imgReady = new Promise(r => { const im = new Image(); im.onload = im.onerror = r; im.src = "assets/ryo.webp"; if (im.complete) r(); });
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    let done = 0;
    const task = p => withTimeout(p, 3500).catch(() => {}).then(() => { done++; });
    const all = Promise.all([task(fontsReady), task(imgReady), task(Promise.all([loadPublicSettings(), loadPopularity()]))]);

    const minMs = fancy() ? 1500 : 500;
    const start = performance.now();
    let shown = 0, finished = false;
    const tick = setInterval(() => {
      const el = performance.now() - start;
      const goal = Math.min(done / 3 * 100, el / minMs * 100, 100);
      shown = Math.max(shown, shown + (goal - shown) * 0.25);
      if (el > 5000) shown = 100;
      const pct = Math.min(100, Math.round(shown + (goal >= 100 ? 100 : 0)));
      $("#loadPct").textContent = Math.min(pct, 100);
      const lit = Math.round(Math.min(pct, 100) / 100 * bars.length);
      bars.forEach((b, i) => b.classList.toggle("on", i < lit));
      if (!finished && pct >= 100) {
        finished = true; clearInterval(tick); clearInterval(tipTimer);
        $("#loadPct").textContent = "100";
        bars.forEach(b => b.classList.add("on"));
        setTimeout(() => {
          screen.classList.add("hide");
          setTimeout(() => { screen.remove(); }, 560);
          resolve();
        }, 260);
      }
    }, 50);
    all.catch(() => {});
  });
}

// ---------------------------------------------------------------------
// Refresh data (dipakai Pull to Refresh) & jembatan untuk station-ui.js
// ---------------------------------------------------------------------
async function refreshAll() {
  await Promise.all([loadPublicSettings(), loadPopularity()]);
  refreshSystemStatus();
  renderToolList(); renderFavorites(); renderRecent();
}
window.YD = {
  t, sfx, go, goBack, showToast, changeSetting, refreshAll, installApp,
  settings: () => S, current: () => current, toolId: () => toolId,
  hasInstallPrompt: () => !!deferredInstall,
  maintenance: () => maintenanceSettings, siteName: () => siteSettings.name,
  toolName, openTool: openToolFromCard, navDir, guideActive: () => !!guideRun && !$("#guideRun").hidden
};

// ---------------------------------------------------------------------
// Inisialisasi
// ---------------------------------------------------------------------
function init() {
  if (window.YS) YS.on("favs", () => { renderToolList(); renderFavorites(); syncToolFav(); });
  if (window.YS) YS.on("recents", () => { if (current === "tools") renderRecent(); });
  $("#toolFav").addEventListener("click", () => toggleFav(toolId));
  $("#openFavs").addEventListener("click", () => { sfx("click"); go("favorites"); });
  $$(".ver-text").forEach(el => { el.textContent = VERSION; });
  applySettings();
  applyI18n();
  initMascots();
  applySiteSettingsToUI(siteSettings);
  renderToolList();
  renderGuideList();
  buildPlatformManager();
  initDeviceStatus();
  initPWA();
  trackEvent({ event: "visit" });

  // riwayat awal: selalu mulai dari menu
  try { history.replaceState({ i: 0, s: "menu" }, ""); } catch { /* no-op */ }
  show("menu");

  $("#videoUrl").addEventListener("keydown", e => { if (e.key === "Enter") downloadVideo(); });
  $("#pasteBtn").addEventListener("click", pasteUrl);
  $("#downloadBtn").addEventListener("click", downloadVideo);

  runLoading().then(() => {
    initWaNotice();
    onEnterMenu(null);
    // deep link opsional: #tools / #guide / #setting
    const h = (location.hash || "").replace("#", "");
    if (["tools", "guide", "setting"].includes(h)) go(h, { replace: false });
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
