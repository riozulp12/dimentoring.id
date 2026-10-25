/**
 * Susunan halaman "Studio Soal" mentor (PR 3a). Modul MURNI — data diambil
 * lib/mentor/getStudioSoalData.ts.
 *
 * Soal dikelompokkan per subtes yang DITUGASKAN. Soal milik mentor di subtes
 * yang penugasannya sudah dicabut tetap ditampilkan (baca-saja) di kelompok
 * terpisah: mencabut penugasan tidak menghapus soal.
 */
import { urutkanSubtes } from "./penugasan";

export const STATUS_SOAL = ["draf", "diajukan", "terpublikasi", "ditolak", "digantikan", "diarsipkan"] as const;
export type StatusSoal = (typeof STATUS_SOAL)[number];

export const LABEL_STATUS_SOAL: Record<StatusSoal, string> = {
  draf: "Draf",
  diajukan: "Menunggu tinjauan",
  terpublikasi: "Terpublikasi",
  ditolak: "Ditolak",
  digantikan: "Versi lama",
  diarsipkan: "Diarsipkan",
};

export const LABEL_TIPE_SOAL: Record<string, string> = {
  pilihan_ganda: "Pilihan ganda",
  majemuk_kompleks: "Pilihan majemuk kompleks",
  isian: "Isian",
};

export interface SoalRingkas {
  id: string;
  subtesId: string;
  tipe: string;
  status: string;
  versi: number;
  redaksi: string;
  updatedAt: string;
}

export interface KelompokSubtes {
  subtesId: string;
  nama: string;
  soal: SoalRingkas[];
}

export interface StudioSoalMentorView {
  ditugaskan: KelompokSubtes[];
  /** Subtes yang tidak lagi ditugaskan tapi masih ada soal tulisan mentor ini. */
  tidakDitugaskan: KelompokSubtes[];
}

/** Ringkas redaksi untuk daftar: tanpa spasi berlebih, maks. `maks` karakter. */
export function cuplikRedaksi(redaksi: string, maks = 120): string {
  const bersih = redaksi.replace(/\s+/g, " ").trim();
  const huruf = [...bersih];
  if (huruf.length <= maks) return bersih || "(redaksi kosong)";
  return `${huruf.slice(0, maks - 1).join("").trimEnd()}…`;
}

export function susunStudioSoalMentor(
  subtesDitugaskan: { id: string; nama: string }[],
  soal: SoalRingkas[],
  namaSubtes: Map<string, string>,
): StudioSoalMentorView {
  // Versi lama (digantikan) tidak ditampilkan; yang aktif cukup versi terbaru.
  const tampil = soal
    .filter((s) => s.status !== "digantikan")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const idDitugaskan = new Set(subtesDitugaskan.map((s) => s.id));

  const ditugaskan = urutkanSubtes(subtesDitugaskan).map((s) => ({
    subtesId: s.id,
    nama: s.nama,
    soal: tampil.filter((x) => x.subtesId === s.id),
  }));

  const lainIds = [...new Set(tampil.filter((x) => !idDitugaskan.has(x.subtesId)).map((x) => x.subtesId))];
  const tidakDitugaskan = urutkanSubtes(
    lainIds.map((id) => ({ subtesId: id, nama: namaSubtes.get(id) ?? "Subtes tidak dikenal" })),
  ).map((s) => ({ ...s, soal: tampil.filter((x) => x.subtesId === s.subtesId) }));

  return { ditugaskan, tidakDitugaskan };
}
