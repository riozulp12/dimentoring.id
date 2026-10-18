import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  SESSION_COOKIE_NAME,
  getMentorOfflineKandidat,
  hasRoleAktif,
  parseLokasi,
  requireAdminAktif,
} from "@/lib/admin/enrollmentManual";
import { getKelasSubtesOptions } from "@/lib/payment/getKelasForCheckout";
import {
  MAX_SUBTES_MANUAL,
  UUID_RE,
  isMetodePembayaranManual,
  parseNominal,
  validateAlasan,
} from "@/lib/shared/enrollmentManual";
import {
  notifyMentorOfflineSiswaBaruDaftar,
  notifyMentorsSiswaBaruDaftar,
  notifySiswaDidaftarkanAdmin,
} from "@/lib/notifikasi/notify";
import { formatJadwalRingkas } from "@/lib/shared/formatJadwal";

/**
 * Daftarkan siswa MANUAL ke kelas — PRD 7.5.9 (Admin, halaman Pendaftar di
 * Kelola Kelas). Untuk siswa yang sudah bayar di luar website.
 *
 * - Enrollment 'lunas' sumber='manual' + enrollment_subtes + sesi_kelas + log
 *   dibuat dalam SATU transaksi lewat fungsi DB daftar_siswa_manual
 *   (db/add_enrollment_manual.sql) — gagal satu, batal semua.
 * - TIDAK membuat baris payments, jadi promo, poin, dan reward referral
 *   (yang cuma dipicu lib/payment/fulfillPayment.ts) tidak pernah jalan.
 * - Duplikat & kelas penuh -> 409, TANPA override kapasitas.
 * - Idempotent: requestId (satu per pengisian form) — kirim ulang dengan
 *   requestId sama mengembalikan hasil yang sama tanpa pendaftaran kedua.
 */

interface DaftarManualBody {
  siswaId?: unknown;
  kelasId?: unknown;
  subtesIds?: unknown;
  mentorOfflineId?: unknown;
  lokasiSiswaLat?: unknown;
  lokasiSiswaLng?: unknown;
  metodePembayaran?: unknown;
  nominalDibayar?: unknown;
  alasan?: unknown;
  requestId?: unknown;
}

type RpcHasil =
  | { status: "dibuat"; enrollment_id: string; jumlah_sesi: number }
  | { status: "sudah_diproses"; enrollment_id: string | null }
  | { status: "duplikat"; status_pembayaran?: string }
  | { status: "penuh"; kapasitas: number; terisi: number }
  | { status: "kelas_tidak_ada" };

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

const PESAN_DUPLIKAT = "Siswa ini sudah punya pendaftaran di kelas ini.";
const PESAN_PENUH = "Kelas sudah penuh. Pendaftaran manual tidak bisa melewati kapasitas kelas.";

export async function POST(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return errorResponse(auth.error, auth.status);

  let body: DaftarManualBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  // ---- Validasi input (murni) ----------------------------------------------
  const siswaId = typeof body.siswaId === "string" ? body.siswaId : "";
  const kelasId = typeof body.kelasId === "string" ? body.kelasId : "";
  if (!siswaId) return errorResponse("Pilih siswa dulu.", 400);
  if (!kelasId) return errorResponse("Kelas tidak valid.", 400);

  const alasanError = validateAlasan(body.alasan);
  if (alasanError) return errorResponse(alasanError, 400);
  const alasan = (body.alasan as string).trim();

  if (!isMetodePembayaranManual(body.metodePembayaran)) {
    return errorResponse("Pilih metode pembayaran.", 400);
  }
  const metode = body.metodePembayaran;

  const nominal = parseNominal(body.nominalDibayar);
  if (!nominal.ok) return errorResponse("Nominal dibayar harus angka rupiah bulat (boleh dikosongkan).", 400);

  let requestId: string | null = null;
  if (body.requestId !== undefined && body.requestId !== null) {
    if (typeof body.requestId !== "string" || !UUID_RE.test(body.requestId)) {
      return errorResponse("requestId tidak valid.", 400);
    }
    requestId = body.requestId;
  }

  // ---- Klik dobel: requestId yang sudah tercatat = sukses yang sama --------
  if (requestId) {
    const { data: logLama, error: logError } = await supabaseServer
      .from("enrollment_manual_log")
      .select("enrollment_id")
      .eq("request_id", requestId)
      .maybeSingle();
    if (logError) {
      console.error("[admin/enrollment-manual] query log failed:", logError);
      return errorResponse("Gagal memeriksa pendaftaran. Coba lagi nanti.", 500);
    }
    if (logLama) {
      return NextResponse.json({ success: true, enrollmentId: logLama.enrollment_id, sudahDiproses: true });
    }
  }

  // ---- Kelas & siswa ---------------------------------------------------------
  const { data: kelas, error: kelasError } = await supabaseServer
    .from("kelas")
    .select("id, nama, kapasitas, jumlah_sesi, mode_pembelajaran, jadwal")
    .eq("id", kelasId)
    .maybeSingle();
  if (kelasError) {
    console.error("[admin/enrollment-manual] query kelas failed:", kelasError);
    return errorResponse("Gagal memuat kelas. Coba lagi nanti.", 500);
  }
  if (!kelas) return errorResponse("Kelas tidak ditemukan.", 404);

  const siswaAktif = await hasRoleAktif(siswaId, "student");
  if (siswaAktif === "gagal") return errorResponse("Gagal memeriksa akun siswa. Coba lagi nanti.", 500);
  if (!siswaAktif) return errorResponse("Akun siswa tidak ditemukan atau belum aktif.", 400);

  // Cek cepat dengan pesan jelas — dicek ULANG di dalam transaksi DB.
  const { data: existing, error: existingError } = await supabaseServer
    .from("enrollments")
    .select("id, status_pembayaran")
    .eq("user_id", siswaId)
    .eq("kelas_id", kelasId)
    .maybeSingle();
  if (existingError) {
    console.error("[admin/enrollment-manual] query enrollments failed:", existingError);
    return errorResponse("Gagal memeriksa pendaftaran. Coba lagi nanti.", 500);
  }
  if (existing) return errorResponse(PESAN_DUPLIKAT, 409);

  const { count: terisi, error: countError } = await supabaseServer
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("kelas_id", kelasId)
    .eq("status_pembayaran", "lunas");
  if (countError) {
    console.error("[admin/enrollment-manual] count enrollments failed:", countError);
    return errorResponse("Gagal memeriksa kapasitas kelas. Coba lagi nanti.", 500);
  }
  if ((terisi ?? 0) >= (kelas.kapasitas as number)) return errorResponse(PESAN_PENUH, 409);

  // ---- Subtes (pool dari server, sama aturannya dengan checkout) ------------
  const pool = await getKelasSubtesOptions(kelasId);
  const poolIds = new Set(pool.map((s) => s.id));
  let subtesIds: string[];
  if (pool.length > 1 && kelas.mode_pembelajaran !== "offline") {
    const diminta = Array.isArray(body.subtesIds)
      ? Array.from(new Set(body.subtesIds.filter((id): id is string => typeof id === "string" && poolIds.has(id))))
      : [];
    if (diminta.length < 1 || diminta.length > MAX_SUBTES_MANUAL) {
      return errorResponse(`Pilih minimal 1, maksimal ${MAX_SUBTES_MANUAL} subtes.`, 400);
    }
    subtesIds = diminta;
  } else {
    subtesIds = pool.map((s) => s.id);
  }

  // ---- Kelas offline: mentor wajib layak, lokasi opsional -------------------
  let mentorOfflineId: string | null = null;
  let lokasi: { lat: number; lng: number } | null = null;
  if (kelas.mode_pembelajaran === "offline") {
    const lokasiResult = parseLokasi(body.lokasiSiswaLat, body.lokasiSiswaLng);
    if (!lokasiResult.ok) return errorResponse("Koordinat lokasi siswa tidak valid (boleh dikosongkan).", 400);
    lokasi = lokasiResult.value;

    const subtesOffline = pool[0]?.id;
    if (!subtesOffline) return errorResponse("Kelas offline ini belum punya Subtes. Atur dulu di Kelola Kelas.", 400);
    if (typeof body.mentorOfflineId !== "string" || !body.mentorOfflineId) {
      return errorResponse("Pilih mentor tatap muka untuk siswa ini.", 400);
    }
    const kandidat = await getMentorOfflineKandidat(subtesOffline, lokasi);
    if (kandidat === "gagal") return errorResponse("Gagal memeriksa mentor. Coba lagi nanti.", 500);
    if (!kandidat.some((m) => m.mentorId === body.mentorOfflineId)) {
      return errorResponse("Mentor yang dipilih tidak aktif, tidak bersedia tatap muka, atau tidak mengampu mapel kelas ini.", 400);
    }
    mentorOfflineId = body.mentorOfflineId;
  }

  // ---- Transaksi atomik ------------------------------------------------------
  const { data: hasilRaw, error: rpcError } = await supabaseServer.rpc("daftar_siswa_manual", {
    p_admin_id: auth.adminId,
    p_siswa_id: siswaId,
    p_kelas_id: kelasId,
    p_subtes_ids: subtesIds,
    p_mentor_offline_id: mentorOfflineId,
    p_lokasi_lat: lokasi?.lat ?? null,
    p_lokasi_lng: lokasi?.lng ?? null,
    p_metode: metode,
    p_nominal: nominal.value,
    p_alasan: alasan,
    p_request_id: requestId,
  });
  if (rpcError) {
    console.error("[admin/enrollment-manual] daftar_siswa_manual failed:", rpcError);
    return errorResponse("Gagal mendaftarkan siswa. Tidak ada data yang tersimpan — coba lagi.", 500);
  }

  const hasil = hasilRaw as RpcHasil | null;
  switch (hasil?.status) {
    case "dibuat":
      break;
    case "sudah_diproses":
      return NextResponse.json({ success: true, enrollmentId: hasil.enrollment_id, sudahDiproses: true });
    case "duplikat":
      return errorResponse(PESAN_DUPLIKAT, 409);
    case "penuh":
      return errorResponse(PESAN_PENUH, 409);
    case "kelas_tidak_ada":
      return errorResponse("Kelas tidak ditemukan.", 404);
    default:
      console.error("[admin/enrollment-manual] hasil RPC tidak dikenal:", hasilRaw);
      return errorResponse("Gagal mendaftarkan siswa. Coba lagi nanti.", 500);
  }

  // ---- Notifikasi (gagal cukup di-log, pendaftaran tetap sah) ----------------
  const kelasNama = kelas.nama as string;
  await notifySiswaDidaftarkanAdmin(siswaId, kelasId, kelasNama);
  const jadwalDisplay = formatJadwalRingkas(kelas.jadwal);
  if (mentorOfflineId) {
    await notifyMentorOfflineSiswaBaruDaftar(mentorOfflineId, kelasId, kelasNama, jadwalDisplay);
  } else if (kelas.mode_pembelajaran !== "offline") {
    await notifyMentorsSiswaBaruDaftar(kelasId, kelasNama, jadwalDisplay, subtesIds);
  }

  return NextResponse.json(
    { success: true, enrollmentId: hasil.enrollment_id, jumlahSesi: hasil.jumlah_sesi },
    { status: 201 },
  );
}
