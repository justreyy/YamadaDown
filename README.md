# YAMADA DOWN

Redesign total YamadaDownloader menjadi aplikasi bergaya game anime (maskot Ryo Yamada). Backend, API downloader, statistik, Website Setting, Downloader Manager, dan Maintenance Mode tetap sama.

## Struktur
- `index.html`, `style.css`, `app.js`, `content.js` (teks ID/EN + isi tutorial)
- `assets/` maskot (hasil potong dari LOGO.jpg) dan ikon PWA
- `api/` endpoint Vercel (edge), `sw.js` + `manifest.webmanifest` (PWA), `vercel.json`

## Environment Variables (Vercel > Settings > Environment Variables)
| Nama | Wajib | Keterangan |
|---|---|---|
| `ADMIN_PANEL_KEY` | Ya | Key login admin. **Tidak ada key bawaan**; kalau kosong login admin ditolak. Pilih yang panjang dan acak. |
| `ADMIN_SESSION_SECRET` | Disarankan | Rahasia penanda-tangan token admin (beda dari key). Ganti untuk memutus semua sesi. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Ya untuk statistik/pengaturan | Dari Vercel Storage (KV / Upstash Redis). Tanpa ini, Panel Admin menampilkan peringatan dan pengaturan tidak bisa disimpan. |
| `DOWNLOADER_API_URL`, `PINTEREST_API_URL` | Opsional | Bawaan: Nexray. |
| `REMOVE_BG_API_KEY` | Opsional | Hanya untuk `/api/removebg` (tidak lagi ditampilkan di menu). |

## Akses admin
Di main menu, ketuk Ryo 7 kali (jeda antar ketukan maksimal 2 detik) lalu tekan ACCESS ADMIN. Ketukan hanya menyembunyikan jalan masuk; keamanan ada di server (token HMAC 12 jam, pembatas percobaan salah per IP bila KV aktif).

## Edit cepat
- Link WhatsApp/CS: `CONFIG` di `app.js` (CS juga bisa diubah dari Panel Admin > SITE)
- Teks & tutorial: `content.js`
- Warna: variabel di atas `style.css`

## Fitur Station (v7)

**Semua perangkat:** Install App (panduan sesuai perangkat), mode offline (GUIDE + halaman utama + indikator OFFLINE), Recently Used (5 tools terakhir, bisa dihapus), Favorites (halaman khusus, localStorage), swipe antar menu, pull-to-refresh, tema AUTO/TERANG/GELAP, tombol Copy di hasil tools, mode layar penuh (jika browser mendukung), safe area (notch/home indicator).

**Khusus iPhone** (elemen dibuat lewat JS hanya jika perangkat terdeteksi iPhone): bottom navigation, Dynamic Island (status API/server, notifikasi, aktivitas tools; tekan lama = Quick Control), Quick Control Panel, Native Share (fallback salin link), Haptic Feedback.

**Catatan teknis**
- Deteksi perangkat: `station-core.js` (userAgentData, UA, maxTouchPoints + ukuran layar; iPad yang menyamar sebagai Mac tetap terdeteksi iPad).
- Endpoint baru `/api/health` (publik, ringan, tanpa data konfigurasi).
- Riwayat hanya menyimpan id tool + waktu (tanpa URL). `/api/*` tidak pernah di-cache oleh service worker.
- Haptic di iPhone memakai trik `<input switch>` (iOS 17.4+). Di iOS lebih lama tidak ada getaran, tanpa error.
