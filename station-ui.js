/* =====================================================================
   YAMADA STATION — antarmuka tambahan (dimuat SETELAH app.js).
   A) Universal (semua perangkat): install guide, offline bar, copy,
      swipe, pull-to-refresh, fullscreen, label aksesibilitas.
   B) Khusus iPhone: bottom nav, Dynamic Island, Quick Control, Share.
      Elemen iPhone DIBUAT lewat JS hanya jika YS.device.isIPhone, jadi
      tidak pernah ada di DOM perangkat lain.
   ===================================================================== */
(() => {
"use strict";
if (!window.YS || !window.YD) return;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const D = YS.device;
const t = (k, v) => YD.t(k, v);
const root = document.documentElement;
const reduced = () => { const S = YD.settings(); return !S.anim || S.reduced; };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* no-op */ } };
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const ico = id => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;

// =====================================================================
// A) UNIVERSAL
// =====================================================================

// ---- aria-label dari data-i18n-aria
function applyAria() { $$("[data-i18n-aria]").forEach(n => n.setAttribute("aria-label", t(n.dataset.i18nAria))); }
window.addEventListener("yd:lang", applyAria);
applyAria();

// ---- Haptic ringan untuk tombol (hanya iPhone; YS.haptic menjaga sendiri)
document.addEventListener("click", e => {
  if (e.target.closest(".btn,.icon-btn,.tab,.seg button,.tool-card,.recent-item,.guide-card,.download-option,.copy-btn,.switch,.ios-nav button,.mi")) YS.haptic("light");
}, { passive: true });

// ---- Offline indicator
const offBar = $("#offlineBar");
function syncOnline() {
  const off = navigator.onLine === false;
  root.classList.toggle("is-offline", off);
  offBar.hidden = !off;
}
window.addEventListener("online", () => { syncOnline(); });
window.addEventListener("offline", () => { syncOnline(); YS.haptic("warning"); });
syncOnline();

// ---- Copy (delegasi untuk semua tombol [data-copy])
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-copy]"); if (!b) return;
  const ok = await YS.copy(b.dataset.copy);
  YD.showToast(t(ok ? "ys.copied" : "ys.copyFail"));
  YD.sfx(ok ? "success" : "error");
  if (ok) { b.classList.add("copied"); setTimeout(() => b.classList.remove("copied"), 1200); }
});

// ---- Install App
const installDlg = $("#installDialog");
function installSteps() {
  if (D.isIPhone) return { label: "iPhone • Safari", key: "ys.installIos" };
  if (D.isIPad) return { label: "iPad • Safari", key: "ys.installIpad" };
  if (D.isAndroid) return { label: D.isTablet ? "Android Tablet • Chrome" : "Android • Chrome", key: "ys.installAndroid" };
  return { label: "Desktop • Chrome / Edge", key: "ys.installDesktop" };
}
function openInstall(open) {
  if (open && D.standalone) { YD.showToast(t("ys.installAlready")); return; }
  if (open) {
    const info = installSteps();
    $("#installDevice").textContent = info.label;
    $("#installSteps").innerHTML = t(info.key).split("|").map(x => `<li>${x.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</li>`).join("");
    $("#installGo").hidden = !YD.hasInstallPrompt();
  }
  installDlg.hidden = !open;
  if (open) $("#installClose").focus();
}
$("#installOpen").addEventListener("click", () => { YD.sfx("click"); openInstall(true); });
$("#installClose").addEventListener("click", () => openInstall(false));
installDlg.addEventListener("click", e => { if (e.target === installDlg) openInstall(false); });
$("#installGo").addEventListener("click", async () => {
  const ok = await YD.installApp();
  openInstall(false);
  if (ok) YD.showToast(t("ys.installDone"));
});
function syncInstallRow() {
  const b = $("#installOpen"), hint = $("#installHint");
  if (D.standalone) { b.disabled = true; hint.textContent = t("ys.installed"); }
  else { b.disabled = false; hint.textContent = t("ys.installHint"); }
}
window.addEventListener("yd:lang", syncInstallRow);
window.addEventListener("yd:installready", syncInstallRow);
window.addEventListener("yd:installed", () => { D.standalone = true; syncInstallRow(); YD.showToast(t("ys.installDone")); });
YS.on("standalone", syncInstallRow);
syncInstallRow();

// ---- Fullscreen
(() => {
  const de = document.documentElement;
  const can = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const sw = $("#fsToggle"), hint = $("#fsHint");
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (!can) { sw.disabled = true; hint.textContent = t("ys.fullscreenNA"); window.addEventListener("yd:lang", () => { hint.textContent = t("ys.fullscreenNA"); }); return; }
  sw.addEventListener("change", async () => {
    try {
      if (sw.checked) await (de.requestFullscreen ? de.requestFullscreen() : de.webkitRequestFullscreen());
      else if (isFs()) await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
    } catch { sw.checked = isFs(); }
  });
  const sync = () => { sw.checked = isFs(); };
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
})();

// ---- Swipe navigation + Pull to refresh (satu pengendali sentuhan)
const ptr = $("#ptr"), ptrText = $("#ptrText");
const NAV = ["menu", "tools", "guide", "setting"];
let g = null, refreshing = false;
function blocked() {
  return !!$("#loading") || !$("#secretDialog").hidden || !$("#resetDialog").hidden || !installDlg.hidden || !$("#maintenanceOverlay").hidden || !!$("#ctlSheet.open");
}
const NOSWIPE = "input,textarea,select,video,audio,.seg,.segbar,.tabs,[data-noswipe],.modal,#island,#ctlSheet";
document.addEventListener("touchstart", e => {
  if (e.touches.length !== 1 || refreshing || blocked()) { g = null; return; }
  const tt = e.touches[0], target = e.target;
  const scr = target.closest && target.closest(".screen");
  if (!scr || scr.hidden) { g = null; return; }
  g = { x: tt.clientX, y: tt.clientY, t: performance.now(), scr, noswipe: !!target.closest(NOSWIPE),
        top: scr.scrollTop <= 0, mode: null, dy: 0 };
}, { passive: true });
document.addEventListener("touchmove", e => {
  if (!g || e.touches.length !== 1) return;
  const tt = e.touches[0], dx = tt.clientX - g.x, dy = tt.clientY - g.y;
  if (!g.mode) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    if (Math.abs(dy) > Math.abs(dx) * 1.2) {
      const cur = YD.current();
      g.mode = (dy > 0 && g.top && g.scr.scrollTop <= 0 && !g.noswipe && cur !== "admin" && !YD.guideActive()) ? "ptr" : "scroll";
    } else g.mode = "swipe";
  }
  if (g.mode === "ptr") {
    if (dy <= 0) { g.mode = "scroll"; ptr.classList.remove("pull"); ptr.style.transform = ""; return; }
    if (e.cancelable) e.preventDefault();
    g.dy = Math.min(dy * 0.5, 96);
    ptr.classList.add("pull");
    ptr.style.transform = `translate(-50%, ${g.dy - 54}px)`;
    ptr.style.setProperty("--p", Math.min(g.dy / 64, 1));
    const ready = g.dy >= 64;
    ptr.classList.toggle("ready", ready);
    ptrText.textContent = t(ready ? "ys.release" : "ys.pull");
  }
}, { passive: false });
function endPull(ok) {
  ptr.classList.remove("ready"); ptr.style.transform = ""; ptr.classList.remove("pull");
  if (ok) { ptr.classList.add("spin"); } else ptr.classList.remove("spin");
}
document.addEventListener("touchend", async e => {
  const st = g; g = null;
  if (!st) return;
  const tt = e.changedTouches[0];
  const dx = tt.clientX - st.x, dy = tt.clientY - st.y, dt = performance.now() - st.t;
  if (st.mode === "ptr") {
    if (st.dy >= 64 && !refreshing) {
      refreshing = true; ptr.classList.add("spin", "pull"); ptr.style.transform = "translate(-50%, 14px)"; ptrText.textContent = t("ys.refreshing");
      YS.haptic("medium");
      const t0 = performance.now();
      if (navigator.onLine !== false) await YD.refreshAll().catch(() => {});
      const wait = Math.max(0, 700 - (performance.now() - t0));
      await new Promise(r => setTimeout(r, wait));
      refreshing = false; endPull(false);
      if (navigator.onLine === false) { YD.showToast(t("ys.offlineBlock")); YS.haptic("warning"); }
      else { YD.showToast(t("ys.refreshed")); YS.haptic("success"); }
    } else endPull(false);
    return;
  }
  if (st.mode !== "swipe" || st.noswipe || blocked()) return;
  if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.8 || dt > 700) return;
  if (st.x < 24 || st.x > innerWidth - 24) return; // jangan bentrok dengan gestur tepi iOS/Android
  const cur = YD.current();
  if (cur === "admin" || YD.guideActive()) return;
  const swipeLeft = dx < 0;
  if (cur === "tool" || cur === "favorites") { if (!swipeLeft) { YD.sfx("back"); YD.goBack(); YS.haptic("select"); } return; }
  const i = NAV.indexOf(cur); if (i < 0) return;
  const j = i + (swipeLeft ? 1 : -1);
  if (j < 0 || j >= NAV.length) return;
  YD.sfx("click"); YS.haptic("select");
  YD.go(NAV[j], { replace: true, dir: swipeLeft ? "fwd" : "back" });
}, { passive: true });
document.addEventListener("touchcancel", () => { if (g && g.mode === "ptr") endPull(false); g = null; }, { passive: true });

// ---- Escape menutup dialog install
document.addEventListener("keydown", e => { if (e.key === "Escape" && !installDlg.hidden) openInstall(false); });

// =====================================================================
// B) KHUSUS iPHONE
// =====================================================================
if (D.isIPhone) initIOS();

function initIOS() {
  // ---------- Bottom navigation ----------
  const nav = el("nav", "ios-nav");
  nav.id = "iosNav"; nav.setAttribute("aria-label", "Navigasi");
  const items = [["menu", "home", "nav.home"], ["tools", "grid", "nav.tools"], ["guide", "book", "nav.guide"], ["setting", "sliders", "nav.setting"]];
  nav.innerHTML = `<span class="ios-ind" aria-hidden="true"></span>` + items.map(([id, ic, key]) =>
    `<button type="button" data-ios="${id}">${ico(ic)}<span data-i18n="${key}">${t(key)}</span></button>`).join("");
  document.body.appendChild(nav);
  const ind = $(".ios-ind", nav);
  nav.addEventListener("click", e => {
    const b = e.target.closest("[data-ios]"); if (!b) return;
    const to = b.dataset.ios, cur = YD.current();
    const base = (cur === "tool" || cur === "favorites") ? "tools" : cur;
    if (to === base && cur !== "tool" && cur !== "favorites") { YS.haptic("light"); return; }
    YD.sfx("click"); YS.haptic("select");
    YD.go(to, { replace: true, dir: YD.navDir(to) });
  });
  function syncNav(name) {
    const base = (name === "tool" || name === "favorites") ? "tools" : name;
    nav.hidden = name === "admin";
    const idx = items.findIndex(x => x[0] === base);
    $$("button", nav).forEach((b, i) => { b.classList.toggle("active", i === idx); b.setAttribute("aria-current", i === idx ? "page" : "false"); });
    if (idx >= 0) { ind.style.opacity = "1"; ind.style.transform = `translateX(${idx * 100}%)`; } else ind.style.opacity = "0";
  }
  root.classList.add("has-ios-nav");

  // ---------- Dynamic Island ----------
  const isl = el("div", "island");
  isl.id = "island"; isl.setAttribute("role", "button"); isl.setAttribute("aria-expanded", "false"); isl.tabIndex = 0;
  isl.innerHTML = `
    <div class="isl-bar">
      <span class="isl-dot"></span>
      <span class="isl-txt" id="islTxt">ONLINE</span>
      <span class="isl-spin" aria-hidden="true"></span>
    </div>
    <div class="isl-body">
      <div class="isl-grid">
        <div class="isl-cell"><span class="k">${ico("pulse")} <span data-k="ys.api">API</span></span><b id="islApi">—</b><small id="islApiMs"></small></div>
        <div class="isl-cell"><span class="k">${ico("server")} <span data-k="ys.server">SERVER</span></span><b id="islSrv">—</b><small id="islSite"></small></div>
      </div>
      <div class="isl-sec"><span class="k">${ico("bell")} <span data-k="ys.notif">NOTIF</span></span><ul id="islNotes" class="isl-notes"></ul></div>
      <div class="isl-sec"><span class="k">${ico("download")} <span data-k="ys.activity">AKTIVITAS</span></span><p id="islAct" class="isl-act"></p></div>
      <div class="isl-actions">
        <button type="button" id="islCtl">${ico("sliders")}<span data-k="ys.control">KONTROL</span></button>
        <button type="button" id="islShare">${ico("share")}<span data-k="ys.share">BAGIKAN</span></button>
      </div>
    </div>`;
  document.body.appendChild(isl);
  root.classList.add("has-island");

  const state = { open: false, api: "checking", ms: null, srv: "checking", notes: [], act: null, actTimer: 0, flashTimer: 0 };
  const labelFor = s => ({ operational: t("ys.operational"), maintenance: "MAINTENANCE", degraded: t("ys.degraded"), down: t("ys.down"), checking: t("ys.checking") }[s] || s);
  function render() {
    const off = navigator.onLine === false;
    const overall = off ? "down" : state.srv === "down" ? "down" : (state.api === "operational" && state.srv === "operational") ? "operational" : state.srv === "checking" ? "checking" : "degraded";
    isl.dataset.state = overall;
    const busy = state.act && state.act.state === "start";
    isl.classList.toggle("busy", !!busy);
    let txt = off ? "OFFLINE" : labelFor(overall).toUpperCase();
    if (state.act) txt = t(state.act.state === "start" ? "ys.working" : state.act.state === "ok" ? "ys.workDone" : "ys.workFail", { name: state.act.name || "" });
    if (state.flash) txt = state.flash;
    $("#islTxt").textContent = txt;
    $("#islApi").textContent = off ? t("ys.down") : labelFor(state.api);
    $("#islApi").dataset.s = off ? "down" : state.api;
    $("#islApiMs").textContent = state.ms != null && !off ? t("ys.ms", { n: state.ms }) : "";
    $("#islSrv").textContent = off ? "OFFLINE" : labelFor(state.srv);
    $("#islSrv").dataset.s = off ? "down" : state.srv;
    $("#islSite").textContent = YD.siteName();
    const ul = $("#islNotes"); ul.textContent = "";
    if (!state.notes.length) { const li = el("li", "none"); li.textContent = t("ys.noNotif"); ul.appendChild(li); }
    state.notes.slice(0, 3).forEach(n => { const li = el("li"); li.textContent = n.m; ul.appendChild(li); });
    const a = $("#islAct");
    a.textContent = state.act ? t(state.act.state === "start" ? "ys.working" : state.act.state === "ok" ? "ys.workDone" : "ys.workFail", { name: state.act.name || "" }) : t("ys.idle");
    $$("[data-k]", isl).forEach(n => { n.textContent = t(n.dataset.k); });
  }
  async function ping() {
    if (navigator.onLine === false) { state.api = "down"; state.srv = "down"; state.ms = null; render(); return; }
    const t0 = performance.now();
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      state.ms = Math.round(performance.now() - t0);
      if (!r.ok) { state.srv = "degraded"; state.api = "degraded"; }
      else {
        const d = await r.json().catch(() => ({}));
        state.srv = "operational";
        state.api = d.status === "maintenance" ? "maintenance" : d.status === "degraded" ? "degraded" : "operational";
      }
    } catch { state.srv = "down"; state.api = "down"; state.ms = null; }
    render();
  }
  function setOpen(v) {
    state.open = v;
    isl.classList.toggle("open", v);
    isl.setAttribute("aria-expanded", String(v));
    if (v) { ping(); YS.haptic("medium"); }
    clearTimeout(state.autoClose);
    if (v) state.autoClose = setTimeout(() => setOpen(false), 12000);
  }
  isl.addEventListener("click", e => {
    if (e.target.closest("#islCtl")) { setOpen(false); openSheet(true); return; }
    if (e.target.closest("#islShare")) { shareSite(); return; }
    setOpen(!state.open); YD.sfx("click");
  });
  isl.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!state.open); } });
  document.addEventListener("click", e => { if (state.open && !e.target.closest("#island,[data-haptic]")) setOpen(false); }, true);
  // tekan lama = buka Quick Control
  let lp = 0;
  isl.addEventListener("touchstart", () => { lp = setTimeout(() => { lp = 0; setOpen(false); openSheet(true); YS.haptic("medium"); }, 520); }, { passive: true });
  ["touchend", "touchmove", "touchcancel"].forEach(ev => isl.addEventListener(ev, () => { if (lp) { clearTimeout(lp); lp = 0; } }, { passive: true }));

  function flash(msg, ms = 2600) {
    state.flash = msg; render();
    isl.classList.add("note");
    clearTimeout(state.flashTimer);
    state.flashTimer = setTimeout(() => { state.flash = null; isl.classList.remove("note"); render(); }, ms);
  }
  window.addEventListener("yd:toast", e => {
    const m = e.detail && e.detail.message; if (!m) return;
    state.notes.unshift({ m, ts: Date.now() }); state.notes = state.notes.slice(0, 5);
    flash(m);
  });
  window.addEventListener("yd:activity", e => {
    const d = e.detail || {};
    clearTimeout(state.actTimer);
    state.act = { state: d.state, name: d.name || d.tool };
    render();
    if (d.state !== "start") state.actTimer = setTimeout(() => { state.act = null; render(); }, 3000);
  });
  window.addEventListener("online", () => { ping(); });
  window.addEventListener("offline", () => { render(); });
  window.addEventListener("yd:lang", render);
  setInterval(() => { if (!document.hidden) ping(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) ping(); });
  ping();

  // petunjuk Add to Home Screen sekali saja (jika belum standalone)
  if (!D.standalone && !lsGet("ys_a2hs_hint")) {
    setTimeout(() => { if (!$("#loading")) { lsSet("ys_a2hs_hint", "1"); flash(t("ys.hintA2HS"), 4200); } }, 7000);
  }

  // ---------- Native Share ----------
  async function shareSite() {
    const data = { title: YD.siteName(), text: t("ys.shareText"), url: location.origin + "/" };
    YS.haptic("light");
    if (navigator.share) {
      try { await navigator.share(data); return; }
      catch (err) { if (err && err.name === "AbortError") return; }
    }
    const ok = await YS.copy(data.url);
    YD.showToast(t(ok ? "ys.shareCopied" : "ys.copyFail"));
  }

  // ---------- Quick Control Panel ----------
  const sheet = el("div", "ctl-sheet");
  sheet.id = "ctlSheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.hidden = true;
  sheet.innerHTML = `
    <div class="ctl-back"></div>
    <div class="ctl-panel">
      <div class="ctl-grab" aria-hidden="true"><i></i></div>
      <h3 class="ctl-title">${t("ys.control")}</h3>
      <div class="ctl-grid">
        <button type="button" class="ctl-tile" data-ctl="dark"><span class="ci">${ico("moon")}</span><b data-k="ys.darkMode"></b><small data-st></small></button>
        <button type="button" class="ctl-tile" data-ctl="sound"><span class="ci">${ico("vol")}</span><b data-k="ys.sound"></b><small data-st></small></button>
        <button type="button" class="ctl-tile" data-ctl="anim"><span class="ci">${ico("sparkles")}</span><b data-k="ys.anim"></b><small data-st></small></button>
        <button type="button" class="ctl-tile" data-ctl="haptic"><span class="ci">${ico("vibrate")}</span><b data-k="ys.haptic"></b><small data-st></small></button>
        <button type="button" class="ctl-tile" data-ctl="glass"><span class="ci">${ico("sparkles")}</span><b data-k="ys.glass"></b><small data-st></small></button>
        <button type="button" class="ctl-tile" data-ctl="share"><span class="ci">${ico("share")}</span><b data-k="ys.share"></b><small>Share</small></button>
      </div>
      <div class="ctl-theme" role="group" aria-label="Theme">
        <button type="button" data-theme="auto" data-k="ys.auto"></button>
        <button type="button" data-theme="light" data-k="ys.light"></button>
        <button type="button" data-theme="dark" data-k="ys.dark"></button>
      </div>
      <p class="ctl-hint" data-k="ys.hapticHint"></p>
      <button type="button" class="btn btn-ghost btn-sm ctl-close" data-k="ys.close"></button>
    </div>`;
  document.body.appendChild(sheet);
  function syncSheet() {
    const S = YD.settings(), dark = YS.resolveTheme(S.theme) === "dark";
    const on = { dark, sound: S.sound, anim: S.anim && !S.reduced, haptic: S.haptic, glass: S.glass };
    $$("[data-ctl]", sheet).forEach(b => {
      const k = b.dataset.ctl; if (k === "share") return;
      b.classList.toggle("on", !!on[k]); b.setAttribute("aria-pressed", String(!!on[k]));
      $("[data-st]", b).textContent = on[k] ? "ON" : "OFF";
    });
    $$("[data-theme]", sheet).forEach(b => b.classList.toggle("on", b.dataset.theme === S.theme));
    $$("[data-k]", sheet).forEach(n => { n.textContent = t(n.dataset.k); });
    $(".ctl-title", sheet).textContent = t("ys.control");
    const dm = $('[data-ctl="dark"] .ci use', sheet); if (dm) dm.setAttribute("href", dark ? "#i-moon" : "#i-sun");
  }
  function openSheet(v) {
    if (v) { sheet.hidden = false; syncSheet(); void sheet.offsetWidth; sheet.classList.add("open"); }
    else { sheet.classList.remove("open"); setTimeout(() => { if (!sheet.classList.contains("open")) sheet.hidden = true; }, reduced() ? 0 : 320); const p = $(".ctl-panel", sheet); p.style.transform = ""; }
  }
  sheet.addEventListener("click", e => {
    if (e.target.closest(".ctl-back") || e.target.closest(".ctl-close")) { YD.sfx("back"); openSheet(false); return; }
    const th = e.target.closest(".ctl-theme [data-theme]");
    if (th) { YD.changeSetting("theme", th.dataset.theme); YD.sfx("toggle"); YS.haptic("select"); return; }
    const b = e.target.closest("[data-ctl]"); if (!b) return;
    const S = YD.settings(), k = b.dataset.ctl;
    if (k === "share") { shareSite(); return; }
    YS.haptic("select");
    if (k === "dark") YD.changeSetting("theme", YS.resolveTheme(S.theme) === "dark" ? "light" : "dark");
    else if (k === "anim") { if (S.reduced) { YD.changeSetting("reduced", false); if (!S.anim) YD.changeSetting("anim", true); } else YD.changeSetting("anim", !S.anim); }
    else YD.changeSetting(k, !S[k]);
    if (k !== "sound") YD.sfx("toggle");
  });
  // seret panel ke bawah untuk menutup
  (() => {
    const p = $(".ctl-panel", sheet); let y0 = null, dy = 0;
    p.addEventListener("touchstart", e => { if (e.target.closest(".ctl-grab, .ctl-title")) { y0 = e.touches[0].clientY; dy = 0; p.style.transition = "none"; } }, { passive: true });
    p.addEventListener("touchmove", e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); p.style.transform = `translateY(${dy}px)`; }, { passive: true });
    const end = () => { if (y0 == null) return; p.style.transition = ""; const close = dy > 90; y0 = null; if (close) openSheet(false); else p.style.transform = ""; };
    p.addEventListener("touchend", end, { passive: true }); p.addEventListener("touchcancel", end, { passive: true });
  })();
  document.addEventListener("keydown", e => { if (e.key === "Escape" && sheet.classList.contains("open")) openSheet(false); });
  window.addEventListener("yd:settings", () => { if (!sheet.hidden) syncSheet(); });
  window.addEventListener("yd:lang", () => { syncSheet(); render(); $$("[data-i18n]", nav).forEach(n => { n.textContent = t(n.dataset.i18n); }); });
  YS.on("theme", () => { if (!sheet.hidden) syncSheet(); });

  window.addEventListener("yd:screen", e => syncNav(e.detail.name));
  syncNav(YD.current());
  render();
}
})();
