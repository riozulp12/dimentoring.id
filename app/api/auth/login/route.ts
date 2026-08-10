import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
  type SessionRole,
} from "@/lib/auth/session";

/**
 * Login API — PRD Bagian 7.0.1 (Login) & Bagian 7.0.6 (multi-role).
 * Business rules: Bagian 8 BR-2 (Mentor pending sampai approve Admin),
 * BR-15 (akun unverified akses terbatas).
 */

// Hash scrypt dummy (bukan dari akun manapun) — dipakai kalau email tidak ditemukan,
// supaya verifyPassword() tetap menjalankan scrypt dengan cost yang sama seperti
// jalur email valid. Mencegah timing attack yang bisa dipakai menebak email terdaftar.
const DUMMY_PASSWORD_HASH =
  "scrypt$64ca0d48f328da570f514640165fae25$99f29c8dfb118c5193589c2a43ca9bdf12b851ec69e1d6892f6a9ecde68b71f7140160227d7c576cf0964d8943b8d8535ae666b85e936553851b0eeae325b29f";

const ROLE_DASHBOARD_PATH: Record<SessionRole, string> = {
  student: "/dashboard/siswa",
  mentor: "/dashboard/mentor",
  admin: "/dashboard/admin",
};

interface LoginRequestBody {
  email: string;
  password: string;
}

function errorResponse(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

// Urutan prioritas kalau akun punya >1 role aktif: pakai role terakhir dipakai user ini
// (dibaca dari session cookie sebelumnya, kalau ada & masih valid), lalu fallback ke
// Student, baru fallback ke role lain yang tersedia.
function pickActiveRole(activeRoles: SessionRole[], lastUsedRole: SessionRole | null): SessionRole {
  if (lastUsedRole && activeRoles.includes(lastUsedRole)) return lastUsedRole;
  if (activeRoles.includes("student")) return "student";
  return activeRoles[0];
}

export async function POST(request: NextRequest) {
  let body: LoginRequestBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return errorResponse("Email dan password wajib diisi.", 400);
  }

  // ---- Cari user & verifikasi password (pesan error SENGAJA generik, lihat di bawah) ----
  const { data: user, error: userQueryError } = await supabaseServer
    .from("users")
    .select("id, email, password_hash, status_verifikasi_akun")
    .eq("email", email)
    .maybeSingle();

  if (userQueryError) {
    console.error("[login] query users failed:", userQueryError);
    return errorResponse("Gagal memproses login. Coba lagi nanti.", 500);
  }

  // Selalu jalankan verifyPassword (bahkan kalau user tidak ada, pakai dummy hash) supaya
  // waktu respons tidak membocorkan apakah email terdaftar (BR: jangan bisa ditebak dari luar).
  const passwordValid = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordValid) {
    return errorResponse("Email atau password salah.", 401);
  }

  // ---- BR-15: akun unverified tidak boleh masuk ke dashboard ----
  if (user.status_verifikasi_akun === "unverified") {
    const params = new URLSearchParams({ email: user.email });
    return errorResponse("Akun kamu belum diverifikasi. Cek link verifikasi yang sudah dikirim.", 403, {
      reason: "unverified",
      redirectTo: `/verifikasi?${params.toString()}`,
    });
  }

  // ---- Role SELALU dibaca dari database, tidak pernah dari input client ----
  const { data: roleRows, error: roleError } = await supabaseServer
    .from("user_roles")
    .select("role_type")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (roleError) {
    console.error("[login] query user_roles failed:", roleError);
    return errorResponse("Gagal memproses login. Coba lagi nanti.", 500);
  }

  const activeRoles = (roleRows ?? []).map((row) => row.role_type as SessionRole);

  // Mis. Mentor yang masih 'pending' approval & belum punya role aktif lain (BR-2).
  if (activeRoles.length === 0) {
    return errorResponse("Akun kamu masih menunggu approval Admin.", 403, {
      reason: "no_active_role",
    });
  }

  // "Role terakhir dipakai" dibaca dari session cookie SEBELUMNYA — hanya dipakai kalau
  // memang milik user yang sama (cegah bocor preferensi user lain di browser bersama).
  const previousSession = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const lastUsedRole =
    previousSession && previousSession.userId === user.id ? previousSession.role : null;
  const activeRole = pickActiveRole(activeRoles, lastUsedRole);

  const response = NextResponse.json({
    success: true,
    role: activeRole,
    redirectTo: ROLE_DASHBOARD_PATH[activeRole],
  });

  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken({ userId: user.id, role: activeRole }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
