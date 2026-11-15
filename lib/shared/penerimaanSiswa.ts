/**
 * Aturan penerimaan siswa PER SUBTES — logika murni (tanpa DB), aman dipakai
 * server maupun UI. Keputusan Rio: subtes yang dipegang >1 mentor AKTIF pada
 * kelas yang sama → siswa dimiliki mentor yang MENERIMA lebih dulu (siapa
 * cepat dia dapat). Subtes dengan <=1 mentor aktif → pemegangnya langsung
 * boleh (perilaku lama, tidak ada klaim).
 *
 * Tanpa hook pembayaran: "menunggu" TIDAK disimpan, melainkan dihitung saat
 * baca dari (penerima di enrollment_subtes, pemegang aktif saat ini, tanggal daftar).
 */

/** Batas jam siswa boleh "menunggu penerima" sebelum Admin perlu turun tangan (B4). */
export const BATAS_JAM_TANPA_PENERIMA = 24;

/**
 * Pendaftaran SEBELUM saat ini = siswa lama: perilaku lama dipertahankan
 * (semua pemegang subtes tetap boleh menandai sesi, tidak ada klaim).
 * 15 Nov 2026 00:00 WIB.
 */
export const TANGGAL_PEMBERLAKUAN_PENERIMAAN = "2026-11-15T00:00:00+07:00";

/**
 * FAIL-CLOSED (keputusan Rio): bila data yang dibutuhkan penjaga presensi gagal
 * dibaca, mentor DITOLAK menandai sesi — honor dibayar atas penanda sesi, jadi
 * lebih baik menolak sementara daripada membayar penanda yang salah.
 */
export const BOLEH_MENANDAI_BILA_DATA_GAGAL = false;

export type StatusPenerimaanSubtes = "tidak_perlu_klaim" | "menunggu" | "diterima";

/** Daftar id mentor unik — duplikat (data ganda) tidak boleh dihitung dua kali. */
function unik(mentorAktifSubtes: string[]): string[] {
  return Array.from(new Set(mentorAktifSubtes.filter((id) => id)));
}

/** true bila ada >1 mentor aktif yang memegang subtes ini → perlu tombol "Terima siswa". */
export function perluKlaim(mentorAktifSubtes: string[]): boolean {
  return unik(mentorAktifSubtes).length > 1;
}

/** id mentor bila TEPAT 1 mentor aktif; selain itu (0 atau >1) null. */
export function penerimaOtomatis(mentorAktifSubtes: string[]): string | null {
  const daftar = unik(mentorAktifSubtes);
  return daftar.length === 1 ? daftar[0] : null;
}

/**
 * true bila pendaftaran SEBELUM tanggal pemberlakuan (siswa lama). Tanggal
 * kosong/tidak terbaca → false: diperlakukan sebagai pendaftaran BARU (ketat,
 * searah fail-closed). Sama dengan batas: tepat di 15 Nov 00:00 WIB = baru.
 */
export function sebelumPemberlakuan(tanggalDaftar: string | Date | null | undefined): boolean {
  if (tanggalDaftar === null || tanggalDaftar === undefined) return false;
  const waktu = tanggalDaftar instanceof Date ? tanggalDaftar.getTime() : Date.parse(tanggalDaftar);
  if (Number.isNaN(waktu)) return false;
  return waktu < Date.parse(TANGGAL_PEMBERLAKUAN_PENERIMAAN);
}

export interface InputStatusPenerimaan {
  /** enrollment_subtes.mentor_id — NULL = belum ada penerima. */
  mentorIdPenerima: string | null;
  /** Mentor AKTIF yang saat ini memegang subtes itu di kelas itu (kelas_subtes_mentor ∩ user_roles aktif). */
  mentorAktifSubtes: string[];
  /** enrollments.tanggal_daftar. */
  tanggalDaftar: string | Date | null | undefined;
}

/**
 * Status penerimaan satu subtes seorang siswa, dengan pemilik EFEKTIF:
 *  - siswa lama (sebelum tanggal pemberlakuan) → "tidak_perlu_klaim"
 *  - pemegang aktif <=1 → "tidak_perlu_klaim" (pemegangnya langsung boleh)
 *  - pemegang aktif >=2: penerima ada DAN masih pemegang aktif → "diterima";
 *    selain itu → "menunggu". Penerima yang dinonaktifkan atau dilepas dari
 *    pasangan Subtes-Mentor otomatis TIDAK dihitung lagi sebagai pemilik.
 */
export function statusPenerimaanSubtes(input: InputStatusPenerimaan): StatusPenerimaanSubtes {
  if (sebelumPemberlakuan(input.tanggalDaftar)) return "tidak_perlu_klaim";
  const aktif = unik(input.mentorAktifSubtes);
  if (aktif.length <= 1) return "tidak_perlu_klaim";
  if (input.mentorIdPenerima && aktif.includes(input.mentorIdPenerima)) return "diterima";
  return "menunggu";
}

export interface SubtesSiswaPenerimaan {
  status: StatusPenerimaanSubtes;
  /** Apakah mentor yang ditanya memegang subtes ini (aktif) di kelas ini. */
  mentorMemegang: boolean;
  /** enrollment_subtes.mentor_id untuk subtes ini. */
  mentorIdPenerima: string | null;
}

/**
 * Penjaga presensi: boleh tidaknya mentor menandai sesi siswa ini.
 * Diblokir HANYA bila mentor memegang >=1 subtes siswa dan SEMUA subtes yang dia
 * pegang berstatus "menunggu" atau "diterima" mentor lain. Selain itu boleh:
 *  - ada subtes yang dia pegang berstatus "tidak_perlu_klaim", atau
 *  - ada subtes yang sudah dia terima, atau
 *  - dia tidak memegang subtes siswa itu sama sekali (akses lewat kelas_mentor/
 *    offline — perilaku lama, di luar lingkup aturan ini).
 * "gagal" (data tidak terbaca) → DITOLAK (fail-closed).
 */
export function bolehMenandaiSesi(input: { mentorId: string; subtesSiswa: SubtesSiswaPenerimaan[] | "gagal" }): boolean {
  if (input.subtesSiswa === "gagal") return BOLEH_MENANDAI_BILA_DATA_GAGAL;
  const dipegang = input.subtesSiswa.filter((s) => s.mentorMemegang);
  if (dipegang.length === 0) return true;
  return dipegang.some(
    (s) => s.status === "tidak_perlu_klaim" || (s.status === "diterima" && s.mentorIdPenerima === input.mentorId),
  );
}

export type AlasanBlokirPenerimaan = "menunggu_penerimaan" | "diterima_mentor_lain" | "data_gagal";

/**
 * Alasan yang bisa dibedakan saat bolehMenandaiSesi = false (null = boleh).
 * "menunggu_penerimaan": ada subtes yang dia pegang yang belum diterima siapa pun;
 * "diterima_mentor_lain": semua subtes yang dia pegang sudah diterima mentor lain.
 * "gagal" → "data_gagal" (fail-closed).
 */
export function alasanDiblokirPenerimaan(input: {
  mentorId: string;
  subtesSiswa: SubtesSiswaPenerimaan[] | "gagal";
}): AlasanBlokirPenerimaan | null {
  if (input.subtesSiswa === "gagal") return "data_gagal";
  if (bolehMenandaiSesi(input)) return null;
  const dipegang = input.subtesSiswa.filter((s) => s.mentorMemegang);
  return dipegang.some((s) => s.status === "menunggu") ? "menunggu_penerimaan" : "diterima_mentor_lain";
}
