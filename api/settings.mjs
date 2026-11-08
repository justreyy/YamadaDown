export const config = { runtime: "edge" };

// Endpoint ini SENGAJA publik (gak pakai token admin), sama seperti
// popular-tools.mjs, karena cuma nampilin status ON/OFF + nama platform dan
// status maintenance yang memang harus dibaca semua pengunjung sebelum
// pakai downloader. Untuk UBAH pengaturan, pakai /api/admin-settings yang
// butuh login Panel Admin.

import { getPlatformSettings, getMaintenanceSettings, getSiteSettings, getAnnouncement } from "./_lib/settings.mjs";

export default async function handler(request) {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const [platforms, maintenance, site, ann] = await Promise.all([
    getPlatformSettings(),
    getMaintenanceSettings(),
    getSiteSettings(),
    getAnnouncement()
  ]);
  // Pengumuman hanya dikirim ke publik saat aktif dan ada teksnya.
  const announcement = ann.enabled ? { text: ann.text, level: ann.level, id: ann.id } : null;

  // `site` (nama, deskripsi, logo, link CS) memang info publik. Sebelumnya
  // tidak ikut dikirim, sehingga Website Setting hanya terlihat oleh admin.
  return Response.json(
    { platforms, maintenance, site, announcement },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
