/**
 * Total sesi & kuota per subtes MILIK SISWA (enrollment) — fungsi MURNI, tanpa impor database; dipakai server dan klien.
 * Kolom baru (enrollments.jumlah_sesi_total, enrollment_subtes.kuota_sesi) NULL pada data lama = perilaku lama:
 * total = kelas.jumlah_sesi dan tanpa batas per subtes. kelas.jumlah_sesi tetap KONFIGURASI kelas (harga/kapasitas/rumus),
 * bukan "total sesi milik siswa" — untuk yang kedua pakai totalSesiEnrollment.
 */

/** Total sesi milik siswa: jumlah_sesi_total ?? kelas.jumlah_sesi (null bila keduanya tidak ada). */
export function totalSesiEnrollment(
  enrollment: { jumlah_sesi_total?: number | null } | null | undefined,
  kelas: { jumlah_sesi?: number | null } | null | undefined,
): number | null {
  const total = enrollment?.jumlah_sesi_total;
  if (typeof total === "number") return total;
  const dasar = kelas?.jumlah_sesi;
  return typeof dasar === "number" ? dasar : null;
}

/** Kuota sesi subtes itu untuk siswa; null = tanpa batas per subtes (perilaku lama). */
export function kuotaSubtes(enrollmentSubtes: { kuota_sesi?: number | null } | null | undefined): number | null {
  const kuota = enrollmentSubtes?.kuota_sesi;
  return typeof kuota === "number" ? kuota : null;
}

export interface SubtesPresensi {
  subtesId: string;
  nama: string;
  /** null = tanpa batas. */
  kuota: number | null;
  /** Sesi subtes ini yang sudah ditandai mentor. */
  terpakai: number;
}

/** Kuota per subtes dianggap aktif bila minimal satu subtes siswa punya kuota_sesi terisi. */
export function kuotaAktif(subtes: { kuota: number | null }[]): boolean {
  return subtes.some((s) => s.kuota !== null);
}

/**
 * Subtes yang boleh ditandai mentor ini untuk siswa ini: subtes yang dia pegang, kecuali subtes multi-mentor
 * yang belum/bukan diterima dia (aturan sama dengan lib/mentor/mapelMentor.ts).
 */
export function kandidatSubtesMentor(
  mentorId: string,
  subtesSiswa: { subtesId: string; mentorMemegang: boolean; status: string; mentorIdPenerima: string | null }[],
): string[] {
  return subtesSiswa
    .filter((s) => s.mentorMemegang && (s.status === "tidak_perlu_klaim" || (s.status === "diterima" && s.mentorIdPenerima === mentorId)))
    .map((s) => s.subtesId);
}

export type KeputusanSubtesPresensi =
  | { ok: true; subtesId: string | null; nama: string | null }
  | { ok: false; status: number; error: string };

/**
 * Menentukan subtes yang ditandai (sesi_kelas.subtes_id) dan menegakkan kuota per subtes.
 * - Tanpa kuota terisi (data lama): { ok, subtesId: null } — tanpa batas per subtes, subtes_id tidak diisi.
 * - Satu kandidat: otomatis. Lebih dari satu: mentor wajib memilih eksplisit (`dipilih`).
 * - Subtes terpilih yang kuotanya sudah habis ditolak.
 */
export function tentukanSubtesPresensi(input: {
  subtes: SubtesPresensi[];
  kandidatIds: string[];
  dipilih: unknown;
}): KeputusanSubtesPresensi {
  const { subtes, kandidatIds, dipilih } = input;
  if (!kuotaAktif(subtes)) return { ok: true, subtesId: null, nama: null };

  const kandidat = subtes.filter((s) => kandidatIds.includes(s.subtesId));
  if (kandidat.length === 0) {
    return { ok: false, status: 400, error: "Kamu belum memegang subtes siswa ini, jadi belum bisa menandai sesinya." };
  }

  let terpilih: SubtesPresensi | undefined;
  if (dipilih !== undefined && dipilih !== null && dipilih !== "") {
    terpilih = typeof dipilih === "string" ? kandidat.find((s) => s.subtesId === dipilih) : undefined;
    if (!terpilih) return { ok: false, status: 400, error: "Subtes yang dipilih tidak sesuai dengan subtes yang kamu pegang untuk siswa ini." };
  } else if (kandidat.length === 1) {
    terpilih = kandidat[0];
  } else {
    return { ok: false, status: 400, error: "Pilih dulu subtes yang kamu ajarkan di sesi ini." };
  }

  if (terpilih.kuota !== null && terpilih.terpakai >= terpilih.kuota) {
    return {
      ok: false,
      status: 400,
      error: `Jatah sesi ${terpilih.nama} untuk siswa ini sudah habis (${terpilih.kuota} sesi). Pilih subtes lain atau hubungi Admin.`,
    };
  }
  return { ok: true, subtesId: terpilih.subtesId, nama: terpilih.nama };
}
