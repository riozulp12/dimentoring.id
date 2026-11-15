import { penuhMenurutKapasitasManual } from "@/lib/shared/kapasitasKelas";
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
import { PAYMENT_EXPIRY_HOURS } from "@/lib/payment/mayarLogic";
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
  notifyJadwalDitetapkan,
  notifySiswaDidaftarkanAdmin,
} from "@/lib/notifikasi/notify";
import { formatJadwalRingkas } from "@/lib/shared/formatJadwal";
import { formatSlot, parseJadwalSlot, validateJadwalDitetapkan, type JadwalSlot } from "@/lib/shared/jadwalPilihan";
import { cariStatusSlot } from "@/lib/shared/slotTerisi";
import { KELAS_KETERSEDIAAN_SELECT, hitungKetersediaanKelas, normalisasiKelas } from "@/lib/jadwal/slotTerisi";

/**
 * Daftarkan siswa MANUAL ke kelas — PRD 7.5.10 (Admin, halaman Pendaftar di
 * Kelola Kelas). Untuk siswa yang sudah bayar di luar website.
 *
 * - Enrollment 'lunas' sumber='manual' + enrollment_subtes + sesi_kelas + log
 *   dibuat dalam SATU transaksi lewat fungsi DB daftar_siswa_manual
 *   (db/add_enrollment_manual.sql) — gagal satu, batal semua.
 * - TIDAK membuat baris payments, jadi promo, poin, dan reward referral
 *   (yang cuma dipicu lib/payment/fulfillPayment.ts) tidak pernah jalan.
 * - Duplikat & kelas penuh -> 409, TANPA override kapasitas.
 * - Checkout siswa yang masih MENUNGGU bayar untuk kelas ini (link Mayar
 *   belum kedaluwarsa) -> 409: kalau link itu tetap dibayar, webhook menimpa
 *   pendaftaran manual dan siswa membayar dua kali. payments cuma DIBACA.
 * - Idempotent: requestId (satu per pengisian form) — kirim ulang dengan
 *   requestId sama mengembalikan hasil yang sama tanpa pendaftaran kedua.
 * - Jadwal (opsional, `jadwal` = {hari, jam_mulai}): divalidasi SEBELUM mendaftar dengan aturan yang sama
 *   dengan route "Tetapkan jadwal" (validateJadwalDitetapkan), lalu disimpan ke enrollments.jadwal_ditetapkan
 *   SETELAH fungsi DB sukses (tanpa mengubah SQL). Slot yang sudah penuh TIDAK menolak — Admin boleh
 *   menimpa; respons membawa `slotPenuh: true`. Bila penyimpanan jadwal gagal, siswa TETAP terdaftar dan
 *   respons berisi `jadwalGagal: true` + pesan jelas (Admin menetapkan lewat halaman Pendaftar).
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
  jadwal?: unknown;
}

type RpcHasil =
  | { status: "dibuat"; enrollment_id: string; jumlah_sesi: number }
  | { status: "sudah_diproses"; enrollment_id: string | null }
  | { status: "duplikat"; status_pembayaran?: string }
  | { status: "payment_menunggu" }
  | { status: "penuh"; kapasitas: number | null; terisi: number }
  | { status: "kelas_tidak_ada" }
  | { status: "mentor_sama_dengan_siswa" }
  | { status: "request_id_bentrok" };

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

const PESAN_DUPLIKAT = "Siswa ini sudah punya pendaftaran di kelas ini.";
const PESAN_PENUH = "Kelas sudah penuh. Pendaftaran manual tidak bisa melewati kapasitas kelas.";
const PESAN_MENTOR_SISWA = "Mentor tatap muka tidak boleh akun siswa itu sendiri.";
const PESAN_REQUEST_BENTROK =
  "Formulir ini sudah dipakai untuk mendaftarkan siswa/kelas lain. Tutup lalu buka lagi formulir Daftarkan Siswa Manual.";
const PESAN_JADWAL_GAGAL = "Siswa terdaftar, tetapi jadwal gagal ditetapkan. Tetapkan lewat halaman Pendaftar.";
const PESAN_PAYMENT_MENUNGGU =
  "Siswa ini masih punya pembayaran checkout yang menunggu untuk kelas ini. Tunggu link pembayarannya kedaluwarsa (24 jam sejak checkout dibuat), atau batalkan dulu pembayaran menunggu itu (tutup link di dashboard Mayar lalu jalankan cek ulang pembayaran Admin), baru daftarkan manual.";

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

  // Jadwal opsional: kosong/null = daftar tanpa jadwal (perilaku lama). Terisi tapi bukan {hari, jam_mulai} = 400.
  let jadwalDiminta: JadwalSlot | null = null;
  if (body.jadwal !== undefined && body.jadwal !== null && body.jadwal !== "") {
    jadwalDiminta = parseJadwalSlot(body.jadwal);
    if (!jadwalDiminta) return errorResponse("Jadwal tidak valid.", 400);
  }

  // ---- Klik dobel: requestId yang sudah tercatat = sukses yang sama --------
  if (requestId) {
    const { data: logLama, error: logError } = await supabaseServer
      .from("enrollment_manual_log")
      .select("enrollment_id, siswa_id, kelas_id")
      .eq("request_id", requestId)
      .maybeSingle();
    if (logError) {
      console.error("[admin/enrollment-manual] query log failed:", logError);
      return errorResponse("Gagal memeriksa pendaftaran. Coba lagi nanti.", 500);
    }
    if (logLama) {
      if (logLama.siswa_id !== siswaId || logLama.kelas_id !== kelasId) {
        return errorResponse(PESAN_REQUEST_BENTROK, 409);
      }
      return NextResponse.json({ success: true, enrollmentId: logLama.enrollment_id, sudahDiproses: true });
    }
  }

  // ---- Kelas & siswa ---------------------------------------------------------
  const { data: kelas, error: kelasError } = await supabaseServer
    .from("kelas")
    .select(`nama, jumlah_sesi, ${KELAS_KETERSEDIAAN_SELECT}`) // KELAS_KETERSEDIAAN_SELECT sudah memuat id & kapasitas
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

  // payments tidak punya kolom kedaluwarsa — link Mayar berlaku
  // PAYMENT_EXPIRY_HOURS sejak dibuat_pada (sama dengan recheck Admin).
  const batasKedaluwarsa = new Date(Date.now() - PAYMENT_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  const { data: paymentMenunggu, error: paymentError } = await supabaseServer
    .from("payments")
    .select("id")
    .eq("user_id", siswaId)
    .eq("item_type", "kelas")
    .eq("item_id", kelasId)
    .eq("status", "menunggu")
    .gt("dibuat_pada", batasKedaluwarsa)
    .limit(1);
  if (paymentError) {
    console.error("[admin/enrollment-manual] query payments failed:", paymentError);
    return errorResponse("Gagal memeriksa pembayaran siswa. Coba lagi nanti.", 500);
  }
  if ((paymentMenunggu ?? []).length > 0) return errorResponse(PESAN_PAYMENT_MENUNGGU, 409);

  const { count: terisi, error: countError } = await supabaseServer
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("kelas_id", kelasId)
    .eq("status_pembayaran", "lunas");
  if (countError) {
    console.error("[admin/enrollment-manual] count enrollments failed:", countError);
    return errorResponse("Gagal memeriksa kapasitas kelas. Coba lagi nanti.", 500);
  }
  // Kapasitas manual OPSIONAL (kolom boleh kosong): kosong = tanpa batas manual — jangan dianggap penuh.
  if (penuhMenurutKapasitasManual(kelas.kapasitas as number | null, terisi ?? 0)) return errorResponse(PESAN_PENUH, 409);

  // ---- Jadwal: ada di kelas.jadwal & kelas memakai pilihan jadwal (aturan sama dengan "Tetapkan jadwal") ----
  let jadwalSlot: JadwalSlot | null = null;
  if (jadwalDiminta) {
    const cek = validateJadwalDitetapkan(jadwalDiminta, {
      jadwalPilihSiswa: kelas.jadwal_pilih_siswa === true,
      modePembelajaran: kelas.mode_pembelajaran as string,
      jadwal: kelas.jadwal,
    });
    if (!cek.ok) return errorResponse(cek.error, cek.status);
    jadwalSlot = cek.slot;
  }

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
    if (body.mentorOfflineId === siswaId) return errorResponse(PESAN_MENTOR_SISWA, 400);
    const kandidat = await getMentorOfflineKandidat(subtesOffline, lokasi, siswaId);
    if (kandidat === "gagal") return errorResponse("Gagal memeriksa mentor. Coba lagi nanti.", 500);
    if (!kandidat.some((m) => m.mentorId === body.mentorOfflineId)) {
      return errorResponse("Mentor yang dipilih tidak aktif, tidak bersedia tatap muka, atau tidak mengampu mapel kelas ini.", 400);
    }
    mentorOfflineId = body.mentorOfflineId;
  }

  // Slot penuh = PERINGATAN, bukan penolakan (Admin boleh menimpa). Dihitung SEBELUM siswa ini masuk.
  // Galat baca ketersediaan -> tanpa peringatan (jangan menggagalkan pendaftaran karena info tambahan).
  let slotPenuh = false;
  if (jadwalSlot) {
    const ketersediaan = await hitungKetersediaanKelas([normalisasiKelas(kelas as unknown as Record<string, unknown>)]);
    slotPenuh = cariStatusSlot(ketersediaan?.get(kelasId)?.slot ?? [], jadwalSlot)?.penuh === true;
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
    p_payment_kedaluwarsa_jam: PAYMENT_EXPIRY_HOURS,
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
    case "payment_menunggu":
      return errorResponse(PESAN_PAYMENT_MENUNGGU, 409);
    case "penuh":
      return errorResponse(PESAN_PENUH, 409);
    case "kelas_tidak_ada":
      return errorResponse("Kelas tidak ditemukan.", 404);
    case "mentor_sama_dengan_siswa":
      return errorResponse(PESAN_MENTOR_SISWA, 400);
    case "request_id_bentrok":
      return errorResponse(PESAN_REQUEST_BENTROK, 409);
    default:
      console.error("[admin/enrollment-manual] hasil RPC tidak dikenal:", hasilRaw);
      return errorResponse("Gagal mendaftarkan siswa. Coba lagi nanti.", 500);
  }

  // ---- Jadwal akhir (langkah kedua, di luar transaksi DB) ---------------------
  // Gagal = siswa TETAP terdaftar; Admin diberi tahu lewat respons dan menetapkan dari halaman Pendaftar.
  let jadwalGagal = false;
  if (jadwalSlot) {
    try {
      const { data: diperbarui, error: jadwalError } = await supabaseServer
        .from("enrollments")
        .update({ jadwal_ditetapkan: jadwalSlot, jadwal_ditetapkan_at: new Date().toISOString() })
        .eq("id", hasil.enrollment_id)
        .eq("kelas_id", kelasId)
        .eq("status_pembayaran", "lunas")
        .select("id")
        .maybeSingle();
      if (jadwalError || !diperbarui) {
        console.error("[admin/enrollment-manual] simpan jadwal_ditetapkan gagal:", jadwalError ?? "baris tidak ditemukan");
        jadwalGagal = true;
      }
    } catch (error) {
      console.error("[admin/enrollment-manual] simpan jadwal_ditetapkan error:", error);
      jadwalGagal = true;
    }
  }

  // ---- Notifikasi (gagal cukup di-log, pendaftaran tetap sah) ----------------
  const kelasNama = kelas.nama as string;
  await notifySiswaDidaftarkanAdmin(siswaId, kelasId, kelasNama);
  if (jadwalSlot && !jadwalGagal) await notifyJadwalDitetapkan(siswaId, kelasId, kelasNama, formatSlot(jadwalSlot));
  const jadwalDisplay = formatJadwalRingkas(kelas.jadwal);
  const siswaBaru = { kejadianId: hasil.enrollment_id as string, siswaUserId: siswaId };
  if (mentorOfflineId) {
    await notifyMentorOfflineSiswaBaruDaftar(mentorOfflineId, kelasId, kelasNama, jadwalDisplay, siswaBaru);
  } else if (kelas.mode_pembelajaran !== "offline") {
    await notifyMentorsSiswaBaruDaftar(kelasId, kelasNama, jadwalDisplay, subtesIds, siswaBaru);
  }

  return NextResponse.json(
    {
      success: true,
      enrollmentId: hasil.enrollment_id,
      jumlahSesi: hasil.jumlah_sesi,
      ...(jadwalSlot && !jadwalGagal ? { jadwalDitetapkan: jadwalSlot, slotPenuh } : {}),
      ...(jadwalGagal ? { jadwalGagal: true, pesan: PESAN_JADWAL_GAGAL } : {}),
    },
    { status: 201 },
  );
}
