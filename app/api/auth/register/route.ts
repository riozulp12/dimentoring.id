import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hashPassword } from "@/lib/auth/password";
import { TRIAL_COOKIE_NAME } from "@/lib/assessment/trial";
import { linkPendingAssessment } from "@/lib/assessment/linkPendingAssessment";

/**
 * Register API — PRD Bagian 7.0.2 (progressive profiling) & Bagian 13 (Data Model).
 *
 * BR-15 (direvisi September 2026, Bagian 7.0.3): verifikasi akun DITUNDA ke Fase 2.
 * Akun langsung dibuat berstatus `verified`, tanpa generate/kirim verification token.
 * Field `status_verifikasi_akun` & tabel `verification_tokens` tetap dipertahankan di
 * skema untuk diaktifkan lagi nanti — jangan dihapus.
 *
 * Catatan atomicity: supabase-js (lewat PostgREST) tidak punya transaksi multi-statement
 * bawaan. Insert dilakukan berurutan; kalau salah satu insert "wajib" (users/user_roles/
 * mentor_profiles/mentor_subtes_diampu/user_mapel_tersulit) gagal, kita hapus row `users`
 * yang baru dibuat (ON DELETE CASCADE membersihkan child table lainnya). Referral
 * diperlakukan best-effort (tidak membatalkan registrasi kalau gagal), sesuai FR-1.5
 * ("kode referral salah tidak fatal"). Untuk atomicity penuh, pertimbangkan pindah ke
 * Postgres function (RPC) di iterasi berikutnya.
 */

const VALID_ROLES = ["siswa", "mentor"] as const;
type Role = (typeof VALID_ROLES)[number];

const ROLE_TYPE_MAP: Record<Role, "student" | "mentor"> = {
  siswa: "student",
  mentor: "mentor",
};

// BR-2: Student aktif langsung, Mentor pending sampai di-approve Admin.
const ROLE_STATUS_MAP: Record<Role, "active" | "pending"> = {
  siswa: "active",
  mentor: "pending",
};

const KELAS_MAP: Record<string, string> = {
  "10": "kelas_10",
  "11": "kelas_11",
  "12": "kelas_12",
  "gap-year": "gap_year",
};

interface RegisterRequestBody {
  role: Role;
  namaLengkap: string;
  email: string;
  whatsapp: string;
  password: string;
  kodeReferral?: string;
  // PRD Bagian 7.4.1b: id assessment anonim yang mau ditautkan ke akun baru ini,
  // dikirim frontend dari query param ?pending_assessment= di halaman Daftar.
  pendingAssessmentId?: string;
  // khusus Siswa
  kelas?: string;
  mapelSulit?: string[];
  // khusus Mentor
  ptn?: string;
  semester?: string | number;
  jurusan?: string;
  subtesDiampu?: string[];
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidWhatsapp(value: string) {
  return /^(62|0)8[0-9]{7,12}$/.test(value);
}

// Format: 3 huruf pertama nama depan (uppercase) + 2 angka random + 3 huruf random,
// mis. "RIO09XYZ". Ruang kombinasi per prefix nama = 100 x 24^3 = ~1.38 juta, jauh
// lebih besar dari versi "3 huruf + 2 angka" (cuma 100 kombinasi/prefix, gampang
// tabrakan kalau banyak user bernama depan sama). Nama depan yang huruf validnya < 3
// (nama pendek/mengandung karakter non-huruf) di-pad huruf random.
const RANDOM_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // tanpa O/I, hindari salah baca
function randomLetter() {
  return RANDOM_LETTERS[randomInt(0, RANDOM_LETTERS.length)];
}
function generateReferralCode(namaLengkap: string) {
  const firstName = namaLengkap.trim().split(/\s+/)[0] ?? "";
  let prefix = firstName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  while (prefix.length < 3) {
    prefix += randomLetter();
  }
  const digits = String(randomInt(0, 100)).padStart(2, "0");
  const randomSuffix = randomLetter() + randomLetter() + randomLetter();
  return `${prefix}${digits}${randomSuffix}`;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body: RegisterRequestBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  // ---- Validasi input dasar (server-side, tidak boleh percaya client) ----
  if (!body.role || !VALID_ROLES.includes(body.role)) {
    return errorResponse("Role harus 'siswa' atau 'mentor'.", 400);
  }
  const namaLengkap = body.namaLengkap?.trim();
  if (!namaLengkap) {
    return errorResponse("Nama lengkap wajib diisi.", 400);
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return errorResponse("Email tidak valid.", 400);
  }
  const whatsapp = body.whatsapp?.replace(/[^0-9]/g, "") ?? "";
  if (!isValidWhatsapp(whatsapp)) {
    return errorResponse("Nomor WhatsApp tidak valid.", 400);
  }
  if (!body.password || body.password.length < 8) {
    return errorResponse("Password minimal 8 karakter.", 400);
  }

  let tingkatKelas: string | null = null;
  let mapelSulitNames: string[] = [];
  let asalPtn = "";
  let semester = 0;
  let jurusan = "";
  let subtesDiampuNames: string[] = [];

  if (body.role === "siswa") {
    tingkatKelas = body.kelas ? (KELAS_MAP[body.kelas] ?? null) : null;
    if (!tingkatKelas) {
      return errorResponse("Kelas tidak valid.", 400);
    }
    mapelSulitNames = (body.mapelSulit ?? []).filter((name) => name.toLowerCase() !== "lainnya");
    if (mapelSulitNames.length === 0) {
      return errorResponse("Pilih minimal satu mapel tersulit.", 400);
    }
  } else {
    asalPtn = body.ptn?.trim() ?? "";
    jurusan = body.jurusan?.trim() ?? "";
    semester = Number(body.semester);
    if (!asalPtn) {
      return errorResponse("PTN wajib diisi.", 400);
    }
    if (!jurusan) {
      return errorResponse("Jurusan wajib diisi.", 400);
    }
    if (!Number.isInteger(semester) || semester <= 0) {
      return errorResponse("Semester tidak valid.", 400);
    }
    subtesDiampuNames = (body.subtesDiampu ?? []).filter((name) => name.toLowerCase() !== "lainnya");
    if (subtesDiampuNames.length === 0) {
      return errorResponse("Pilih minimal satu subtes yang diampu.", 400);
    }
  }

  const warnings: string[] = [];

  // ---- Resolusi nama mapel/subtes -> subtes.id (referensi tabel `subtes`) ----
  const namesToResolve = body.role === "siswa" ? mapelSulitNames : subtesDiampuNames;
  const { data: subtesRows, error: subtesError } = await supabaseServer
    .from("subtes")
    .select("id, nama")
    .in("nama", namesToResolve);

  if (subtesError) {
    return errorResponse("Gagal memuat referensi mapel/subtes.", 500);
  }

  const resolvedSubtesIds = (subtesRows ?? []).map((row) => row.id as string);
  const resolvedNames = new Set((subtesRows ?? []).map((row) => (row.nama as string).toLowerCase()));
  const unresolvedNames = namesToResolve.filter((name) => !resolvedNames.has(name.toLowerCase()));
  if (unresolvedNames.length > 0) {
    warnings.push(
      `Beberapa pilihan tidak ditemukan di data master dan dilewati: ${unresolvedNames.join(", ")}.`,
    );
  }
  if (resolvedSubtesIds.length === 0) {
    return errorResponse(
      body.role === "siswa"
        ? "Mapel tersulit yang dipilih tidak dikenali sistem."
        : "Subtes yang dipilih tidak dikenali sistem.",
      400,
    );
  }

  // ---- Hash password ----
  const passwordHash = await hashPassword(body.password);

  // ---- Insert users ----
  // Format kode referral (3 huruf + 2 angka) cuma punya 100 kombinasi per prefix,
  // jadi retry beberapa kali dengan kode baru kalau tabrakan spesifik di kode_referral.
  const MAX_REFERRAL_ATTEMPTS = 5;
  let newUser: { id: string } | null = null;
  let userError: { code?: string; message: string; details?: string; hint?: string } | null = null;

  for (let attempt = 0; attempt < MAX_REFERRAL_ATTEMPTS; attempt++) {
    const ownReferralCode = generateReferralCode(namaLengkap);
    const result = await supabaseServer
      .from("users")
      .insert({
        nama: namaLengkap,
        email,
        no_wa: whatsapp,
        password_hash: passwordHash,
        status_verifikasi_akun: "verified",
        sub_status: body.role === "siswa" ? "calon_mahasiswa" : null,
        tingkat_kelas: body.role === "siswa" ? tingkatKelas : null,
        kode_referral: ownReferralCode,
      })
      .select("id")
      .single();

    newUser = result.data;
    userError = result.error;

    if (!userError) break;
    const isReferralCollision =
      userError.code === "23505" && userError.message.includes("kode_referral");
    if (!isReferralCollision) break;
  }

  if (userError || !newUser) {
    if (userError?.code === "23505") {
      if (userError.message.includes("email")) {
        return errorResponse("Email sudah terdaftar.", 409);
      }
      if (userError.message.includes("no_wa")) {
        return errorResponse("Nomor WhatsApp sudah terdaftar.", 409);
      }
      if (userError.message.includes("kode_referral")) {
        return errorResponse("Gagal membuat kode referral unik. Coba lagi.", 500);
      }
      return errorResponse("Data sudah terdaftar.", 409);
    }
    console.error("[register] insert users failed:", {
      message: userError?.message,
      code: userError?.code,
      details: userError?.details,
      hint: userError?.hint,
    });
    return errorResponse("Gagal membuat akun. Coba lagi nanti.", 500);
  }

  const userId = newUser.id as string;

  async function rollbackUser() {
    await supabaseServer.from("users").delete().eq("id", userId);
  }

  // ---- Insert user_roles (BR-2: Mentor 'pending', Student 'active') ----
  const { error: roleError } = await supabaseServer.from("user_roles").insert({
    user_id: userId,
    role_type: ROLE_TYPE_MAP[body.role],
    status: ROLE_STATUS_MAP[body.role],
    sumber_pengajuan: "register_publik",
  });

  if (roleError) {
    console.error("[register] insert user_roles failed:", roleError);
    await rollbackUser();
    return errorResponse("Gagal menyimpan role akun. Coba lagi nanti.", 500);
  }

  // ---- Data role-spesifik ----
  if (body.role === "mentor") {
    const { data: mentorProfile, error: mentorProfileError } = await supabaseServer
      .from("mentor_profiles")
      .insert({ user_id: userId, asal_ptn: asalPtn, semester, jurusan })
      .select("id")
      .single();

    if (mentorProfileError || !mentorProfile) {
      console.error("[register] insert mentor_profiles failed:", mentorProfileError);
      await rollbackUser();
      return errorResponse("Gagal menyimpan profil mentor. Coba lagi nanti.", 500);
    }

    const { error: subtesDiampuError } = await supabaseServer.from("mentor_subtes_diampu").insert(
      resolvedSubtesIds.map((subtesId) => ({
        mentor_profile_id: mentorProfile.id,
        subtes_id: subtesId,
      })),
    );

    if (subtesDiampuError) {
      console.error("[register] insert mentor_subtes_diampu failed:", subtesDiampuError);
      await rollbackUser();
      return errorResponse("Gagal menyimpan subtes yang diampu. Coba lagi nanti.", 500);
    }
  } else {
    const { error: mapelError } = await supabaseServer.from("user_mapel_tersulit").insert(
      resolvedSubtesIds.map((subtesId) => ({
        user_id: userId,
        subtes_id: subtesId,
      })),
    );

    if (mapelError) {
      console.error("[register] insert user_mapel_tersulit failed:", mapelError);
      await rollbackUser();
      return errorResponse("Gagal menyimpan mapel tersulit. Coba lagi nanti.", 500);
    }
  }

  // ---- Referral (best-effort, FR-1.5: kode salah tidak memblokir pendaftaran) ----
  // Sesuai BR-11: validasi self-referral SENGAJA tidak dilakukan di sini — itu ranah
  // Payment (webhook konversi), bukan saat registrasi.
  const kodeReferral = body.kodeReferral?.trim();
  if (kodeReferral) {
    const { data: referrer } = await supabaseServer
      .from("users")
      .select("id")
      .eq("kode_referral", kodeReferral)
      .maybeSingle();

    if (!referrer) {
      warnings.push("Kode referral tidak ditemukan, pendaftaran tetap dilanjutkan.");
    } else {
      const { error: referralError } = await supabaseServer.from("referrals").insert({
        referrer_id: referrer.id,
        referee_id: userId,
        kode_referral: kodeReferral,
        status: "terdaftar",
      });
      if (referralError) {
        console.error("[register] insert referrals failed:", referralError);
        warnings.push("Kode referral gagal dicatat, pendaftaran tetap dilanjutkan.");
      }
    }
  }

  // ---- PRD Bagian 7.4.1b (best-effort): kalau register dipicu dari alur
  // "submit ke-3+ assessment anonim", tautkan sekarang juga supaya assessment
  // langsung ter-attribute ke akun baru (BR-29: baru dianggap lead resmi
  // begitu ditautkan) — tidak menunggu langkah Login berikutnya. Kegagalan di
  // sini TIDAK membatalkan registrasi (helper sudah aman kalau id kosong/tidak
  // cocok trial cookie-nya).
  const trialId = request.cookies.get(TRIAL_COOKIE_NAME)?.value ?? null;
  await linkPendingAssessment(body.pendingAssessmentId, trialId, userId);

  return NextResponse.json(
    {
      success: true,
      message: "Registrasi berhasil. Kamu sudah bisa login.",
      userId,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    { status: 201 },
  );
}
