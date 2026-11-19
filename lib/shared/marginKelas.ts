/**
 * Pagar MARGIN kelas private online — fungsi MURNI (tanpa database, tanpa "server-only", tanpa efek samping).
 * Dipakai Admin (Kelola Kelas & Kode Promo) dan nanti checkout/pembayaran, supaya satu rumus yang sama.
 *
 * Aturan:
 * - `hargaNormal` di file ini = HARGA TERCANTUM (`hargaTercantum(kelas.harga)` di hargaSesi.ts): harga paket
 *   penuh yang tampil ke siswa sebelum diskon kelas (999.000 untuk kelas yang disimpan 1.000.000).
 * - Honor per sesi kelas PRIVATE = HONOR_PRIVATE_PERSEN% x hargaPerSesi, dengan hargaPerSesi =
 *   bulatkan(hargaTercantum / jumlahSesiKelas) (999.000 / 10 sesi -> 99.900 -> honor 64.935). Dasarnya harga
 *   tercantum, BUKAN harga setelah diskon (aturan hibrida: Dimentoring menanggung diskonnya). Rujukan: PRD 7.5.3 (private 65%) dan `PERSEN_PRIVATE` di
 *   scripts/laporan-honor-v2/hitung.ts (dikunci sama oleh tes, supaya tidak berselisih).
 * - Margin = (hargaDibayar - honor) / hargaDibayar. Pagar: margin >= MARGIN_MINIMAL_PERSEN.
 * - Hanya kelas private ONLINE. Tipe lain: { berlaku: false } dan tidak ada yang diblokir
 *   (tier honor grup berbeda; dikerjakan terpisah).
 *
 * Semua masukan bilangan bulat rupiah/sesi. Masukan tidak valid TIDAK melempar: pagar gagal-tertutup
 * (aman: false + pesan), fungsi hitung mengembalikan { valid: false }.
 */

/** Margin minimal Dimentoring setelah honor mentor, dalam persen bulat. Ubah di sini saja. */
export const MARGIN_MINIMAL_PERSEN = 30;

/** Honor kelas private (persen dari harga normal per sesi). Harus sama dengan PERSEN_PRIVATE di skrip laporan honor. */
export const HONOR_PRIVATE_PERSEN = 65;

/** SATU-SATUNYA pembulat ke rupiah terdekat. */
function bulatkan(nilai: number): number {
  return Math.round(nilai);
}

const bulat = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** Kelas yang kena pagar ini: tipe_kelas = 'private' DAN mode_pembelajaran = 'online'. */
export function kelasPrivateOnline(tipeKelas: string | null | undefined, modeKelas: string | null | undefined): boolean {
  return tipeKelas === "private" && modeKelas === "online";
}

export function hargaPerSesiNormal(hargaNormal: number, jumlahSesiKelas: number): number {
  return bulatkan(hargaNormal / jumlahSesiKelas);
}

/** Honor satu sesi = bulatkan(HONOR_PRIVATE_PERSEN% x hargaPerSesi). */
export function honorPerSesi(hargaNormal: number, jumlahSesiKelas: number): number {
  return bulatkan((HONOR_PRIVATE_PERSEN * hargaPerSesiNormal(hargaNormal, jumlahSesiKelas)) / 100);
}

function galatDasar(hargaNormal: unknown, jumlahSesiKelas: unknown): string | null {
  if (!bulat(hargaNormal) || !bulat(jumlahSesiKelas)) return "Harga dan jumlah sesi harus bilangan bulat.";
  if (hargaNormal <= 0) return "Harga kelas harus lebih dari 0.";
  if (jumlahSesiKelas <= 0) return "Jumlah sesi kelas harus lebih dari 0.";
  return null;
}

const bulatSatuDesimal = (n: number): number => Math.round(n * 10) / 10;

export type HasilMargin =
  | { valid: true; honor: number; sisaDimentoring: number; marginPersen: number }
  | { valid: false; galat: string };

/** Margin untuk `jumlahSesi` sesi yang dibayar `hargaDibayar`. marginPersen satu desimal. */
export function hitungMargin(input: {
  hargaNormal: number;
  jumlahSesiKelas: number;
  jumlahSesi: number;
  hargaDibayar: number;
}): HasilMargin {
  const { hargaNormal, jumlahSesiKelas, jumlahSesi, hargaDibayar } = input;
  const galat = galatDasar(hargaNormal, jumlahSesiKelas);
  if (galat) return { valid: false, galat };
  if (!bulat(jumlahSesi) || jumlahSesi <= 0) return { valid: false, galat: "Jumlah sesi harus bilangan bulat lebih dari 0." };
  if (!bulat(hargaDibayar) || hargaDibayar < 0) return { valid: false, galat: "Harga dibayar tidak valid." };

  const honor = honorPerSesi(hargaNormal, jumlahSesiKelas) * jumlahSesi;
  const sisaDimentoring = hargaDibayar - honor;
  const marginPersen = hargaDibayar > 0 ? bulatSatuDesimal((sisaDimentoring * 100) / hargaDibayar) : -100;
  return { valid: true, honor, sisaDimentoring, marginPersen };
}

/**
 * Harga bayar paling rendah yang masih memenuhi MARGIN_MINIMAL_PERSEN:
 * pembulatan KE ATAS dari honor / (1 - margin), dengan bilangan bulat saja supaya pagar tidak lolos karena
 * pembulatan. null bila masukan tidak valid.
 */
export function hargaBayarMinimal(input: { hargaNormal: number; jumlahSesiKelas: number; jumlahSesi: number }): number | null {
  const { hargaNormal, jumlahSesiKelas, jumlahSesi } = input;
  if (galatDasar(hargaNormal, jumlahSesiKelas) || !bulat(jumlahSesi) || jumlahSesi <= 0) return null;
  const honor = honorPerSesi(hargaNormal, jumlahSesiKelas) * jumlahSesi;
  const penyebut = 100 - MARGIN_MINIMAL_PERSEN;
  return Math.ceil((honor * 100) / penyebut);
}

export type DiskonMaksimal = { valid: true; nominal: number; persen: number } | { valid: false; galat: string };

/**
 * Total diskon (diskon kelas + promo) maksimal untuk PAKET PENUH: nominal = hargaNormal - hargaBayarMinimal;
 * persen satu desimal, dibulatkan KE BAWAH supaya tidak pernah melebihi batas.
 */
export function diskonMaksimal(input: { hargaNormal: number; jumlahSesiKelas: number }): DiskonMaksimal {
  const { hargaNormal, jumlahSesiKelas } = input;
  const galat = galatDasar(hargaNormal, jumlahSesiKelas);
  if (galat) return { valid: false, galat };
  const minimal = hargaBayarMinimal({ hargaNormal, jumlahSesiKelas, jumlahSesi: jumlahSesiKelas }) as number;
  const nominal = Math.max(0, hargaNormal - minimal);
  return { valid: true, nominal, persen: Math.floor((nominal * 1000) / hargaNormal) / 10 };
}

/** "Rp928.572" (titik pemisah ribuan, tanpa bergantung pada locale mesin). */
function rupiah(n: number): string {
  return `Rp${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** "24,6%" (koma desimal). */
function persenId(n: number): string {
  return `${n.toFixed(1).replace(".", ",")}%`;
}

export type CekDiskonAman =
  | { berlaku: false }
  | { berlaku: true; aman: boolean; margin: number | null; hargaBayarMinimal: number | null; pesan: string };

/**
 * Cek apakah harga akhir paket penuh (setelah diskon kelas, dan opsional setelah promo bernilai
 * `nilaiPromo` rupiah) masih memenuhi margin minimal. `pesan` berbahasa sehari-hari, siap dipakai UI;
 * kosong bila aman. Bukan kelas private online -> { berlaku: false }.
 */
export function cekDiskonAman(input: {
  tipeKelas: string | null | undefined;
  modeKelas: string | null | undefined;
  hargaNormal: number;
  jumlahSesiKelas: number;
  hargaSetelahDiskonKelas: number;
  /** Nilai promo dalam RUPIAH (promo persen dikonversi pemanggil terhadap harga setelah diskon kelas). */
  nilaiPromo?: number;
}): CekDiskonAman {
  const { tipeKelas, modeKelas, hargaNormal, jumlahSesiKelas, hargaSetelahDiskonKelas, nilaiPromo = 0 } = input;
  if (!kelasPrivateOnline(tipeKelas, modeKelas)) return { berlaku: false };

  const gagalTertutup = (pesan: string): CekDiskonAman => ({
    berlaku: true,
    aman: false,
    margin: null,
    hargaBayarMinimal: null,
    pesan,
  });

  if (galatDasar(hargaNormal, jumlahSesiKelas)) {
    return gagalTertutup("Harga dan jumlah sesi kelas harus bilangan bulat lebih dari 0, jadi batas diskon tidak bisa dihitung.");
  }
  if (!bulat(hargaSetelahDiskonKelas) || hargaSetelahDiskonKelas < 0 || hargaSetelahDiskonKelas > hargaNormal) {
    return gagalTertutup("Harga setelah diskon tidak valid, jadi batas diskon tidak bisa dihitung.");
  }
  if (!bulat(nilaiPromo) || nilaiPromo < 0) {
    return gagalTertutup("Nilai promo tidak valid, jadi batas diskon tidak bisa dihitung.");
  }

  const hargaDibayar = Math.max(0, hargaSetelahDiskonKelas - nilaiPromo);
  const minimal = hargaBayarMinimal({ hargaNormal, jumlahSesiKelas, jumlahSesi: jumlahSesiKelas }) as number;
  const hasil = hitungMargin({ hargaNormal, jumlahSesiKelas, jumlahSesi: jumlahSesiKelas, hargaDibayar });
  if (!hasil.valid) return gagalTertutup(hasil.galat);

  // Perbandingan pada bilangan bulat (bukan pada persen yang sudah dibulatkan).
  const aman = hargaDibayar >= minimal;
  if (aman) return { berlaku: true, aman: true, margin: hasil.marginPersen, hargaBayarMinimal: minimal, pesan: "" };

  const sebab = nilaiPromo > 0 ? "Diskon dan promo ditumpuk terlalu besar" : "Diskon terlalu besar";
  return {
    berlaku: true,
    aman: false,
    margin: hasil.marginPersen,
    hargaBayarMinimal: minimal,
    pesan: `${sebab}. Setelah honor mentor, Dimentoring hanya menyisakan ${persenId(hasil.marginPersen)} (batas minimal ${MARGIN_MINIMAL_PERSEN}%). Harga bayar paling rendah yang boleh: ${rupiah(minimal)}.`,
  };
}

export interface KelasUntukCekPromo {
  id: string;
  nama: string;
  tipeKelas: string;
  modeKelas: string;
  hargaNormal: number;
  jumlahSesiKelas: number;
  /** Harga setelah diskon kelas yang berlaku SAAT INI. */
  hargaSetelahDiskonKelas: number;
}

export interface PelanggaranPromo {
  kelasId: string;
  namaKelas: string;
  pesan: string;
  /** Margin (persen, satu desimal) bila promo dipakai di kelas ini. */
  margin: number | null;
  hargaBayarMinimal: number | null;
  /** Potongan promo dalam rupiah untuk kelas ini (sudah dibatasi harga setelah diskon kelas). */
  potonganPromo: number;
}

/**
 * Periksa kode promo (persen atau nominal) terhadap kelas yang dicakupnya. Promo persen dihitung dari harga
 * setelah diskon kelas (sama dengan validatePromoCode saat checkout); promo nominal dipotong langsung.
 * Hanya kelas private online yang diperiksa — kelas lain dilewati. Mengembalikan daftar pelanggaran (kosong = aman).
 */
export function cekPromoTerhadapKelas(
  kelasList: readonly KelasUntukCekPromo[],
  promo: { tipeDiskon: "persen" | "nominal"; nilaiDiskon: number },
): PelanggaranPromo[] {
  const hasil: PelanggaranPromo[] = [];
  for (const k of kelasList) {
    if (!kelasPrivateOnline(k.tipeKelas, k.modeKelas)) continue;
    const nilaiPromo =
      promo.tipeDiskon === "persen"
        ? bulatkan((k.hargaSetelahDiskonKelas * promo.nilaiDiskon) / 100)
        : bulatkan(promo.nilaiDiskon);
    const potonganPromo = Math.min(nilaiPromo, k.hargaSetelahDiskonKelas);
    const cek = cekDiskonAman({
      tipeKelas: k.tipeKelas,
      modeKelas: k.modeKelas,
      hargaNormal: k.hargaNormal,
      jumlahSesiKelas: k.jumlahSesiKelas,
      hargaSetelahDiskonKelas: k.hargaSetelahDiskonKelas,
      nilaiPromo: potonganPromo,
    });
    if (cek.berlaku && !cek.aman) {
      hasil.push({
        kelasId: k.id,
        namaKelas: k.nama,
        pesan: cek.pesan,
        margin: cek.margin,
        hargaBayarMinimal: cek.hargaBayarMinimal,
        potonganPromo,
      });
    }
  }
  return hasil;
}
