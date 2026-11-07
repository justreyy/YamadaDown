export const config = { runtime: "edge" };

// Endpoint publik & ringan untuk indikator status (Dynamic Island, dll).
// Tidak membocorkan konfigurasi: hanya status umum dan waktu server.

import { getMaintenanceSettings } from "./_lib/settings.mjs";

export default async function handler(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json", Allow: "GET, HEAD" } });
  }
  let maintenance = false;
  try { maintenance = Boolean((await getMaintenanceSettings()).enabled); } catch { /* KV belum diatur: anggap normal */ }
  return new Response(JSON.stringify({ status: maintenance ? "maintenance" : "operational", maintenance, time: Date.now() }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
