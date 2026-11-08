// Pengaturan Panel Admin: Downloader Manager (ON/OFF + nama platform per
// platform) dan Maintenance Mode. Disimpan di Vercel KV supaya persisten
// tanpa perlu database terpisah, konsisten dengan cara statistik disimpan
// di admin-stats.mjs / track.mjs.

import { kvHGetAll, kvHSet, kvGetJSON, kvSetJSON, isKvConfigured } from "./kv.mjs";

// Default: semua platform ON dengan nama bawaan. Dipakai kalau KV belum
// disetup ATAU platform belum pernah diatur sama sekali dari Panel Admin.
export const DEFAULT_PLATFORMS = {
  tiktok: { enabled: true, name: "TikTok" },
  instagram: { enabled: true, name: "Instagram" },
  youtube: { enabled: true, name: "YouTube" },
  pinterest: { enabled: true, name: "Pinterest" }
};

export const DEFAULT_MAINTENANCE = {
  enabled: false,
  message: "Website sedang dalam perbaikan. Silakan coba lagi beberapa saat lagi."
};

// Website Setting: identitas website yang bisa diubah dari Panel Admin
// (nama situs, deskripsi/tagline, logo, dan link Customer Service).
export const DEFAULT_SITE = {
  name: "YAMADA DOWN",
  description: "YAMADA DOWN - Your Personal Media Tools. Download video dari YouTube, TikTok, Instagram, dan Pinterest.",
  logoUrl: "LOGO.jpg",
  csLink: "https://wa.me/6283869485575"
};

// Pengumuman global (banner di menu utama). Teks polos, tanpa HTML.
export const DEFAULT_ANNOUNCEMENT = { enabled: false, text: "", level: "info", id: 0 };
const ANNOUNCEMENT_LEVELS = ["info", "warn", "good"];
const ANNOUNCEMENT_KEY = "settings:announcement";

const PLATFORMS_KEY = "settings:platforms";
const MAINTENANCE_KEY = "settings:maintenance";
const SITE_KEY = "settings:site";

function sanitizeName(name, fallback) {
  const clean = String(name ?? "").trim().slice(0, 40);
  return clean || fallback;
}

function sanitizeMessage(message) {
  const clean = String(message ?? "").trim().slice(0, 500);
  return clean || DEFAULT_MAINTENANCE.message;
}

// Field pendek dengan panjang custom, dipakai untuk Website Setting
// (nama, deskripsi, url logo, link CS) — beda field beda batas panjang.
function sanitizeSiteField(value, fallback, maxLength) {
  const clean = String(value ?? "").trim().slice(0, maxLength);
  return clean || fallback;
}

export async function getPlatformSettings() {
  if (!isKvConfigured()) return structuredClone(DEFAULT_PLATFORMS);

  const raw = await kvHGetAll(PLATFORMS_KEY);
  const merged = {};

  for (const id of Object.keys(DEFAULT_PLATFORMS)) {
    let parsed = null;
    try {
      parsed = raw[id] ? JSON.parse(raw[id]) : null;
    } catch {
      parsed = null;
    }

    merged[id] = {
      enabled: typeof parsed?.enabled === "boolean" ? parsed.enabled : DEFAULT_PLATFORMS[id].enabled,
      name: sanitizeName(parsed?.name, DEFAULT_PLATFORMS[id].name)
    };
  }

  return merged;
}

export async function savePlatformSettings(updates) {
  if (!isKvConfigured()) return false;

  const current = await getPlatformSettings();
  const jobs = [];

  for (const id of Object.keys(DEFAULT_PLATFORMS)) {
    if (!updates[id]) continue;

    const next = {
      enabled: typeof updates[id].enabled === "boolean" ? updates[id].enabled : current[id].enabled,
      name:
        updates[id].name !== undefined
          ? sanitizeName(updates[id].name, DEFAULT_PLATFORMS[id].name)
          : current[id].name
    };

    jobs.push(kvHSet(PLATFORMS_KEY, id, JSON.stringify(next)));
  }

  await Promise.all(jobs);
  return true;
}

export async function isPlatformEnabled(id) {
  if (!DEFAULT_PLATFORMS[id]) return true; // platform tidak dikenal -> jangan diblokir di sini
  const settings = await getPlatformSettings();
  return settings[id]?.enabled !== false;
}

export async function getMaintenanceSettings() {
  const saved = await kvGetJSON(MAINTENANCE_KEY, null);
  if (!saved || typeof saved !== "object") return structuredClone(DEFAULT_MAINTENANCE);

  return {
    enabled: Boolean(saved.enabled),
    message: sanitizeMessage(saved.message)
  };
}

export async function saveMaintenanceSettings(update) {
  if (!isKvConfigured()) return false;

  const current = await getMaintenanceSettings();
  const next = {
    enabled: typeof update.enabled === "boolean" ? update.enabled : current.enabled,
    message: update.message !== undefined ? sanitizeMessage(update.message) : current.message
  };

  await kvSetJSON(MAINTENANCE_KEY, next);
  return true;
}

export async function getSiteSettings() {
  const saved = await kvGetJSON(SITE_KEY, null);
  if (!saved || typeof saved !== "object") return structuredClone(DEFAULT_SITE);

  return {
    name: sanitizeSiteField(saved.name, DEFAULT_SITE.name, 60),
    description: sanitizeSiteField(saved.description, DEFAULT_SITE.description, 160),
    logoUrl: sanitizeSiteField(saved.logoUrl, DEFAULT_SITE.logoUrl, 300),
    csLink: sanitizeSiteField(saved.csLink, DEFAULT_SITE.csLink, 300)
  };
}

export async function saveSiteSettings(update) {
  if (!isKvConfigured()) return false;

  const current = await getSiteSettings();
  const next = {
    name: update.name !== undefined ? sanitizeSiteField(update.name, DEFAULT_SITE.name, 60) : current.name,
    description:
      update.description !== undefined
        ? sanitizeSiteField(update.description, DEFAULT_SITE.description, 160)
        : current.description,
    logoUrl:
      update.logoUrl !== undefined ? sanitizeSiteField(update.logoUrl, DEFAULT_SITE.logoUrl, 300) : current.logoUrl,
    csLink: update.csLink !== undefined ? sanitizeSiteField(update.csLink, DEFAULT_SITE.csLink, 300) : current.csLink
  };

  await kvSetJSON(SITE_KEY, next);
  return true;
}

function cleanAnnouncement(saved) {
  const text = String(saved?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  return {
    enabled: Boolean(saved?.enabled) && text.length > 0,
    text,
    level: ANNOUNCEMENT_LEVELS.includes(saved?.level) ? saved.level : "info",
    id: Number(saved?.id) || 0
  };
}

export async function getAnnouncement() {
  const saved = await kvGetJSON(ANNOUNCEMENT_KEY, null);
  if (!saved || typeof saved !== "object") return structuredClone(DEFAULT_ANNOUNCEMENT);
  return cleanAnnouncement(saved);
}

// `id` selalu diperbarui saat disimpan, sehingga pengunjung yang pernah
// menutup banner akan melihat pengumuman yang baru diedit.
export async function saveAnnouncement(update) {
  if (!isKvConfigured()) return false;
  const current = await getAnnouncement();
  const next = cleanAnnouncement({
    enabled: typeof update.enabled === "boolean" ? update.enabled : current.enabled,
    text: update.text !== undefined ? update.text : current.text,
    level: update.level !== undefined ? update.level : current.level,
    id: Date.now()
  });
  await kvSetJSON(ANNOUNCEMENT_KEY, next);
  return true;
}
