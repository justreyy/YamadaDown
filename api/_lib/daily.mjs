// Statistik harian (tren 7/30 hari), success rate per tool, dan log error.
//
// PRIVASI: yang disimpan hanya angka per hari dan potongan pesan error yang
// sudah dibersihkan dari link & IP. Link/URL yang dimasukkan pengunjung
// TIDAK PERNAH disimpan.

import { kvPipeline, isKvConfigured } from "./kv.mjs";

export const TOOL_IDS = ["youtube", "tiktok", "instagram", "pinterest"];
const RETAIN_DAYS = 95;
const ERR_KEY = "log:errors";
const ERR_MAX = 100;

// Hari dihitung dalam zona waktu Jakarta (WIB), sama seperti statistik lama.
export function dayStamp(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(Date.now() + offsetDays * 86400000));
}
const dailyKey = stamp => `stats:day:${stamp}`;
export const toolKey = platform => (TOOL_IDS.includes(platform) ? platform : "other");

// fields: ["visits"] / ["req", "req:youtube"] / ...
export async function recordDaily(fields) {
  if (!isKvConfigured() || !fields?.length) return;
  const key = dailyKey(dayStamp());
  await kvPipeline([
    ...fields.map(f => ["HINCRBY", key, f, 1]),
    ["EXPIRE", key, RETAIN_DAYS * 86400]
  ]);
}

function parseHash(flat) {
  const o = {};
  if (Array.isArray(flat)) for (let i = 0; i < flat.length; i += 2) o[flat[i]] = Number(flat[i + 1] || 0);
  return o;
}

// Mengembalikan `days` hari terakhir (terlama -> terbaru), selalu lengkap
// (hari tanpa data bernilai 0) supaya grafik tidak bolong.
export async function getDailySeries(days = 30) {
  const stamps = [];
  for (let i = days - 1; i >= 0; i--) stamps.push(dayStamp(-i));
  const empty = stamp => ({ date: stamp, visits: 0, requests: 0, failed: 0, downloads: 0, tools: {} });
  if (!isKvConfigured()) return stamps.map(empty);

  const res = await kvPipeline(stamps.map(s => ["HGETALL", dailyKey(s)]));
  return stamps.map((stamp, i) => {
    const h = parseHash(res?.[i]?.result);
    const row = { date: stamp, visits: h.visits || 0, requests: h.req || 0, failed: h.fail || 0, downloads: h.dl || 0, tools: {} };
    for (const id of [...TOOL_IDS, "other"]) {
      const r = h[`req:${id}`] || 0, f = h[`fail:${id}`] || 0, d = h[`dl:${id}`] || 0;
      if (r || f || d) row.tools[id] = { requests: r, failed: f, downloads: d };
    }
    return row;
  });
}

// Buang link, IP, dan spasi berlebih dari teks yang akan masuk log.
export function sanitizeLogText(text) {
  return String(text ?? "")
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export async function logError(platform, message) {
  if (!isKvConfigured()) return;
  const entry = JSON.stringify({ ts: Date.now(), tool: toolKey(platform), msg: sanitizeLogText(message) || "Unknown error" });
  await kvPipeline([
    ["LPUSH", ERR_KEY, entry],
    ["LTRIM", ERR_KEY, 0, ERR_MAX - 1],
    ["EXPIRE", ERR_KEY, 30 * 86400]
  ]);
}

export async function getErrorLog(limit = 30) {
  if (!isKvConfigured()) return [];
  const res = await kvPipeline([["LRANGE", ERR_KEY, 0, limit - 1]]);
  const raw = res?.[0]?.result;
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    try {
      const e = JSON.parse(item);
      out.push({ ts: Number(e.ts) || 0, tool: toolKey(e.tool), msg: sanitizeLogText(e.msg) });
    } catch { /* abaikan entri rusak */ }
  }
  return out;
}

export async function clearErrorLog() {
  if (!isKvConfigured()) return false;
  await kvPipeline([["DEL", ERR_KEY]]);
  return true;
}
