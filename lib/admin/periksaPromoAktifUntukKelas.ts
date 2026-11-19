import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { hitungHargaSetelahDiskon } from "@/lib/shared/kelasDiskon";
import { hargaTercantum } from "@/lib/shared/hargaSesi";
import { MARGIN_MINIMAL_PERSEN, cekPromoTerhadapKelas, kelasPrivateOnline, type PelanggaranPromo } from "@/lib/shared/marginKelas";

/**
 * Pagar margin ARAH KEDUA: saat Admin menyimpan sebuah kelas, kode promo AKTIF yang mencakup kelas itu tidak
 * boleh membuat margin kelas private online di bawah batas bila ditumpuk dengan diskon kelas yang akan berlaku.
 * (Arah pertama — saat kode promo disimpan — ada di validateKodePromoInput.ts.)
 *
 * Dipanggil route Kelola Kelas (POST dan PATCH) setelah validateKelasInput, sebelum penulisan apa pun.
 * HANYA MEMBACA. Gagal-tertutup: gagal membaca promo = penyimpanan ditolak (500), tidak lolos diam-diam.
 * Kelas yang bukan private online tidak diperiksa dan tidak memicu query apa pun.
 *
 * Query tambahan: 0 (bukan private online / harga 0), 1 (kode_promo aktif; tidak ada promo per-kelas),
 * atau 2 (kode_promo_kelas untuk kelas ini, hanya PATCH dan hanya bila ada promo aktif per-kelas).
 */

export interface KelasAkhir {
  nama: string;
  tipe_kelas: string;
  mode_pembelajaran: string;
  jumlah_sesi: number;
  harga: number;
  diskon_persen: number;
}

export type HasilPeriksaPromoKelas = { ok: true } | { ok: false; error: string; status: number };

interface PromoAktifRow {
  id: string;
  kode: string;
  tipe_diskon: string;
  nilai_diskon: number | string;
  berlaku_semua_kelas: boolean;
}

function persenId(n: number): string {
  return `${n.toFixed(1).replace(".", ",")}%`;
}

function rupiah(n: number): string {
  return `Rp${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Pesan galat sehari-hari untuk promo yang paling merusak margin (potongan terbesar). */
export function susunPesanPromoBermasalah(
  kode: string,
  pelanggaran: PelanggaranPromo,
  adaDiskonKelas: boolean,
  jumlahPromoLain: number,
): string {
  const margin = pelanggaran.margin !== null ? persenId(pelanggaran.margin) : "di bawah batas";
  const sebab = adaDiskonKelas ? "bila ditumpuk dengan diskon kelas ini" : "bila dipakai di kelas ini";
  const minimal = pelanggaran.hargaBayarMinimal !== null ? ` Harga bayar paling rendah yang boleh: ${rupiah(pelanggaran.hargaBayarMinimal)}.` : "";
  const saran = adaDiskonKelas
    ? "Nonaktifkan kode promo itu atau kecilkan diskon."
    : "Nonaktifkan kode promo itu, atau jangan jadikan kelas ini private online.";
  const lain = jumlahPromoLain > 0 ? ` Ada ${jumlahPromoLain} kode promo aktif lain yang juga bermasalah.` : "";
  return `Kelas tidak bisa disimpan: kode promo ${kode} masih aktif, dan ${sebab} Dimentoring hanya menyisakan ${margin} (batas minimal ${MARGIN_MINIMAL_PERSEN}%).${minimal} ${saran}${lain}`;
}

/** kelasId = null untuk kelas baru (hanya promo semua-kelas yang bisa mencakupnya). */
export async function periksaPromoAktifUntukKelas(
  kelasId: string | null,
  kelas: KelasAkhir,
): Promise<HasilPeriksaPromoKelas> {
  if (!kelasPrivateOnline(kelas.tipe_kelas, kelas.mode_pembelajaran)) return { ok: true };
  if (!Number.isFinite(kelas.harga) || kelas.harga <= 0) return { ok: true };

  const { data: promoAktif, error: promoError } = await supabaseServer
    .from("kode_promo")
    .select("id, kode, tipe_diskon, nilai_diskon, berlaku_semua_kelas")
    .eq("status", "aktif");
  if (promoError) {
    console.error("[periksaPromoAktifUntukKelas] query kode_promo failed:", promoError);
    return { ok: false, status: 500, error: "Gagal memeriksa kode promo aktif untuk batas margin. Coba lagi nanti." };
  }
  const aktif = (promoAktif ?? []) as unknown as PromoAktifRow[];
  if (aktif.length === 0) return { ok: true };

  // Promo yang mencakup kelas ini: semua-kelas, atau tercatat di kode_promo_kelas (hanya kelas yang sudah ada).
  let idPerKelas = new Set<string>();
  if (kelasId && aktif.some((p) => !p.berlaku_semua_kelas)) {
    const { data: cakupan, error: cakupanError } = await supabaseServer
      .from("kode_promo_kelas")
      .select("kode_promo_id")
      .eq("kelas_id", kelasId);
    if (cakupanError) {
      console.error("[periksaPromoAktifUntukKelas] query kode_promo_kelas failed:", cakupanError);
      return { ok: false, status: 500, error: "Gagal memeriksa cakupan kode promo untuk batas margin. Coba lagi nanti." };
    }
    idPerKelas = new Set(((cakupan ?? []) as unknown as { kode_promo_id: string }[]).map((r) => r.kode_promo_id));
  }
  const berlaku = aktif.filter((p) => p.berlaku_semua_kelas || idPerKelas.has(p.id));
  if (berlaku.length === 0) return { ok: true };

  // Dasar sama dengan pagar lain: harga tercantum; promo persen dihitung dari harga setelah diskon kelas.
  const tercantum = hargaTercantum(kelas.harga) ?? kelas.harga;
  const kelasUntukCek = {
    id: kelasId ?? "kelas-baru",
    nama: kelas.nama,
    tipeKelas: kelas.tipe_kelas,
    modeKelas: kelas.mode_pembelajaran,
    hargaNormal: tercantum,
    jumlahSesiKelas: kelas.jumlah_sesi,
    hargaSetelahDiskonKelas: hitungHargaSetelahDiskon(tercantum, kelas.diskon_persen),
  };

  const bermasalah: { kode: string; pelanggaran: PelanggaranPromo }[] = [];
  for (const p of berlaku) {
    const [pelanggaran] = cekPromoTerhadapKelas([kelasUntukCek], {
      tipeDiskon: p.tipe_diskon === "persen" ? "persen" : "nominal",
      nilaiDiskon: Number(p.nilai_diskon),
    });
    if (pelanggaran) bermasalah.push({ kode: p.kode, pelanggaran });
  }
  if (bermasalah.length === 0) return { ok: true };

  // Promo dengan potongan terbesar = yang paling merusak margin; disebut namanya.
  bermasalah.sort((a, b) => b.pelanggaran.potonganPromo - a.pelanggaran.potonganPromo);
  const [terburuk] = bermasalah;
  return {
    ok: false,
    status: 400,
    error: susunPesanPromoBermasalah(terburuk.kode, terburuk.pelanggaran, kelas.diskon_persen > 0, bermasalah.length - 1),
  };
}
