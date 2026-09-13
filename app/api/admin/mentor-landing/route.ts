import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Foto Mentor untuk Landing Page (Admin) — PRD Bagian 4.3 #6, Bagian 13
 * mentor_profiles.foto_landing_url/tampil_di_landing (BARU). Diakses dari
 * section "Foto untuk Landing Page" di halaman detail Manajemen Mentor
 * (components/admin/MentorLandingFotoSection.tsx).
 *
 * Bucket Supabase Storage "mentor-landing" (public, PNG-only) — TERPISAH
 * dari bucket "avatars" (dipakai avatar_url di seluruh aplikasi lain,
 * limit 1MB, terima jpeg/png/webp) karena tujuan beda: foto full-body
 * background transparan khusus kurasi landing page, ukurannya bisa jauh
 * lebih besar dari avatar wajah biasa.
 */

const MAX_FOTO_BYTES = 8 * 1024 * 1024;
const MENTOR_LANDING_BUCKET = "mentor-landing";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function requireAdmin(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return { session: null, error: errorResponse("Belum login.", 401) };
  if (session.role !== "admin") {
    return { session: null, error: errorResponse("Cuma Admin yang bisa mengelola foto landing page Mentor.", 403) };
  }
  return { session, error: null };
}

/** Upload/ganti foto landing — validasi ekstensi & MIME WAJIB diulang di
 * server (jangan andalkan validasi client saja), meski bucket juga sudah
 * dibatasi PNG-only. */
export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdmin(request);
  if (authError) return authError;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Request harus multipart/form-data.", 400);
  }

  const mentorUserId = formData.get("mentorUserId");
  if (typeof mentorUserId !== "string" || !mentorUserId) {
    return errorResponse("mentorUserId wajib diisi.", 400);
  }

  const { data: mentorProfile, error: profileError } = await supabaseServer
    .from("mentor_profiles")
    .select("id")
    .eq("user_id", mentorUserId)
    .maybeSingle();

  if (profileError || !mentorProfile) {
    return errorResponse("Profil Mentor tidak ditemukan.", 404);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorResponse("File foto tidak ditemukan.", 400);
  }

  const namaFileLower = file.name.toLowerCase();
  if (file.type !== "image/png" || !namaFileLower.endsWith(".png")) {
    return errorResponse("Harus PNG dengan background transparan.", 400);
  }
  if (file.size > MAX_FOTO_BYTES) {
    return errorResponse("Ukuran file maksimal 8MB.", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${mentorUserId}.png`;

  const { error: uploadError } = await supabaseServer.storage
    .from(MENTOR_LANDING_BUCKET)
    .upload(path, buffer, { contentType: "image/png", upsert: true });

  if (uploadError) {
    console.error("[admin/mentor-landing] upload failed:", uploadError);
    return errorResponse("Gagal mengunggah foto. Coba lagi nanti.", 500);
  }

  const { data: publicUrlData } = supabaseServer.storage.from(MENTOR_LANDING_BUCKET).getPublicUrl(path);
  // Query param cache-buster: path publik selalu sama (overwrite di tempat),
  // jadi tanpa ini browser/CDN bisa terus menampilkan foto lama dari cache.
  const fotoLandingUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabaseServer
    .from("mentor_profiles")
    .update({ foto_landing_url: fotoLandingUrl })
    .eq("user_id", mentorUserId);

  if (updateError) {
    console.error("[admin/mentor-landing] update mentor_profiles failed:", updateError);
    return errorResponse("Foto berhasil diunggah tapi gagal disimpan ke profil. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true, fotoLandingUrl });
}

interface TogglePayload {
  mentorUserId: string;
  tampilDiLanding: boolean;
}

/** Toggle tampil_di_landing — ditolak kalau foto_landing_url masih kosong
 * (tidak masuk akal menampilkan mentor tanpa foto landing di section publik). */
export async function PATCH(request: NextRequest) {
  const { error: authError } = await requireAdmin(request);
  if (authError) return authError;

  let body: TogglePayload;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  if (!body.mentorUserId || typeof body.tampilDiLanding !== "boolean") {
    return errorResponse("mentorUserId dan tampilDiLanding wajib diisi.", 400);
  }

  const { data: mentorProfile, error: profileError } = await supabaseServer
    .from("mentor_profiles")
    .select("foto_landing_url")
    .eq("user_id", body.mentorUserId)
    .maybeSingle();

  if (profileError || !mentorProfile) {
    return errorResponse("Profil Mentor tidak ditemukan.", 404);
  }

  if (body.tampilDiLanding && !mentorProfile.foto_landing_url) {
    return errorResponse("Upload foto PNG dulu sebelum menampilkan di landing page.", 400);
  }

  const { error: updateError } = await supabaseServer
    .from("mentor_profiles")
    .update({ tampil_di_landing: body.tampilDiLanding })
    .eq("user_id", body.mentorUserId);

  if (updateError) {
    console.error("[admin/mentor-landing] update tampil_di_landing failed:", updateError);
    return errorResponse("Gagal menyimpan perubahan. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true, tampilDiLanding: body.tampilDiLanding });
}
