import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getKelasForCheckout } from "@/lib/payment/getKelasForCheckout";
import { validatePromoCode } from "@/lib/payment/validatePromoCode";

/**
 * Dipanggil tombol "Terapkan" di halaman Checkout — validasi Kode Promo
 * SEBELUM bayar (PRD Bagian 13: kode_promo, kode_promo_kelas). Cuma preview
 * diskon, TIDAK menandai kode_promo.jumlah_terpakai — itu baru terjadi saat
 * webhook Payment sukses.
 */

interface ValidatePromoBody {
  kelasId?: string;
  kode?: string;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "student") {
    return errorResponse("Cuma Siswa yang bisa checkout kelas.", 403);
  }

  let body: ValidatePromoBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const kelasId = body.kelasId;
  const kode = body.kode;
  if (!kelasId || typeof kelasId !== "string") {
    return errorResponse("Kelas tidak valid.", 400);
  }
  if (!kode || typeof kode !== "string") {
    return errorResponse("Kode promo wajib diisi.", 400);
  }

  const kelas = await getKelasForCheckout(kelasId);
  if (!kelas) {
    return errorResponse("Kelas tidak ditemukan.", 404);
  }

  const result = await validatePromoCode(kode, kelasId, kelas.harga);
  if (!result.ok) {
    return errorResponse(result.error, 400);
  }

  return NextResponse.json({
    success: true,
    kode: result.data.kode,
    subtotal: kelas.harga,
    diskon: result.data.diskon,
    total: result.data.total,
  });
}
