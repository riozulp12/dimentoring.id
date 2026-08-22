import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Update Profil (PATCH) — PRD 7 poin 3. Field yang di-update tergantung role
 * SESI (bukan dari body request) — Admin cuma bisa ubah Info Dasar, Student/
 * Mentor tambah field spesifik role masing-masing.
 *
 * Mapel Tersulit / Subtes yang Diampu dikirim sebagai NAMA (bukan id, sama
 * seperti checklist di Register) — di-resolve ke subtes.id di sini, lalu
 * user_mapel_tersulit/mentor_subtes_diampu di-replace penuh (hapus semua baris
 * lama, insert ulang) sesuai instruksi PRD poin 3.
 */

const VALID_TINGKAT_KELAS = ["kelas_10", "kelas_11", "kelas_12", "gap_year"];

interface UpdateProfilBody {
  namaLengkap?: string;
  whatsapp?: string;
  // Khusus Student
  namaSekolah?: string;
  provinsiId?: string;
  tingkatKelas?: string;
  mapelTersulit?: string[];
  // Khusus Mentor
  asalPtn?: string;
  semester?: number | string;
  jurusan?: string;
  subtesDiampu?: string[];
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function isValidWhatsapp(value: string): boolean {
  return /^(62|0)8[0-9]{7,12}$/.test(value);
}

async function resolveSubtesIds(names: string[]): Promise<string[] | null> {
  if (names.length === 0) return [];
  const { data, error } = await supabaseServer.from("subtes").select("id, nama").in("nama", names);
  if (error) {
    console.error("[profil/update] query subtes failed:", error);
    return null;
  }
  const rows = data ?? [];
  if (rows.length !== names.length) return null; // salah satu nama tidak dikenali
  return rows.map((row) => row.id as string);
}

export async function PATCH(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);

  let body: UpdateProfilBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  // ---- Field umum (semua role) ----
  const namaLengkap = body.namaLengkap?.trim();
  if (!namaLengkap) {
    return errorResponse("Nama lengkap wajib diisi.", 400);
  }
  const whatsapp = body.whatsapp?.replace(/[^0-9]/g, "") ?? "";
  if (!isValidWhatsapp(whatsapp)) {
    return errorResponse("Nomor WhatsApp tidak valid.", 400);
  }

  const usersUpdate: Record<string, unknown> = { nama: namaLengkap, no_wa: whatsapp };

  // ---- Khusus Student ----
  let mapelTersulitIds: string[] = [];
  if (session.role === "student") {
    if (!body.provinsiId || typeof body.provinsiId !== "string") {
      return errorResponse("Provinsi wajib diisi — dasar validasi aturan SNBP (BR-28).", 400);
    }
    if (!body.tingkatKelas || !VALID_TINGKAT_KELAS.includes(body.tingkatKelas)) {
      return errorResponse("Kelas tidak valid.", 400);
    }
    const mapelNames = Array.isArray(body.mapelTersulit)
      ? body.mapelTersulit.filter((n): n is string => typeof n === "string")
      : [];
    if (mapelNames.length === 0) {
      return errorResponse("Pilih minimal satu Mapel Tersulit.", 400);
    }

    const { data: provinsiRow, error: provinsiError } = await supabaseServer
      .from("provinsi")
      .select("id")
      .eq("id", body.provinsiId)
      .maybeSingle();
    if (provinsiError) {
      console.error("[profil/update] query provinsi failed:", provinsiError);
      return errorResponse("Gagal memvalidasi provinsi. Coba lagi nanti.", 500);
    }
    if (!provinsiRow) {
      return errorResponse("Provinsi tidak ditemukan.", 400);
    }

    const resolved = await resolveSubtesIds(mapelNames);
    if (resolved === null) {
      return errorResponse("Salah satu Mapel Tersulit tidak dikenali sistem.", 400);
    }
    mapelTersulitIds = resolved;

    usersUpdate.nama_sekolah = typeof body.namaSekolah === "string" ? body.namaSekolah.trim() || null : null;
    usersUpdate.provinsi_id = body.provinsiId;
    usersUpdate.tingkat_kelas = body.tingkatKelas;
  }

  // ---- Khusus Mentor ----
  let mentorUpdate: { asal_ptn: string; semester: number; jurusan: string } | null = null;
  let subtesDiampuIds: string[] = [];
  if (session.role === "mentor") {
    const asalPtn = typeof body.asalPtn === "string" ? body.asalPtn.trim() : "";
    const jurusan = typeof body.jurusan === "string" ? body.jurusan.trim() : "";
    const semester = Number(body.semester);
    if (!asalPtn) return errorResponse("Asal PTN wajib diisi.", 400);
    if (!jurusan) return errorResponse("Jurusan wajib diisi.", 400);
    if (!Number.isInteger(semester) || semester <= 0) {
      return errorResponse("Semester tidak valid.", 400);
    }

    const subtesNames = Array.isArray(body.subtesDiampu)
      ? body.subtesDiampu.filter((n): n is string => typeof n === "string")
      : [];
    if (subtesNames.length === 0) {
      return errorResponse("Pilih minimal satu Subtes yang Diampu.", 400);
    }

    const resolved = await resolveSubtesIds(subtesNames);
    if (resolved === null) {
      return errorResponse("Salah satu Subtes yang Diampu tidak dikenali sistem.", 400);
    }
    subtesDiampuIds = resolved;

    mentorUpdate = { asal_ptn: asalPtn, semester, jurusan };
  }

  // ---- users: field umum + (Student: nama_sekolah/provinsi_id/tingkat_kelas) ----
  const { error: updateUserError } = await supabaseServer
    .from("users")
    .update(usersUpdate)
    .eq("id", session.userId);

  if (updateUserError) {
    console.error("[profil/update] update users failed:", updateUserError);
    if (updateUserError.code === "23505" && updateUserError.message.includes("no_wa")) {
      return errorResponse("Nomor WhatsApp sudah dipakai akun lain.", 409);
    }
    return errorResponse("Gagal menyimpan perubahan. Coba lagi nanti.", 500);
  }

  // ---- Student: replace penuh user_mapel_tersulit ----
  if (session.role === "student") {
    const { error: deleteError } = await supabaseServer
      .from("user_mapel_tersulit")
      .delete()
      .eq("user_id", session.userId);
    if (deleteError) {
      console.error("[profil/update] delete user_mapel_tersulit failed:", deleteError);
      return errorResponse("Gagal menyimpan Mapel Tersulit. Coba lagi nanti.", 500);
    }

    const { error: insertError } = await supabaseServer.from("user_mapel_tersulit").insert(
      mapelTersulitIds.map((subtesId) => ({ user_id: session.userId, subtes_id: subtesId })),
    );
    if (insertError) {
      console.error("[profil/update] insert user_mapel_tersulit failed:", insertError);
      return errorResponse("Gagal menyimpan Mapel Tersulit. Coba lagi nanti.", 500);
    }
  }

  // ---- Mentor: update mentor_profiles + replace penuh mentor_subtes_diampu ----
  if (session.role === "mentor" && mentorUpdate) {
    const { data: profileRow, error: profileError } = await supabaseServer
      .from("mentor_profiles")
      .update(mentorUpdate)
      .eq("user_id", session.userId)
      .select("id")
      .maybeSingle();

    if (profileError || !profileRow) {
      console.error("[profil/update] update mentor_profiles failed:", profileError);
      return errorResponse("Gagal menyimpan profil mentor. Coba lagi nanti.", 500);
    }

    const { error: deleteError } = await supabaseServer
      .from("mentor_subtes_diampu")
      .delete()
      .eq("mentor_profile_id", profileRow.id);
    if (deleteError) {
      console.error("[profil/update] delete mentor_subtes_diampu failed:", deleteError);
      return errorResponse("Gagal menyimpan Subtes yang Diampu. Coba lagi nanti.", 500);
    }

    const { error: insertError } = await supabaseServer.from("mentor_subtes_diampu").insert(
      subtesDiampuIds.map((subtesId) => ({ mentor_profile_id: profileRow.id, subtes_id: subtesId })),
    );
    if (insertError) {
      console.error("[profil/update] insert mentor_subtes_diampu failed:", insertError);
      return errorResponse("Gagal menyimpan Subtes yang Diampu. Coba lagi nanti.", 500);
    }
  }

  return NextResponse.json({ success: true });
}
