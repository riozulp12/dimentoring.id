import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  ROLE_DASHBOARD_PATH,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "@/lib/auth/session";

/**
 * Lengkapi Profil API — "babak kedua" Register per PRD Bagian 7.0.2 DIREVISI
 * TOTAL (Agustus 2026). Dipanggil dari halaman /lengkapi-profil SETELAH user
 * sudah auto-login (session ada, role masih "unassigned" — lihat
 * app/api/auth/register/route.ts & app/api/auth/google-callback/route.ts).
 *
 * Beda dari register/route.ts LAMA: `users` row SUDAH ADA sebelum request ini
 * (dibuat di langkah akun), jadi kegagalan di sini TIDAK boleh menghapus users
 * — cukup rollback baris user_roles/mentor_profiles/user_mapel_tersulit yang
 * BARU dibuat di request ini, supaya user bisa retry /lengkapi-profil tanpa
 * kehilangan akunnya.
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

interface LengkapiProfilBody {
  role: Role;
  whatsapp: string;
  // khusus Siswa
  kelas?: string;
  mapelSulit?: string[];
  // khusus Mentor
  ptn?: string;
  semester?: string | number;
  jurusan?: string;
  subtesDiampu?: string[];
}

function isValidWhatsapp(value: string) {
  return /^(62|0)8[0-9]{7,12}$/.test(value);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }

  let body: LengkapiProfilBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  if (!body.role || !VALID_ROLES.includes(body.role)) {
    return errorResponse("Role harus 'siswa' atau 'mentor'.", 400);
  }
  const whatsapp = body.whatsapp?.replace(/[^0-9]/g, "") ?? "";
  if (!isValidWhatsapp(whatsapp)) {
    return errorResponse("Nomor WhatsApp tidak valid.", 400);
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

  const userId = session.userId;
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

  // ---- Cek nomor WhatsApp belum dipakai akun lain (users.no_wa masih UNIQUE) ----
  const { data: waTaken } = await supabaseServer
    .from("users")
    .select("id")
    .eq("no_wa", whatsapp)
    .neq("id", userId)
    .maybeSingle();
  if (waTaken) {
    return errorResponse("Nomor WhatsApp sudah terdaftar.", 409);
  }

  // ---- Insert user_roles (BR-2: Mentor 'pending', Student 'active') ----
  const { data: newUserRole, error: roleError } = await supabaseServer
    .from("user_roles")
    .insert({
      user_id: userId,
      role_type: ROLE_TYPE_MAP[body.role],
      status: ROLE_STATUS_MAP[body.role],
      sumber_pengajuan: "register_publik",
    })
    .select("id")
    .single();

  if (roleError || !newUserRole) {
    console.error("[lengkapi-profil] insert user_roles failed:", roleError);
    return errorResponse("Gagal menyimpan role akun. Coba lagi nanti.", 500);
  }

  async function rollbackUserRole() {
    await supabaseServer.from("user_roles").delete().eq("id", newUserRole!.id);
  }

  // ---- Data role-spesifik ----
  if (body.role === "mentor") {
    const { data: mentorProfile, error: mentorProfileError } = await supabaseServer
      .from("mentor_profiles")
      .insert({ user_id: userId, asal_ptn: asalPtn, semester, jurusan })
      .select("id")
      .single();

    if (mentorProfileError || !mentorProfile) {
      console.error("[lengkapi-profil] insert mentor_profiles failed:", mentorProfileError);
      await rollbackUserRole();
      return errorResponse("Gagal menyimpan profil mentor. Coba lagi nanti.", 500);
    }

    const { error: subtesDiampuError } = await supabaseServer.from("mentor_subtes_diampu").insert(
      resolvedSubtesIds.map((subtesId) => ({
        mentor_profile_id: mentorProfile.id,
        subtes_id: subtesId,
      })),
    );

    if (subtesDiampuError) {
      console.error("[lengkapi-profil] insert mentor_subtes_diampu failed:", subtesDiampuError);
      await supabaseServer.from("mentor_profiles").delete().eq("id", mentorProfile.id);
      await rollbackUserRole();
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
      console.error("[lengkapi-profil] insert user_mapel_tersulit failed:", mapelError);
      await rollbackUserRole();
      return errorResponse("Gagal menyimpan mapel tersulit. Coba lagi nanti.", 500);
    }
  }

  // ---- Tandai profiling selesai + isi field users yang baru sekarang diketahui ----
  const { error: updateUserError } = await supabaseServer
    .from("users")
    .update({
      no_wa: whatsapp,
      profiling_selesai: true,
      ...(body.role === "siswa"
        ? { sub_status: "calon_mahasiswa", tingkat_kelas: tingkatKelas }
        : {}),
    })
    .eq("id", userId);

  if (updateUserError) {
    console.error("[lengkapi-profil] update users failed:", updateUserError);
    if (body.role === "mentor") {
      await supabaseServer.from("mentor_profiles").delete().eq("user_id", userId);
    } else {
      await supabaseServer.from("user_mapel_tersulit").delete().eq("user_id", userId);
    }
    await rollbackUserRole();
    return errorResponse("Gagal menyimpan data profil. Coba lagi nanti.", 500);
  }

  const activeRole = ROLE_TYPE_MAP[body.role];
  const response = NextResponse.json({
    success: true,
    redirectTo: ROLE_DASHBOARD_PATH[activeRole],
    warnings: warnings.length > 0 ? warnings : undefined,
  });

  // Reissue session dengan role ASLI (bukan lagi "unassigned").
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken({ userId, role: activeRole }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
