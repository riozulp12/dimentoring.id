import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Upload Avatar — PRD 7 poin 2. Bucket Supabase Storage "avatars" sudah
 * dibuat (public, limit 1MB, MIME jpeg/png/webp) — endpoint ini cuma dipakai.
 *
 * Validasi tipe/ukuran WAJIB diulang di server (poin 2 langkah 2) meski
 * bucket juga membatasi — jangan andalkan validasi client saja.
 *
 * Nama file SENGAJA tanpa ekstensi asli (cuma `[user_id]`, bukan
 * `[user_id].jpg`) supaya path selalu sama persis walau user ganti-ganti
 * format file (jpg -> png -> webp) — kalau ekstensi ikut jadi bagian nama,
 * ganti format bikin file lama menumpuk di bucket alih-alih ke-overwrite
 * (lihat test #6: "cuma ada 1 file per user").
 */

const MAX_AVATAR_BYTES = 1 * 1024 * 1024; // 1MB, samakan persis dengan limit bucket
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AVATAR_BUCKET = "avatars";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Request harus multipart/form-data.", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorResponse("File foto tidak ditemukan.", 400);
  }

  // Tolak SVG dan tipe lain — SVG bisa membawa script/XSS kalau dirender langsung.
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return errorResponse("Format file harus JPEG, PNG, atau WEBP.", 400);
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return errorResponse("Ukuran file maksimal 1MB.", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Path berbasis user_id dari SESSION (bukan dari body request) — user tidak
  // bisa menimpa foto akun lain lewat manipulasi request.
  const path = session.userId;

  const { error: uploadError } = await supabaseServer.storage.from(AVATAR_BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  });

  if (uploadError) {
    console.error("[profil/avatar] upload failed:", uploadError);
    return errorResponse("Gagal mengunggah foto. Coba lagi nanti.", 500);
  }

  const { data: publicUrlData } = supabaseServer.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // Query param cache-buster: path publik selalu sama (overwrite di tempat),
  // jadi tanpa ini browser/CDN bisa terus menampilkan foto lama dari cache.
  const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabaseServer
    .from("users")
    .update({ avatar_url: avatarUrl })
    .eq("id", session.userId);

  if (updateError) {
    console.error("[profil/avatar] update users failed:", updateError);
    return errorResponse("Foto berhasil diunggah tapi gagal disimpan ke profil. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true, avatarUrl });
}
