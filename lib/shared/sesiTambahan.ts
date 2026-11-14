/**
 * Rumus & validasi SESI TAMBAHAN per subtes (kelas private ONLINE).
 *
 * Fungsi MURNI: tanpa impor database/server, tanpa "server-only" — supaya nanti
 * UI checkout (pratinjau harga) dan server (hitung ulang) memakai kode yang
 * SAMA. File ini belum dipakai di kode lain; hanya rumus dan tesnya.
 *
 * Ketentuan (keputusan Rio, 14 Nov 2026):
 * - Total sesi dasar = kelas.jumlah_sesi; total yang dipilih TIDAK boleh kurang.
 * - Minimal 1 sesi per subtes, maksimal 3 subtes.
 * - Harga per sesi tambahan = HARGA NORMAL kelas ÷ jumlah sesi dasar, dibulatkan
 *   ke rupiah terdekat DI SINI SAJA (per sesi dulu, lalu dikalikan — tidak
 *   dibulatkan lagi di akhir), supaya rincian "n × Rp…" selalu persis sama dengan total.
 * - Diskon kelas & kode promo hanya untuk harga dasar, bukan untuk fungsi ini.
 * - Tambahan > 0 hanya untuk kelas private ONLINE.
 */

/** Batas sesi tambahan di atas jumlah sesi dasar (total maksimum = dasar + 10). */
export const MAKS_SESI_TAMBAHAN = 10;

/** Batas subtes yang boleh dipilih dalam satu kelas. */
export const MAKS_SUBTES = 3;

export interface PilihanSesiSubtes {
  subtesId: string;
  jumlahSesi: number;
}

export interface InputValidasiPilihanSesi {
  /** kelas.tipe_kelas: "private" | "semi_private" | "grouping". */
  jenisKelas: string;
  /** kelas.mode_pembelajaran: "online" | "offline". */
  modeKelas: string;
  /** kelas.jumlah_sesi. */
  jumlahSesiDasar: number;
  pilihan: PilihanSesiSubtes[];
}

export type HasilValidasiPilihanSesi = { ok: true } | { ok: false; error: string };

function bilanganBulatPositif(nilai: unknown): nilai is number {
  return typeof nilai === "number" && Number.isInteger(nilai) && nilai > 0;
}

/**
 * Harga satu sesi tambahan: round(hargaNormal / jumlahSesiDasar). Hasil selalu
 * bilangan bulat. Melempar RangeError untuk masukan yang tidak masuk akal
 * (harga negatif/bukan angka, dasar bukan bilangan bulat positif) supaya
 * tagihan tidak pernah dihitung diam-diam dari data rusak.
 */
export function hargaPerSesiTambahan(hargaNormal: number, jumlahSesiDasar: number): number {
  if (typeof hargaNormal !== "number" || !Number.isFinite(hargaNormal) || hargaNormal < 0) {
    throw new RangeError("Harga normal harus angka tidak negatif.");
  }
  if (!bilanganBulatPositif(jumlahSesiDasar)) {
    throw new RangeError("Jumlah sesi dasar harus bilangan bulat positif.");
  }
  return Math.round(hargaNormal / jumlahSesiDasar);
}

/**
 * Biaya seluruh sesi tambahan: hargaPerSesi (sudah dibulatkan) × (totalSesi − dasar).
 * Tidak ada pembulatan lagi di akhir. totalSesi harus bilangan bulat ≥ dasar;
 * selain itu melempar RangeError (validasi batas atas ada di validasiPilihanSesi).
 */
export function hitungBiayaSesiTambahan(input: {
  hargaNormal: number;
  jumlahSesiDasar: number;
  totalSesi: number;
}): number {
  const { hargaNormal, jumlahSesiDasar, totalSesi } = input;
  const perSesi = hargaPerSesiTambahan(hargaNormal, jumlahSesiDasar);
  if (!bilanganBulatPositif(totalSesi) || totalSesi < jumlahSesiDasar) {
    throw new RangeError("Total sesi harus bilangan bulat dan tidak boleh kurang dari jumlah sesi dasar.");
  }
  return perSesi * (totalSesi - jumlahSesiDasar);
}

/**
 * Validasi pilihan jumlah sesi per subtes. Mengembalikan {ok:true} atau
 * {ok:false, error} dengan pesan bahasa Indonesia sehari-hari. Tidak melempar.
 */
export function validasiPilihanSesi(input: InputValidasiPilihanSesi): HasilValidasiPilihanSesi {
  const { jenisKelas, modeKelas, jumlahSesiDasar, pilihan } = input;

  if (!bilanganBulatPositif(jumlahSesiDasar)) {
    return { ok: false, error: "Jumlah sesi dasar kelas tidak valid." };
  }
  if (!Array.isArray(pilihan) || pilihan.length === 0) {
    return { ok: false, error: "Pilih minimal 1 subtes." };
  }
  if (pilihan.length > MAKS_SUBTES) {
    return { ok: false, error: `Pilih maksimal ${MAKS_SUBTES} subtes.` };
  }

  const subtesTerlihat = new Set<string>();
  let total = 0;
  for (const item of pilihan) {
    if (!item || typeof item.subtesId !== "string" || item.subtesId.trim() === "") {
      return { ok: false, error: "Subtes yang dipilih tidak valid." };
    }
    if (subtesTerlihat.has(item.subtesId)) {
      return { ok: false, error: "Satu subtes tidak boleh dipilih lebih dari sekali." };
    }
    subtesTerlihat.add(item.subtesId);
    if (!bilanganBulatPositif(item.jumlahSesi)) {
      return { ok: false, error: "Jumlah sesi tiap subtes harus bilangan bulat, minimal 1." };
    }
    total += item.jumlahSesi;
  }

  if (total < jumlahSesiDasar) {
    return { ok: false, error: `Total sesi tidak boleh kurang dari ${jumlahSesiDasar}.` };
  }

  const tambahan = total - jumlahSesiDasar;
  if (tambahan > MAKS_SESI_TAMBAHAN) {
    return { ok: false, error: `Sesi tambahan maksimal ${MAKS_SESI_TAMBAHAN}.` };
  }
  if (tambahan > 0 && !(jenisKelas === "private" && modeKelas === "online")) {
    return { ok: false, error: "Sesi tambahan hanya tersedia untuk kelas private online." };
  }

  return { ok: true };
}
