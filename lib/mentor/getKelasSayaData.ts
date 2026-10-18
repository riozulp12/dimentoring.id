import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { TINGKAT_KELAS_LABEL } from "@/lib/shared/kelasLabels";
import { formatJadwal } from "@/lib/shared/formatJadwal";
import { hitungSesiTerkonfirmasi } from "@/lib/shared/progresSesi";
import { hitungStatusSesi } from "@/lib/shared/statusSesi";
import { rentangHariWib } from "@/lib/shared/hariWib";
import { getKelasAksesMentor, type AksesMentor } from "@/lib/mentor/aksesMentor";

/**
 * Data layer "Kelas Saya" (Mentor) — PRD Bagian 7.5 & Bagian 13 (kelas,
 * enrollments, materi). BR-7: mentor cuma boleh membuka kelas yang terkait
 * dengannya — kelas.mentor_id, kelas_mentor (multi-mentor), atau
 * enrollments.mentor_offline_id (kelas offline) — lewat SATU helper
 * lib/mentor/aksesMentor.ts. Detail page menambah guard eksplisit di server.
 */

export { TINGKAT_KELAS_LABEL };

export interface MentorKelasItem {
  id: string;
  nama: string;
  subtesNama: string | null;
  programKategori: string;
  tingkatKelas: string;
  tingkatKelasLabel: string;
  jadwal: string;
  jumlahSiswa: number;
  kapasitas: number;
  linkMeetBelumDiatur: boolean;
}

export interface MentorKelasDetail {
  id: string;
  nama: string;
  mentorId: string | null;
  subtesNama: string | null;
  tingkatKelasLabel: string;
  jumlahSiswa: number;
  linkMeet: string | null;
  jumlahSesi: number;
}

export interface MentorMateriItem {
  id: string;
  judul: string;
  tipe: "video" | "dokumen" | "rangkuman_teks";
  status: "draft" | "published" | "ditolak";
  sumber: "ai_generated" | "upload_mentor";
  createdAt: string;
}

type NamaJoin = { nama: string } | { nama: string }[] | null;

function firstNama(value: NamaJoin): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  return row?.nama ?? null;
}

/** Halaman list — semua kelas yang terkait mentor ini (lib/mentor/aksesMentor.ts). */
export async function getMentorKelasSaya(userId: string): Promise<MentorKelasItem[]> {
  const aksesMap = await getKelasAksesMentor(userId);
  if (aksesMap.size === 0) return [];

  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      "id, nama, program_kategori, tingkat_kelas, jadwal, kapasitas, link_meet, subtes:subtes_id(nama), enrollments(status_pembayaran, mentor_offline_id)",
    )
    .in("id", Array.from(aksesMap.keys()));

  if (error) {
    console.error("[getMentorKelasSaya] query failed:", error);
    return [];
  }

  type Row = {
    id: string;
    nama: string;
    program_kategori: string;
    tingkat_kelas: string;
    jadwal: unknown;
    kapasitas: number;
    link_meet: string | null;
    subtes: NamaJoin;
    enrollments: { status_pembayaran: string; mentor_offline_id: string | null }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    nama: row.nama,
    subtesNama: firstNama(row.subtes),
    programKategori: row.program_kategori,
    tingkatKelas: row.tingkat_kelas,
    tingkatKelasLabel: TINGKAT_KELAS_LABEL[row.tingkat_kelas] ?? row.tingkat_kelas,
    jadwal: formatJadwal(row.jadwal),
    // Mentor offline cuma menghitung siswa yang ditugaskan ke dia.
    jumlahSiswa: (row.enrollments ?? []).filter(
      (e) => e.status_pembayaran === "lunas" && (aksesMap.get(row.id) !== "offline" || e.mentor_offline_id === userId),
    ).length,
    kapasitas: row.kapasitas,
    linkMeetBelumDiatur: !row.link_meet,
  }));
}

/** Halaman detail — 1 kelas, plus data buat guard (mentorId). */
export async function getMentorKelasDetail(kelasId: string): Promise<MentorKelasDetail | null> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      "id, nama, mentor_id, tingkat_kelas, link_meet, jumlah_sesi, subtes:subtes_id(nama), enrollments(status_pembayaran)",
    )
    .eq("id", kelasId)
    .maybeSingle();

  if (error) {
    console.error("[getMentorKelasDetail] query failed:", error);
    return null;
  }
  if (!data) return null;

  type Row = {
    id: string;
    nama: string;
    mentor_id: string | null;
    tingkat_kelas: string;
    link_meet: string | null;
    jumlah_sesi: number;
    subtes: NamaJoin;
    enrollments: { status_pembayaran: string }[] | null;
  };
  const row = data as unknown as Row;

  return {
    id: row.id,
    nama: row.nama,
    mentorId: row.mentor_id,
    subtesNama: firstNama(row.subtes),
    tingkatKelasLabel: TINGKAT_KELAS_LABEL[row.tingkat_kelas] ?? row.tingkat_kelas,
    jumlahSiswa: (row.enrollments ?? []).filter((e) => e.status_pembayaran === "lunas").length,
    linkMeet: row.link_meet,
    jumlahSesi: row.jumlah_sesi,
  };
}

export interface SesiSiswaItem {
  enrollmentId: string;
  userId: string;
  nama: string;
  avatarUrl: string | null;
  sesiValidCount: number;
  /** Ditandai mentor, belum dijawab siswa, 24 jam belum lewat. */
  sesiMenungguSiswa: number;
  /** Disangkal siswa, menunggu keputusan Admin. */
  sesiDisangkal: number;
  /** Sudah ada penandaan hari ini (hari kalender WIB) — maks. satu per hari. */
  ditandaiHariIni: boolean;
  /** Nomor sesi paling kecil yang BELUM ditandai mentor — null kalau semua
   * sesi (1..jumlahSesi) sudah ditandai (tombol "Tandai Selesai" disembunyikan). */
  sesiBerikutnya: number | null;
}

type UserJoin = { id: string; nama: string; avatar_url: string | null } | { id: string; nama: string; avatar_url: string | null }[] | null;

function firstUser(value: UserJoin): { id: string; nama: string; avatar_url: string | null } | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Progress sesi (Absensi, PRD 7.5.5) per siswa lunas di kelas ini — dasar
 * tombol "Tandai Sesi Hari Ini Selesai" & progress "Sesi X dari Y" di halaman
 * Kelas Saya (Mentor). `sesiValidCount` pakai definisi bersama
 * lib/shared/progresSesi.ts (BR-34/FR-A4) — sesi yang masih disangkal &
 * menunggu review Admin TIDAK dihitung progress. Rincian status per sesi
 * dari lib/shared/statusSesi.ts.
 */
export async function getSesiSiswaByKelasId(
  kelasId: string,
  mentorId: string,
  akses: AksesMentor,
): Promise<SesiSiswaItem[]> {
  let enrollmentQuery = supabaseServer
    .from("enrollments")
    .select("id, users:user_id(id, nama, avatar_url)")
    .eq("kelas_id", kelasId)
    .eq("status_pembayaran", "lunas");
  // Mentor offline cuma melihat siswa yang ditugaskan ke dia; mentor kelas
  // (utama/kelas_mentor) melihat semua siswa lunas.
  if (akses === "offline") enrollmentQuery = enrollmentQuery.eq("mentor_offline_id", mentorId);
  const { data: enrollmentRows, error: enrollmentError } = await enrollmentQuery;

  if (enrollmentError) {
    console.error("[getSesiSiswaByKelasId] query enrollments failed:", enrollmentError);
    return [];
  }
  if (!enrollmentRows || enrollmentRows.length === 0) return [];

  const enrollmentIds = enrollmentRows.map((r) => r.id as string);
  const { data: sesiRows, error: sesiError } = await supabaseServer
    .from("sesi_kelas")
    .select("enrollment_id, nomor_sesi, dikonfirmasi_mentor, dikonfirmasi_mentor_pada, status_siswa, dikonfirmasi_siswa_pada")
    .in("enrollment_id", enrollmentIds)
    .order("nomor_sesi", { ascending: true });

  if (sesiError) {
    console.error("[getSesiSiswaByKelasId] query sesi_kelas failed:", sesiError);
  }

  type SesiRow = {
    enrollment_id: string;
    nomor_sesi: number;
    dikonfirmasi_mentor: boolean;
    dikonfirmasi_mentor_pada: string | null;
    status_siswa: string;
    dikonfirmasi_siswa_pada: string | null;
  };
  const sesiByEnrollment = new Map<string, SesiRow[]>();
  for (const row of (sesiRows ?? []) as unknown as SesiRow[]) {
    const list = sesiByEnrollment.get(row.enrollment_id) ?? [];
    list.push(row);
    sesiByEnrollment.set(row.enrollment_id, list);
  }

  const now = new Date();
  const hariIni = rentangHariWib(now);

  return (enrollmentRows as unknown as { id: string; users: UserJoin }[])
    .map((row) => {
      const user = firstUser(row.users);
      if (!user) return null;
      const sesiList = sesiByEnrollment.get(row.id) ?? [];
      const statusList = sesiList.map((s) => hitungStatusSesi(s, now).status);
      const ditandaiHariIni = sesiList.some(
        (s) =>
          s.dikonfirmasi_mentor &&
          s.dikonfirmasi_mentor_pada !== null &&
          Date.parse(s.dikonfirmasi_mentor_pada) >= Date.parse(hariIni.mulai) &&
          Date.parse(s.dikonfirmasi_mentor_pada) < Date.parse(hariIni.akhir),
      );
      const sesiBerikutnya = sesiList.find((s) => !s.dikonfirmasi_mentor)?.nomor_sesi ?? null;
      return {
        enrollmentId: row.id,
        userId: user.id,
        nama: user.nama,
        avatarUrl: user.avatar_url,
        sesiValidCount: hitungSesiTerkonfirmasi(sesiList),
        sesiMenungguSiswa: statusList.filter((st) => st === "menunggu_siswa").length,
        sesiDisangkal: statusList.filter((st) => st === "disangkal_menunggu_review").length,
        ditandaiHariIni,
        sesiBerikutnya,
      };
    })
    .filter((item): item is SesiSiswaItem => item !== null);
}

/** List materi SEMUA status (beda dari halaman Siswa yang cuma tampilkan published). */
export async function getMentorMateriList(kelasId: string): Promise<MentorMateriItem[]> {
  const { data, error } = await supabaseServer
    .from("materi")
    .select("id, judul, tipe, status, sumber, created_at")
    .eq("kelas_id", kelasId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getMentorMateriList] query failed:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    judul: row.judul as string,
    tipe: row.tipe as MentorMateriItem["tipe"],
    status: row.status as MentorMateriItem["status"],
    sumber: row.sumber as MentorMateriItem["sumber"],
    createdAt: row.created_at as string,
  }));
}
