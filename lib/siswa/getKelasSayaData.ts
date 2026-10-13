import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { formatJadwal } from "@/lib/shared/formatJadwal";
import { formatJadwalSiswaTerdaftar } from "@/lib/shared/jadwalPilihan";
import { hitungProgresSesi, hitungSesiTerkonfirmasi, type SesiStatusRow } from "@/lib/shared/progresSesi";
import {
  queryKelasKatalog,
  toCardPreviewList,
  type KelasCardPreview,
  type KelasCardRow,
} from "@/lib/dashboard/getProgramData";

/**
 * Data layer halaman "Kelas Saya" — PRD Bagian 7.5 & Bagian 13 (enrollments,
 * kelas, user_mapel_tersulit). Dua fungsi terpisah: kelas yang sudah diikuti
 * (lunas, variant "dimiliki" di KelasCardVisual) vs rekomendasi kelas yang
 * belum diikuti (variant "jual" — treatment SAMA PERSIS seperti /program,
 * makanya bentuknya KelasCardPreview & reuse helper diskon/sisa-slot dari
 * lib/dashboard/getProgramData.ts, bukan tipe/logic terpisah sendiri).
 *
 * Progress di halaman ini = Progress KEHADIRAN (sesi terkonfirmasi /
 * jumlah_sesi, lib/shared/progresSesi.ts) — identik dengan "Progress
 * Kehadiran" di detail kelas. enrollments.progres_persen (progres MATERI)
 * SENGAJA tidak dibaca di sini, jadi menambah materi tidak mengubah angkanya.
 */

export interface KelasSayaItem {
  id: string;
  nama: string;
  mentorNama: string | null;
  /** Kelas dengan Pilihan Jadwal (PRD 7.5.8): "Menunggu penetapan jadwal" /
   * "Jadwal: <slot>"; kelas biasa: semua slot (formatJadwal). */
  jadwal: string;
  /** Progress Kehadiran 0-100 (dibulatkan) — 0 kalau enrollment ini belum
   * punya baris sesi_kelas. */
  progresPersen: number;
  /** progresPersen 100 DAN kelas.jumlah_sesi > 0. */
  selesai: boolean;
  programKategori: string;
  tingkatKelas: string;
  subtesNama: string | null;
  modePembelajaran: string;
}

type MentorJoin = { nama: string } | { nama: string }[] | null;

function resolveMentorNama(mentor: MentorJoin): string | null {
  if (!mentor) return null;
  const row = Array.isArray(mentor) ? mentor[0] : mentor;
  return row?.nama ?? null;
}

type SubtesJoin = { nama: string } | { nama: string }[] | null;

function resolveSubtesNama(subtes: SubtesJoin): string | null {
  if (!subtes) return null;
  const row = Array.isArray(subtes) ? subtes[0] : subtes;
  return row?.nama ?? null;
}

/** "Kelas Saya" — enrollments lunas milik siswa ini, JOIN kelas + mentor. */
export async function getKelasSaya(userId: string): Promise<KelasSayaItem[]> {
  const { data, error } = await supabaseServer
    .from("enrollments")
    .select(
      "id, jadwal_ditetapkan, kelas:kelas_id(id, nama, jadwal, jadwal_pilih_siswa, jumlah_sesi, program_kategori, tingkat_kelas, mode_pembelajaran, subtes:subtes_id(nama), mentor:mentor_id(nama))",
    )
    .eq("user_id", userId)
    .eq("status_pembayaran", "lunas");

  if (error) {
    console.error("[getKelasSaya] query failed:", error);
    return [];
  }

  type KelasJoin = {
    id: string;
    nama: string;
    jadwal: unknown;
    jadwal_pilih_siswa: boolean | null;
    jumlah_sesi: number | null;
    program_kategori: string;
    tingkat_kelas: string;
    mode_pembelajaran: string;
    subtes: SubtesJoin;
    mentor: MentorJoin;
  };
  type Row = { id: string; jadwal_ditetapkan: unknown; kelas: KelasJoin | KelasJoin[] | null };
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];

  const { data: sesiData, error: sesiError } = await supabaseServer
    .from("sesi_kelas")
    .select("enrollment_id, dikonfirmasi_mentor, status_siswa")
    .in(
      "enrollment_id",
      rows.map((row) => row.id),
    );

  if (sesiError) {
    console.error("[getKelasSaya] query sesi_kelas failed:", sesiError);
  }

  const sesiByEnrollment = new Map<string, SesiStatusRow[]>();
  for (const sesi of (sesiData ?? []) as unknown as (SesiStatusRow & { enrollment_id: string })[]) {
    const list = sesiByEnrollment.get(sesi.enrollment_id) ?? [];
    list.push(sesi);
    sesiByEnrollment.set(sesi.enrollment_id, list);
  }

  return rows
    .map((row) => {
      const kelas = Array.isArray(row.kelas) ? row.kelas[0] : row.kelas;
      if (!kelas) return null;
      const progres = hitungProgresSesi(
        hitungSesiTerkonfirmasi(sesiByEnrollment.get(row.id) ?? []),
        kelas.jumlah_sesi ?? 0,
      );
      return {
        id: kelas.id,
        nama: kelas.nama,
        mentorNama: resolveMentorNama(kelas.mentor),
        jadwal:
          formatJadwalSiswaTerdaftar(
            {
              jadwalPilihSiswa: kelas.jadwal_pilih_siswa === true,
              modePembelajaran: kelas.mode_pembelajaran,
              jadwal: kelas.jadwal,
            },
            row.jadwal_ditetapkan,
          ) ?? formatJadwal(kelas.jadwal),
        progresPersen: progres.persen,
        selesai: progres.selesai,
        programKategori: kelas.program_kategori,
        tingkatKelas: kelas.tingkat_kelas,
        subtesNama: resolveSubtesNama(kelas.subtes),
        modePembelajaran: kelas.mode_pembelajaran,
      };
    })
    .filter((item): item is KelasSayaItem => item !== null);
}

const MAX_REKOMENDASI = 6;

/**
 * "Rekomendasi Kelas" — kelas katalog yang BELUM diikuti siswa sama sekali,
 * maks 6, diurutkan slot tersisa terbanyak. Prioritas: kelas yang subtes-nya
 * termasuk mapel_tersulit siswa DAN tingkat_kelas cocok. Kalau itu kosong
 * (siswa belum isi mapel tersulit/tingkat kelas, atau memang tidak ada yang
 * cocok), FALLBACK ke kelas katalog lain yang belum diikuti — section baru
 * disembunyikan (array kosong) kalau benar-benar tidak ada kelas yang bisa
 * ditawarkan. Bentuk hasil PERSIS KelasCardPreview (dipakai
 * KelasCardFrame+KelasCardMeta yang sama dengan /program) karena kelas di
 * sini memang belum dibeli — treatment jualan lengkap tetap relevan.
 */
export async function getRekomendasiKelas(
  userId: string,
  tingkatKelas: string | null,
): Promise<KelasCardPreview[]> {
  const [enrolledRes, mapelRes] = await Promise.all([
    supabaseServer.from("enrollments").select("kelas_id").eq("user_id", userId),
    supabaseServer.from("user_mapel_tersulit").select("subtes_id").eq("user_id", userId),
  ]);

  if (enrolledRes.error) {
    console.error("[getRekomendasiKelas] query enrollments failed:", enrolledRes.error);
    return [];
  }
  if (mapelRes.error) {
    console.error("[getRekomendasiKelas] query user_mapel_tersulit failed:", mapelRes.error);
  }

  const enrolledKelasIds = new Set((enrolledRes.data ?? []).map((row) => row.kelas_id as string));
  const subtesIds = (mapelRes.data ?? []).map((row) => row.subtes_id as string);
  const belumDiikuti = (rows: unknown) =>
    ((rows ?? []) as KelasCardRow[]).filter((row) => !enrolledKelasIds.has(row.id));

  let candidates: KelasCardRow[] = [];
  if (tingkatKelas && subtesIds.length > 0) {
    const { data, error } = await queryKelasKatalog().eq("tingkat_kelas", tingkatKelas).in("subtes_id", subtesIds);
    if (error) {
      console.error("[getRekomendasiKelas] query kelas (mapel tersulit) failed:", error);
    }
    candidates = belumDiikuti(data);
  }

  if (candidates.length === 0) {
    const { data, error } = await queryKelasKatalog();
    if (error) {
      console.error("[getRekomendasiKelas] query kelas (fallback) failed:", error);
      return [];
    }
    candidates = belumDiikuti(data);
  }

  const previews = await toCardPreviewList(candidates);
  return previews.sort((a, b) => b.sisaSlot - a.sisaSlot).slice(0, MAX_REKOMENDASI);
}
