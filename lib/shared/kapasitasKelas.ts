/**
 * Kapasitas kelas — SATU aturan untuk UI ("Kelas Penuh", badge "Hampir habis") dan server
 * (payment/create). Fungsi murni (tanpa DB/React).
 *
 * ARTI `kelas.kapasitas` (kolom ini OPSIONAL):
 *  - Kelas PRIVATE-online-saklar-1subtes (kelas yang memakai slot, lib/shared/slotTerisi.ts):
 *    kapasitas dihitung OTOMATIS = jumlah slot × mentor aktif pemegang subtes. `sisa` = kursi slot
 *    yang masih kosong. Kalau Admin mengisi kapasitas manual, yang berlaku adalah YANG LEBIH KECIL:
 *      batas = min(otomatis, manual); sisa = min(sisa otomatis, manual − jumlah lunas).
 *    Jadi bila kapasitas manual lebih kecil dari slot × mentor, kapasitas MANUAL menang (Admin sengaja
 *    membatasi); bila lebih besar, slot × mentor yang menang (tidak mungkin melebihi jam mentor).
 *  - Kelas LAIN (grup, semi-private, paket, offline, dll.): kapasitas = jumlah siswa maksimal. Kosong/null
 *    = TIDAK TERBATAS (tanpa badge, tidak pernah penuh); terisi = aturan lama (lunas >= kapasitas = penuh).
 */

/** Badge "Hampir habis" muncul bila sisa kursi <= angka ini. SATU-SATUNYA definisi. */
export const BATAS_HAMPIR_HABIS = 5;

export interface HasilSlotOtomatis {
  /** slot × mentor aktif. */
  kapasitas: number;
  /** Kursi slot yang masih kosong. */
  sisa: number;
}

export interface InputKapasitasKelas {
  /** kelas.kapasitas — null/undefined = kosong. */
  kapasitasManual: number | null | undefined;
  /** Jumlah enrollment LUNAS kelas ini. */
  lunas: number;
  /** Hasil hitungan slot (null = kelas ini tidak memakai aturan slot). */
  otomatis: HasilSlotOtomatis | null;
}

export interface KapasitasKelas {
  /** false = tanpa batas → tidak ada badge, tidak pernah penuh. */
  terbatas: boolean;
  /** Batas efektif; null bila tidak terbatas. */
  kapasitas: number | null;
  /** Jumlah siswa lunas (angka nyata). */
  terisi: number;
  /** Kursi yang masih bisa dibeli; null bila tidak terbatas. */
  sisa: number | null;
  penuh: boolean;
  /** terbatas && 0 < sisa <= BATAS_HAMPIR_HABIS. */
  hampirHabis: boolean;
  /**
   * Overlay status (BUKAN hasil hitungan kapasitas): Admin menutup pendaftaran kelas (kelas.pendaftaran_ditutup).
   * Hanya diset (true) oleh lapisan data kartu/detail lewat `tandaiPendaftaranDitutup`; tidak ada = terbuka.
   * Dipakai badge & tombol daftar; server memeriksa kolomnya sendiri (payment/create, validate-promo).
   */
  ditutup?: boolean;
}

function angkaValid(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function hitungKapasitasKelas(input: InputKapasitasKelas): KapasitasKelas {
  const lunas = Math.max(0, Math.floor(input.lunas));
  const manual = angkaValid(input.kapasitasManual) ? input.kapasitasManual : null;

  let kapasitas: number | null;
  let sisa: number | null;

  if (input.otomatis) {
    const sisaOtomatis = Math.max(0, input.otomatis.sisa);
    kapasitas = manual === null ? input.otomatis.kapasitas : Math.min(input.otomatis.kapasitas, manual);
    sisa = manual === null ? sisaOtomatis : Math.min(sisaOtomatis, manual - lunas);
  } else if (manual !== null) {
    kapasitas = manual;
    sisa = manual - lunas;
  } else {
    return { terbatas: false, kapasitas: null, terisi: lunas, sisa: null, penuh: false, hampirHabis: false };
  }

  sisa = Math.max(0, sisa);
  const penuh = sisa <= 0;
  return {
    terbatas: true,
    kapasitas,
    terisi: lunas,
    sisa,
    penuh,
    hampirHabis: !penuh && sisa <= BATAS_HAMPIR_HABIS,
  };
}

/** Lencana kartu/detail kelas yang pendaftarannya ditutup Admin (menggantikan "Hampir habis"). */
export const TEKS_BADGE_DITUTUP = "Pendaftaran ditutup";

/** Tandai hasil kapasitas bila pendaftaran kelas ditutup (kelas.pendaftaran_ditutup); selain itu dikembalikan apa adanya. */
export function tandaiPendaftaranDitutup(info: KapasitasKelas, ditutup: boolean | null | undefined): KapasitasKelas {
  return ditutup === true ? { ...info, ditutup: true } : info;
}

/** Teks badge dari hasil di atas (null = tidak ada badge). Semua angka dari hasil fungsi. */
export function teksBadgeKapasitas(info: KapasitasKelas): string | null {
  if (info.ditutup) return TEKS_BADGE_DITUTUP;
  if (!info.terbatas) return null;
  if (info.penuh) return "Penuh";
  if (info.hampirHabis && info.sisa !== null) return `Hampir habis · sisa ${info.sisa}`;
  return null;
}

/**
 * Penuh menurut kapasitas MANUAL saja (kolom kosong = tidak pernah penuh). Dipakai jalur yang hanya
 * mengenal kapasitas manual: pendaftaran manual Admin (app/api/admin/enrollment-manual + fungsi SQL
 * daftar_siswa_manual, yang membandingkan `lunas >= kapasitas` dan NULL = tidak penuh) dan header halaman
 * Pendaftar. Katalog, detail, checkout, dan payment/create memakai hitungKapasitasKelas.
 */
export function penuhMenurutKapasitasManual(kapasitas: number | null | undefined, lunas: number): boolean {
  return angkaValid(kapasitas) && lunas >= kapasitas;
}
