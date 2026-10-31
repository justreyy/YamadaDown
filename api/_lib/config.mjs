// Status konfigurasi server untuk ditampilkan di Panel Admin.
// HANYA boolean/label, tidak pernah mengembalikan nilai env yang sebenarnya.

import { isKvConfigured } from "./kv.mjs";

export function getConfigStatus() {
  return {
    kv: isKvConfigured(),
    adminKey: Boolean(process.env.ADMIN_PANEL_KEY),
    sessionSecret: Boolean(process.env.ADMIN_SESSION_SECRET),
    downloaderApi: process.env.DOWNLOADER_API_URL ? "custom" : "default",
    pinterestApi: process.env.PINTEREST_API_URL ? "custom" : "default"
  };
}
