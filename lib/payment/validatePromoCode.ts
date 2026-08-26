import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Validasi Kode Promo saat checkout — PRD Bagian 13 (kode_promo,
 * kode_promo_kelas). SATU implementasi dipakai oleh
 * app/api/payment/validate-promo/route.ts (tombol "Terapkan" di UI) DAN
 * app/api/payment/create/route.ts (validasi ulang wajib di server sebelum
 * membuat transaksi Midtrans, jangan percaya hasil "Terapkan" dari client) —
 * supaya 5 poin aturan selalu konsisten di kedua jalur.
 */

export interface PromoValidationResult {
  promoId: string;
  kode: string;
  diskon: number;
  total: number;
}

export type ValidatePromoResult =
  | { ok: true; data: PromoValidationResult }
  | { ok: false; error: string };

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function validatePromoCode(
  kodeRaw: string,
  kelasId: string,
  hargaKelas: number,
): Promise<ValidatePromoResult> {
  const kode = kodeRaw.trim().toUpperCase();
  if (!kode) {
    return { ok: false, error: "Kode promo wajib diisi." };
  }

  const { data: promo, error: promoError } = await supabaseServer
    .from("kode_promo")
    .select(
      "id, kode, tipe_diskon, nilai_diskon, tanggal_mulai, tanggal_selesai, kuota_pemakaian, jumlah_terpakai, status, berlaku_semua_kelas",
    )
    .eq("kode", kode)
    .maybeSingle();

  if (promoError) {
    console.error("[validatePromoCode] query kode_promo failed:", promoError);
    return { ok: false, error: "Gagal memvalidasi kode promo. Coba lagi nanti." };
  }
  if (!promo) {
    return { ok: false, error: "Kode promo tidak valid." };
  }

  // 1. Status aktif
  if (promo.status !== "aktif") {
    return { ok: false, error: "Kode promo tidak aktif." };
  }

  // 2. Periode berlaku
  const today = todayDateString();
  if (promo.tanggal_mulai && today < (promo.tanggal_mulai as string)) {
    return { ok: false, error: "Kode promo belum berlaku." };
  }
  if (promo.tanggal_selesai && today > (promo.tanggal_selesai as string)) {
    return { ok: false, error: "Kode promo sudah kadaluarsa." };
  }

  // 3. Kuota pemakaian
  const kuotaPemakaian = promo.kuota_pemakaian as number | null;
  const jumlahTerpakai = promo.jumlah_terpakai as number;
  if (kuotaPemakaian !== null && jumlahTerpakai >= kuotaPemakaian) {
    return { ok: false, error: "Kuota kode promo sudah habis." };
  }

  // 4. Scoping kelas
  if (!promo.berlaku_semua_kelas) {
    const { data: scopeRow, error: scopeError } = await supabaseServer
      .from("kode_promo_kelas")
      .select("kelas_id")
      .eq("kode_promo_id", promo.id)
      .eq("kelas_id", kelasId)
      .maybeSingle();

    if (scopeError) {
      console.error("[validatePromoCode] query kode_promo_kelas failed:", scopeError);
      return { ok: false, error: "Gagal memvalidasi kode promo. Coba lagi nanti." };
    }
    if (!scopeRow) {
      return { ok: false, error: "Kode promo tidak berlaku untuk kelas ini." };
    }
  }

  // 5. Hitung diskon
  const nilaiDiskon = Number(promo.nilai_diskon);
  const rawDiskon = promo.tipe_diskon === "persen" ? (hargaKelas * nilaiDiskon) / 100 : nilaiDiskon;
  const diskon = Math.min(Math.round(rawDiskon), hargaKelas);
  const total = hargaKelas - diskon;

  return {
    ok: true,
    data: {
      promoId: promo.id as string,
      kode: promo.kode as string,
      diskon,
      total,
    },
  };
}
