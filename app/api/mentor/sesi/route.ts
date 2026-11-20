import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { guardPemilikSiswa } from "@/lib/mentor/guardPemilikSiswa";
import { getNamaMapelMentor } from "@/lib/mentor/mapelMentor";
import { notifySesiDitandaiMentor } from "@/lib/notifikasi/notify";
import { rentangHariWib, tanggalWib } from "@/lib/shared/hariWib";
import { labelMentorSesi } from "@/lib/shared/statusSesi";
import { getSubtesPresensiSiswa } from "@/lib/mentor/subtesPresensi";
import { kandidatSubtesMentor, tentukanSubtesPresensi, totalSesiEnrollment } from "@/lib/shared/sesiEnrollment";

/**
 * "Tandai Sesi Hari Ini Selesai" (Mentor) — PRD Bagian 7.5.5 FR-A1. Selalu
 * menandai nomor_sesi PALING KECIL yang belum ditandai (urut, tidak bisa
 * loncat) — dikonfirmasi_mentor=true, tanggal_dilaksanakan=hari ini. BR-7:
 * cuma mentor yang terkait enrollment ini (kelas.mentor_id, kelas_mentor,
 * atau enrollments.mentor_offline_id — lib/mentor/aksesMentor.ts) yang boleh.
 * Multi-mentor: total sesi per siswa = enrollments.jumlah_sesi_total bila terisi, selain itu kelas.jumlah_sesi (dibagi antar
 * mentor, belum ada kuota per mentor) — mentor mana pun mengambil sesi
 * berikutnya yang belum ditandai dan mencatat mentor_id + nama_mapel
 * (snapshot) di baris itu. Maksimal SATU penandaan per enrollment per MENTOR
 * per hari kalender WIB (Asia/Jakarta) — mentor yang sama dua kali 409, dua
 * mentor berbeda boleh di hari yang sama. tanggal_dilaksanakan = tanggal WIB.
 *
 * Sesi pilihan siswa: sesi yang ditandai tidak boleh melebihi total siswa. Bila siswa punya kuota per subtes
 * (enrollment_subtes.kuota_sesi), sesi ditandai ke SATU subtes (sesi_kelas.subtes_id): otomatis bila mentor
 * hanya memegang satu subtes siswa itu, eksplisit lewat `subtesId` bila lebih dari satu; per subtes tidak boleh
 * melebihi kuota. Kuota NULL (data lama) = perilaku lama: tanpa batas per subtes, subtes_id tidak diisi.
 */

interface TandaiSesiBody {
  enrollmentId?: string;
  /** Wajib hanya bila siswa punya kuota per subtes DAN mentor memegang lebih dari satu subtesnya. */
  subtesId?: unknown;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);
  if (session.role !== "mentor") return errorResponse("Cuma Mentor yang bisa menandai sesi.", 403);

  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    return errorResponse("Fitur mengajar terkunci selama akun kamu masih 'On Review'.", 403);
  }

  let body: TandaiSesiBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const enrollmentId = body.enrollmentId;
  if (!enrollmentId || typeof enrollmentId !== "string") {
    return errorResponse("Siswa/kelas tidak valid.", 400);
  }

  // Penjaga kepemilikan bersama (lib/mentor/guardPemilikSiswa.ts → siswaMilikMentor): honor dibayar atas
  // penanda sesi, jadi cuma mentor PEMILIK siswa yang boleh — terkait kelas saja tidak cukup. Tidak ada /
  // bukan pemilik / masih menunggu diterima = 403 dengan pesan yang sama (tidak membocorkan enrollmentId
  // atau pemiliknya); data kepemilikan gagal dibaca = 503 dan tidak ada yang ditulis (fail-closed).
  const guard = await guardPemilikSiswa(session.userId, enrollmentId);
  if (!guard.ok) return errorResponse(guard.pesan, guard.status);
  const { akses } = guard;
  const { enrollment, kelas } = akses;

  // Total sesi MILIK SISWA (jumlah_sesi_total ?? kelas.jumlah_sesi). Penandaan tidak boleh melebihinya; total tidak
  // diketahui (data kelas tanpa jumlah_sesi) = perilaku lama tanpa pemeriksaan ini.
  const totalSesi = totalSesiEnrollment({ jumlah_sesi_total: enrollment.jumlahSesiTotal ?? null }, { jumlah_sesi: kelas.jumlahSesi ?? null });
  if (totalSesi !== null) {
    const { count: sudahDitandai, error: totalError } = await supabaseServer
      .from("sesi_kelas")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollmentId)
      .eq("dikonfirmasi_mentor", true);
    if (totalError) {
      console.error("[mentor/sesi] query jumlah sesi ditandai failed:", totalError);
      return errorResponse("Gagal memuat sesi. Coba lagi nanti.", 500);
    }
    if ((sudahDitandai ?? 0) >= totalSesi) {
      return errorResponse("Semua sesi kelas ini sudah ditandai selesai.", 400);
    }
  }

  // Kuota per subtes (hanya bila siswa punya kuota_sesi terisi). Data lama: subtesPresensi.subtesId = null.
  const subtesSiswa = await getSubtesPresensiSiswa(enrollmentId);
  if (subtesSiswa === "gagal") return errorResponse("Gagal memuat sesi. Coba lagi nanti.", 500);
  const subtesPresensi = tentukanSubtesPresensi({
    subtes: subtesSiswa,
    kandidatIds: kandidatSubtesMentor(session.userId, akses.subtesPenerimaan),
    dipilih: body.subtesId,
  });
  if (!subtesPresensi.ok) return errorResponse(subtesPresensi.error, subtesPresensi.status);

  const now = new Date();
  const hariIni = rentangHariWib(now);
  // Per mentor: cuma penandaan mentor INI yang dihitung. Sesi yang dibatalkan
  // Admin (dikonfirmasi_mentor_pada & mentor_id di-reset NULL) tidak ikut
  // terhitung, jadi mentor tetap bisa menandai ulang di hari yang sama.
  const { count: ditandaiHariIni, error: hariIniError } = await supabaseServer
    .from("sesi_kelas")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId)
    .eq("mentor_id", session.userId)
    .eq("dikonfirmasi_mentor", true)
    .gte("dikonfirmasi_mentor_pada", hariIni.mulai)
    .lt("dikonfirmasi_mentor_pada", hariIni.akhir);

  if (hariIniError) {
    console.error("[mentor/sesi] query penandaan hari ini failed:", hariIniError);
    return errorResponse("Gagal memuat sesi. Coba lagi nanti.", 500);
  }
  if ((ditandaiHariIni ?? 0) > 0) {
    return errorResponse(
      "Kamu sudah menandai sesi siswa ini hari ini. Maksimal satu sesi per hari untuk tiap mentor — tandai sesi berikutnya besok.",
      409,
    );
  }

  const { data: nextSesi, error: nextSesiError } = await supabaseServer
    .from("sesi_kelas")
    .select("id, nomor_sesi")
    .eq("enrollment_id", enrollmentId)
    .eq("dikonfirmasi_mentor", false)
    .order("nomor_sesi", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextSesiError) {
    console.error("[mentor/sesi] query sesi_kelas failed:", nextSesiError);
    return errorResponse("Gagal memuat sesi. Coba lagi nanti.", 500);
  }
  if (!nextSesi) {
    return errorResponse("Semua sesi kelas ini sudah ditandai selesai.", 400);
  }

  const namaMapelOtomatis = await getNamaMapelMentor(session.userId, kelas, enrollment.id, akses.subtesPenerimaan);
  if (namaMapelOtomatis === "gagal") {
    return errorResponse("Gagal memuat data mapel. Coba lagi nanti.", 500);
  }
  // Subtes dipilih/ditentukan (sesi pilihan siswa): snapshot mapel = subtes itu saja. Selain itu perilaku lama.
  const namaMapel = subtesPresensi.nama ?? namaMapelOtomatis;

  const tanggalDilaksanakan = tanggalWib(now);

  // Kondisional/atomik: cuma baris yang MASIH belum ditandai. Dua request
  // bersamaan (klik dobel, dua tab) memilih baris yang sama — yang kalah
  // mengubah 0 baris dan TIDAK mengirim notifikasi.
  const { data: updatedRows, error: updateError } = await supabaseServer
    .from("sesi_kelas")
    .update({
      dikonfirmasi_mentor: true,
      dikonfirmasi_mentor_pada: now.toISOString(),
      tanggal_dilaksanakan: tanggalDilaksanakan,
      mentor_id: session.userId,
      nama_mapel: namaMapel,
      ...(subtesPresensi.subtesId ? { subtes_id: subtesPresensi.subtesId } : {}),
    })
    .eq("id", nextSesi.id)
    .eq("dikonfirmasi_mentor", false)
    .select("id");

  if (updateError) {
    console.error("[mentor/sesi] update sesi_kelas failed:", updateError);
    return errorResponse("Gagal menandai sesi. Coba lagi nanti.", 500);
  }
  if (!updatedRows || updatedRows.length === 0) {
    return errorResponse("Sesi ini baru saja ditandai (mungkin dari tab lain). Muat ulang halaman.", 409);
  }

  // Nama mentor cuma untuk label "Nama Mentor — Mapel" (notifikasi & UI) —
  // gagal dimuat tidak membatalkan penandaan yang sudah tersimpan.
  const { data: mentorRow, error: mentorError } = await supabaseServer
    .from("users")
    .select("nama")
    .eq("id", session.userId)
    .maybeSingle();
  if (mentorError) console.error("[mentor/sesi] query nama mentor failed:", mentorError);
  const mentorLabel = labelMentorSesi((mentorRow?.nama as string | undefined) ?? null, namaMapel);

  await notifySesiDitandaiMentor(
    enrollment.userId,
    enrollment.kelasId,
    kelas.nama,
    nextSesi.nomor_sesi as number,
    mentorLabel,
  );

  return NextResponse.json({
    success: true,
    nomorSesi: nextSesi.nomor_sesi,
    namaMapel,
    mentorLabel,
    tanggalDilaksanakan,
  });
}
