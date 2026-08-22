import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Unduh Data Saya — PRD 8 Section 4a (Pengaturan). Kolom `users` di-SELECT
 * dengan allowlist eksplisit (BUKAN "select *") supaya password_hash tidak
 * mungkin ikut ter-export — allowlist ini satu-satunya cara aman karena
 * Supabase JS tidak punya syntax "select semua kecuali kolom X".
 */

const USER_EXPORT_COLUMNS = [
  "id",
  "nama",
  "email",
  "no_wa",
  "status_verifikasi_akun",
  "sub_status",
  "tingkat_kelas",
  "nama_sekolah",
  "kota_id",
  "provinsi_id",
  "nama_panggilan",
  "consent_leaderboard_lokasi",
  "opt_out_leaderboard",
  "kode_referral",
  "referral_click_count",
  "avatar_url",
  "notif_email",
  "notif_wa",
  "permintaan_hapus_akun",
  "alasan_hapus_akun",
  "tanggal_permintaan_hapus",
  "created_at",
].join(", ");

export async function GET(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ success: false, error: "Belum login." }, { status: 401 });
  }

  const { data: user, error: userError } = await supabaseServer
    .from("users")
    .select(USER_EXPORT_COLUMNS)
    .eq("id", session.userId)
    .maybeSingle();

  if (userError || !user) {
    console.error("[pengaturan/unduh-data] query users failed:", userError);
    return NextResponse.json({ success: false, error: "Gagal memuat data kamu. Coba lagi nanti." }, { status: 500 });
  }

  const exportData: Record<string, unknown> = { user };

  if (session.role === "student") {
    const [assessmentsRes, enrollmentsRes, referralsRes] = await Promise.all([
      supabaseServer.from("assessments").select("*").eq("user_id", session.userId),
      supabaseServer.from("enrollments").select("*").eq("user_id", session.userId),
      supabaseServer.from("referrals").select("*").eq("referrer_id", session.userId),
    ]);
    exportData.assessments = assessmentsRes.data ?? [];
    exportData.enrollments = enrollmentsRes.data ?? [];
    exportData.referrals = referralsRes.data ?? [];
  }

  if (session.role === "mentor") {
    const [mentorProfileRes, kelasRes] = await Promise.all([
      supabaseServer.from("mentor_profiles").select("*").eq("user_id", session.userId).maybeSingle(),
      supabaseServer.from("kelas").select("*").eq("mentor_id", session.userId),
    ]);
    exportData.mentorProfile = mentorProfileRes.data ?? null;
    exportData.kelasDiampu = kelasRes.data ?? [];
  }

  const json = JSON.stringify(exportData, null, 2);
  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="dimentoring-data-${session.userId}.json"`,
    },
  });
}
