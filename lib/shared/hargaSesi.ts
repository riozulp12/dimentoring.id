/**
 * Rumus HARGA berdasarkan jumlah sesi yang dipilih (kelas private ONLINE).
 *
 * Fungsi MURNI: tanpa impor database/server, tanpa "server-only", tanpa efek samping — supaya kartu
 * kelas, checkout, dan pembayaran memakai SATU rumus yang sama. Semua nilai bilangan bulat rupiah/sesi.
 * Pembulatan ke rupiah terdekat HANYA lewat `bulatkan`; pembulatan ke kelipatan Rp1.000 (harga turunan)
 * hanya lewat `hargaCharm`.
 *
 * `hargaNormal` di semua fungsi file ini = HARGA TERCANTUM kelas: `kelas.harga` apa adanya (diketik admin,
 * mis. 899.000 — harga paket penuh yang tampil ke siswa SEBELUM diskon kelas). Tidak ada pengurangan otomatis.
 * Dasar honor juga harga ini.
 *
 * Aturan:
 * - Total sesi dipilih (N) default = jumlahSesiKelas, boleh turun sampai 1, naik sampai 2 x jumlahSesiKelas.
 * - Tiap subtes (maks. 3) butuh minimal 1 sesi, jadi N tidak boleh kurang dari jumlahSubtes.
 * - N == dasar : hargaDasar = hargaAktif (harga setelah diskon kelas).
 * - N  > dasar : hargaAktif + (N - dasar) x hargaPerSesi (tambahan TANPA diskon), lalu harga charm.
 * - N  < dasar : paket kecil, TANPA diskon kelas; N x (hargaPerSesi + premiumPerSesi), dengan premium
 *                per sesi maksimal PREMIUM_MAKS_PER_SESI, dibatasi batas atas supaya tidak pernah
 *                menyamai/melebihi paket penuh. Hasilnya lalu harga charm.
 * - Harga charm (semua N selain paket penuh): dibulatkan ke kelipatan Rp1.000 terdekat (setengah ke atas),
 *   lalu dikurangi CHARM_POTONGAN. Paket penuh TIDAK diubah: harganya hargaAktif persis.
 * - Diskon kelas & kode promo hanya berlaku untuk N >= dasar.
 */

/** Potongan "harga charm" (Rp1.000) untuk harga TURUNAN (paket kecil dan sesi tambahan). Paket penuh tidak diubah. */
export const CHARM_POTONGAN = 1000;

/**
 * Harga charm untuk harga turunan: kelipatan Rp1.000 terdekat (setengah ke atas) dikurangi CHARM_POTONGAN.
 * Bila hasilnya tidak positif (harga absurd kecil), harga dikembalikan apa adanya.
 */
export function hargaCharm(harga: number): number {
  const ribuan = Math.floor((harga + 500) / 1000) * 1000;
  const hasil = ribuan - CHARM_POTONGAN;
  return hasil > 0 ? hasil : harga;
}

export const SESI_MIN_TOTAL = 1;
/** Total sesi maksimal = FAKTOR_SESI_MAKS x jumlahSesiKelas. */
export const FAKTOR_SESI_MAKS = 2;
export const SUBTES_MIN = 1;
export const SUBTES_MAKS = 3;

/** Premium per sesi paket kecil TIDAK BOLEH melebihi ini (rupiah), berapa pun harga kelasnya. */
export const PREMIUM_MAKS_PER_SESI = 15000;

/**
 * Tier premium paket kecil (N < jumlahSesiKelas), berbasis persentase N terhadap jumlahSesiKelas.
 * Premium dalam PER MIL dari hargaPerSesi (150 = 15%), bilangan bulat supaya tanpa pecahan.
 * Urut naik; baris pertama yang `sampaiPersen`-nya >= persentase N yang dipakai.
 */
export const TIER_PREMIUM_PAKET_KECIL: readonly { sampaiPersen: number; premiumPerMil: number }[] = [
  { sampaiPersen: 30, premiumPerMil: 150 },
  { sampaiPersen: 60, premiumPerMil: 75 },
];
/** Premium (per mil) bila N di atas semua tier (tetap di bawah 100%). */
export const PREMIUM_PER_MIL_DEFAULT = 0;

export interface InputHargaSesi {
  /** kelas.harga (harga normal, sebelum diskon). */
  hargaNormal: number;
  /** Harga setelah diskon kelas. */
  hargaAktif: number;
  /** kelas.jumlah_sesi (paket dasar). */
  jumlahSesiKelas: number;
  /** Total sesi yang dipilih siswa di checkout. */
  jumlahSesiDipilih: number;
  /** Banyak subtes yang dipilih (1..3). */
  jumlahSubtes: number;
}

export interface HasilHargaValid {
  valid: true;
  sesiTotal: number;
  /** max(0, sesiTotal - jumlahSesiKelas). */
  sesiTambahan: number;
  hargaPerSesi: number;
  /** Paket penuh/lebih: hargaAktif. Paket kecil: harga akhirnya (sudah harga charm). */
  hargaDasar: number;
  /** totalSebelumPromo - hargaDasar (sudah termasuk harga charm); 0 untuk paket kecil dan penuh. */
  biayaSesiTambahan: number;
  /** Harga yang dibayar siswa sebelum kode promo — angka SAMA untuk kartu dan checkout. */
  totalSebelumPromo: number;
  diskonKelasBerlaku: boolean;
  kodePromoBerlaku: boolean;
  /** true bila paket kecil dibatasi batas atas (rumus d), bukan harga mentah. */
  batasAtasAktif: boolean;
}

export interface HasilHargaGalat {
  valid: false;
  galat: string;
}

export type HasilHarga = HasilHargaValid | HasilHargaGalat;

/** SATU-SATUNYA pembulat ke rupiah terdekat. */
export function bulatkan(nilai: number): number {
  return Math.round(nilai);
}

/** Premium per sesi (rupiah) untuk paket kecil: min(bulatkan(hargaPerSesi x permil / 1000), PREMIUM_MAKS_PER_SESI). */
export function premiumPerSesiPaketKecil(sesiDipilih: number, jumlahSesiKelas: number, hargaPerSesi: number): number {
  let perMil = PREMIUM_PER_MIL_DEFAULT;
  for (const baris of TIER_PREMIUM_PAKET_KECIL) {
    // sesi/dasar <= sampai/100, dihitung tanpa pecahan.
    if (sesiDipilih * 100 <= baris.sampaiPersen * jumlahSesiKelas) {
      perMil = baris.premiumPerMil;
      break;
    }
  }
  return Math.min(bulatkan((hargaPerSesi * perMil) / 1000), PREMIUM_MAKS_PER_SESI);
}

const bulat = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

function validasiDasar(input: {
  hargaNormal: number;
  hargaAktif: number;
  jumlahSesiKelas: number;
}): string | null {
  const { hargaNormal, hargaAktif, jumlahSesiKelas } = input;
  if (!bulat(hargaNormal) || !bulat(hargaAktif) || !bulat(jumlahSesiKelas)) {
    return "Harga dan jumlah sesi harus bilangan bulat.";
  }
  if (jumlahSesiKelas <= 0) return "Jumlah sesi kelas harus lebih dari 0.";
  if (hargaNormal <= 0 || hargaAktif <= 0) return "Harga kelas harus lebih dari 0.";
  if (hargaAktif > hargaNormal) return "Harga setelah diskon tidak boleh melebihi harga normal.";
  return null;
}

/** Hitung harga untuk satu pilihan jumlah sesi. Tidak melempar; galat dikembalikan sebagai nilai. */
export function hitungHargaSesi(input: InputHargaSesi): HasilHarga {
  const { hargaNormal, hargaAktif, jumlahSesiKelas, jumlahSesiDipilih, jumlahSubtes } = input;

  const galatDasar = validasiDasar({ hargaNormal, hargaAktif, jumlahSesiKelas });
  if (galatDasar) return { valid: false, galat: galatDasar };
  if (!bulat(jumlahSesiDipilih) || !bulat(jumlahSubtes)) {
    return { valid: false, galat: "Jumlah sesi dan jumlah subtes harus bilangan bulat." };
  }
  if (jumlahSubtes < SUBTES_MIN || jumlahSubtes > SUBTES_MAKS) {
    return { valid: false, galat: `Jumlah subtes harus ${SUBTES_MIN} sampai ${SUBTES_MAKS}.` };
  }
  const sesiMaks = FAKTOR_SESI_MAKS * jumlahSesiKelas;
  if (jumlahSesiDipilih < SESI_MIN_TOTAL || jumlahSesiDipilih > sesiMaks) {
    return { valid: false, galat: `Total sesi harus ${SESI_MIN_TOTAL} sampai ${sesiMaks}.` };
  }
  if (jumlahSesiDipilih < jumlahSubtes) {
    return { valid: false, galat: "Total sesi tidak boleh kurang dari jumlah subtes yang dipilih." };
  }

  const n = jumlahSesiDipilih;
  const hargaPerSesi = bulatkan(hargaNormal / jumlahSesiKelas);

  let hargaDasar: number;
  let biayaSesiTambahan = 0;
  let batasAtasAktif = false;

  if (n === jumlahSesiKelas) {
    hargaDasar = hargaAktif;
  } else if (n > jumlahSesiKelas) {
    hargaDasar = hargaAktif;
    biayaSesiTambahan = hargaCharm(hargaAktif + (n - jumlahSesiKelas) * hargaPerSesi) - hargaAktif;
  } else {
    const hargaMentah = n * (hargaPerSesi + premiumPerSesiPaketKecil(n, jumlahSesiKelas, hargaPerSesi));
    const batasAtas = bulatkan((hargaAktif * (n + jumlahSesiKelas)) / (FAKTOR_SESI_MAKS * jumlahSesiKelas));
    batasAtasAktif = batasAtas < hargaMentah;
    hargaDasar = hargaCharm(Math.min(hargaMentah, batasAtas));
  }

  const paketPenuhAtauLebih = n >= jumlahSesiKelas;
  return {
    valid: true,
    sesiTotal: n,
    sesiTambahan: Math.max(0, n - jumlahSesiKelas),
    hargaPerSesi,
    hargaDasar,
    biayaSesiTambahan,
    totalSebelumPromo: hargaDasar + biayaSesiTambahan,
    diskonKelasBerlaku: paketPenuhAtauLebih,
    kodePromoBerlaku: paketPenuhAtauLebih,
    batasAtasAktif,
  };
}

export type HargaMulaiDari = { valid: true; harga: number } | HasilHargaGalat;

/** Harga untuk kartu "Mulai dari Rp X": totalSebelumPromo untuk 1 sesi, 1 subtes. */
export function hargaMulaiDari(input: {
  hargaNormal: number;
  hargaAktif: number;
  jumlahSesiKelas: number;
}): HargaMulaiDari {
  const hasil = hitungHargaSesi({ ...input, jumlahSesiDipilih: SESI_MIN_TOTAL, jumlahSubtes: SUBTES_MIN });
  return hasil.valid ? { valid: true, harga: hasil.totalSebelumPromo } : hasil;
}

export type RincianHargaSemuaSesi = { valid: true; daftar: HasilHargaValid[] } | HasilHargaGalat;

/**
 * Daftar harga untuk N = 1..2 x jumlahSesiKelas (untuk tabel di UI). `jumlahSubtes` (default 1)
 * dipakai menyaring: hanya N >= jumlahSubtes yang valid dan ikut masuk daftar.
 */
export function rincianHargaSemuaSesi(input: {
  hargaNormal: number;
  hargaAktif: number;
  jumlahSesiKelas: number;
  jumlahSubtes?: number;
}): RincianHargaSemuaSesi {
  const { jumlahSubtes = SUBTES_MIN, ...dasar } = input;
  const galatDasar = validasiDasar(dasar);
  if (galatDasar) return { valid: false, galat: galatDasar };

  if (!bulat(jumlahSubtes) || jumlahSubtes < SUBTES_MIN || jumlahSubtes > SUBTES_MAKS) {
    return { valid: false, galat: `Jumlah subtes harus ${SUBTES_MIN} sampai ${SUBTES_MAKS}.` };
  }

  const daftar: HasilHargaValid[] = [];
  for (let n = Math.max(SESI_MIN_TOTAL, jumlahSubtes); n <= FAKTOR_SESI_MAKS * dasar.jumlahSesiKelas; n++) {
    const hasil = hitungHargaSesi({ ...dasar, jumlahSesiDipilih: n, jumlahSubtes });
    if (!hasil.valid) return hasil;
    daftar.push(hasil);
  }
  if (daftar.length === 0) return { valid: false, galat: "Tidak ada pilihan sesi yang valid untuk jumlah subtes ini." };
  return { valid: true, daftar };
}
