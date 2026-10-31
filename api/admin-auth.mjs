export const config = { runtime: "edge" };

import { createAdminToken, getSecret } from "./_lib/adminAuth.mjs";
import { isKvConfigured, kvGet, kvIncr, kvExpire, kvDel } from "./_lib/kv.mjs";

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_SECONDS = 15 * 60;

// Perbandingan waktu-konstan: kedua sisi di-hash dulu supaya panjangnya sama,
// lalu dibandingkan tanpa berhenti di karakter pertama yang berbeda.
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b))
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function clientId(request) {
  const fwd = request.headers.get("x-forwarded-for") || "";
  return (fwd.split(",")[0] || request.headers.get("x-real-ip") || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9:.\-]/g, "")
    .slice(0, 64);
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Tidak ada key bawaan. Kalau env belum diisi, login ditutup total dan
  // pesannya jelas, bukan diam-diam memakai password default.
  const correctKey = process.env.ADMIN_PANEL_KEY || "";
  if (!correctKey || !getSecret()) {
    return Response.json(
      {
        error:
          "Login admin belum dikonfigurasi. Isi ADMIN_PANEL_KEY (dan sebaiknya ADMIN_SESSION_SECRET) di Environment Variables Vercel, lalu redeploy.",
        code: "ADMIN_NOT_CONFIGURED"
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request tidak valid." }, { status: 400 });
  }

  const inputKey = String(body?.key || "").trim();

  // Pembatas percobaan salah per IP (butuh KV; tanpa KV hanya ada jeda 700ms).
  const failKey = `auth:fail:${clientId(request)}`;
  let failedCount = 0;
  if (isKvConfigured()) {
    const current = await kvGet(failKey);
    failedCount = Number(current || 0);
    if (failedCount >= MAX_FAILED_ATTEMPTS) {
      return Response.json(
        { error: "Terlalu banyak percobaan salah. Coba lagi dalam 15 menit." },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(LOCK_SECONDS) } }
      );
    }
  }

  const ok = inputKey.length > 0 && (await safeEqual(inputKey, correctKey));

  if (!ok) {
    if (isKvConfigured()) {
      const n = await kvIncr(failKey);
      if (n === 1) await kvExpire(failKey, LOCK_SECONDS);
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
    return Response.json({ error: "Key salah." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  if (isKvConfigured()) await kvDel(failKey);

  const token = await createAdminToken();

  return Response.json(
    { token, expiresIn: 12 * 60 * 60 },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
