import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hashPassword } from "@/lib/auth/password";
import { validateAdminInvitationToken } from "@/lib/admin/adminInvitations";

/**
 * Registrasi Admin via token undangan — PRD Bagian 8 BR-3 (akun Admin hanya
 * lewat undangan Admin lain, tidak lewat form publik) & Bagian 13
 * (admin_invitations, users, user_roles). BEDA dari Register Siswa/Mentor:
 * form sederhana (bukan progressive profiling wizard), dan akun LANGSUNG
 * 'active' tanpa approval tambahan — generate undangan ITU SENDIRI sudah
 * jadi bentuk approval dari Admin yang mengundang.
 *
 * Catatan atomicity: sama seperti app/api/auth/register/route.ts — insert
 * berurutan, rollback manual users kalau salah satu langkah berikutnya gagal.
 */

interface DaftarAdminBody {
  token?: string;
  namaLengkap?: string;
  email?: string;
  whatsapp?: string;
  password?: string;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidWhatsapp(value: string) {
  return /^(62|0)8[0-9]{7,12}$/.test(value);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body: DaftarAdminBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  // ---- Validasi ULANG token di server — jangan pernah percaya validasi client. ----
  const token = body.token?.trim();
  if (!token) {
    return errorResponse("Token undangan tidak ditemukan.", 400);
  }
  const invitation = await validateAdminInvitationToken(token);
  if (!invitation) {
    return errorResponse("Link undangan tidak valid atau sudah kadaluarsa.", 410);
  }

  // ---- Validasi input dasar ----
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

  // ---- Hash password (fungsi SAMA dengan Register Siswa/Mentor) ----
  const passwordHash = await hashPassword(body.password);

  // ---- Insert users — BR-15: langsung 'verified', sama seperti Siswa/Mentor. ----
  const { data: newUser, error: userError } = await supabaseServer
    .from("users")
    .insert({
      nama: namaLengkap,
      email,
      no_wa: whatsapp,
      password_hash: passwordHash,
      status_verifikasi_akun: "verified",
      // FR-1.15: Admin tidak lewat /lengkapi-profil sama sekali (role Admin
      // tidak muncul di wizard itu) — tandai selesai dari awal supaya tidak
      // ikut ke-redirect paksa ke /lengkapi-profil saat login pertama.
      profiling_selesai: true,
    })
    .select("id")
    .single();

  if (userError || !newUser) {
    if (userError?.code === "23505") {
      if (userError.message.includes("email")) {
        return errorResponse("Email sudah terdaftar.", 409);
      }
      if (userError.message.includes("no_wa")) {
        return errorResponse("Nomor WhatsApp sudah terdaftar.", 409);
      }
      return errorResponse("Data sudah terdaftar.", 409);
    }
    console.error("[daftar-admin] insert users failed:", JSON.stringify(userError, null, 2));
    return errorResponse("Gagal membuat akun. Coba lagi nanti.", 500);
  }

  const userId = newUser.id as string;

  async function rollbackUser() {
    await supabaseServer.from("users").delete().eq("id", userId);
  }

  // ---- Insert user_roles — LANGSUNG active, direview_oleh_id = admin pengundang. ----
  const tanggalReview = new Date().toISOString();
  const { error: roleError } = await supabaseServer.from("user_roles").insert({
    user_id: userId,
    role_type: "admin",
    status: "active",
    sumber_pengajuan: "undangan_admin",
    direview_oleh_id: invitation.invitedById,
    tanggal_review: tanggalReview,
  });

  if (roleError) {
    console.error("[daftar-admin] insert user_roles failed:", JSON.stringify(roleError, null, 2));
    await rollbackUser();
    return errorResponse("Gagal menyimpan role akun. Coba lagi nanti.", 500);
  }

  // ---- Tandai undangan sudah dipakai — token ini tidak bisa dipakai lagi. ----
  const { error: usedError } = await supabaseServer
    .from("admin_invitations")
    .update({ used_at: new Date().toISOString(), used_by_id: userId })
    .eq("id", invitation.id);

  if (usedError) {
    console.error("[daftar-admin] update admin_invitations failed:", JSON.stringify(usedError, null, 2));
    // Akun & role sudah kepalang jadi — jangan rollback (Admin baru tetap valid),
    // cuma undangan gagal ditandai used. Log supaya Admin bisa cek manual.
  }

  return NextResponse.json(
    { success: true, message: "Akun Admin berhasil dibuat, silakan login." },
    { status: 201 },
  );
}
