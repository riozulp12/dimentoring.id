import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getKelasForCheckout, isKelasSudahLunas } from "@/lib/payment/getKelasForCheckout";
import { validatePromoCode } from "@/lib/payment/validatePromoCode";
import { generateOrderId } from "@/lib/payment/generateOrderId";
import { snap } from "@/lib/payment/midtransSnap";

/**
 * Buat transaksi Payment — PRD Bagian 8 BR-19 (status hanya berubah lewat
 * webhook/admin override) & Bagian 13 (payments). Harga & diskon SELALU
 * dihitung ulang di sini dari database, JANGAN pernah percaya angka dari
 * body request (client bisa memanipulasi devtools/curl).
 */

interface CreatePaymentBody {
  kelasId?: string;
  kodePromo?: string;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

const MAX_ORDER_ID_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "student") {
    return errorResponse("Cuma Siswa yang bisa checkout kelas.", 403);
  }

  let body: CreatePaymentBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const kelasId = body.kelasId;
  if (!kelasId || typeof kelasId !== "string") {
    return errorResponse("Kelas tidak valid.", 400);
  }

  const kelas = await getKelasForCheckout(kelasId);
  if (!kelas) {
    return errorResponse("Kelas tidak ditemukan.", 404);
  }

  if (await isKelasSudahLunas(session.userId, kelasId)) {
    return errorResponse("Kamu sudah terdaftar di kelas ini.", 409);
  }

  let kodePromoId: string | null = null;
  let total = kelas.harga;

  const kodePromo = body.kodePromo?.trim();
  if (kodePromo) {
    const promoResult = await validatePromoCode(kodePromo, kelasId, kelas.harga);
    if (!promoResult.ok) {
      return errorResponse(promoResult.error, 400);
    }
    kodePromoId = promoResult.data.promoId;
    total = promoResult.data.total;
  }

  const { data: user, error: userError } = await supabaseServer
    .from("users")
    .select("nama, email")
    .eq("id", session.userId)
    .maybeSingle();

  if (userError || !user) {
    console.error("[payment/create] query user failed:", userError);
    return errorResponse("Gagal memuat data akun. Coba lagi nanti.", 500);
  }

  let paymentId: string | null = null;
  let orderId: string | null = null;

  for (let attempt = 0; attempt < MAX_ORDER_ID_ATTEMPTS; attempt++) {
    const candidateOrderId = generateOrderId();
    const { data: inserted, error: insertError } = await supabaseServer
      .from("payments")
      .insert({
        user_id: session.userId,
        item_type: "kelas",
        item_id: kelasId,
        jumlah_sebelum_diskon: kelas.harga,
        jumlah: total,
        status: "menunggu",
        kode_promo_id: kodePromoId,
        order_id: candidateOrderId,
      })
      .select("id, order_id")
      .single();

    if (!insertError) {
      paymentId = inserted.id as string;
      orderId = inserted.order_id as string;
      break;
    }

    const isOrderIdCollision = insertError.code === "23505" && insertError.message.includes("order_id");
    if (!isOrderIdCollision) {
      console.error("[payment/create] insert payments failed:", insertError);
      return errorResponse("Gagal membuat transaksi pembayaran. Coba lagi nanti.", 500);
    }
  }

  if (!paymentId || !orderId) {
    console.error("[payment/create] gagal generate order_id unik setelah beberapa percobaan.");
    return errorResponse("Gagal membuat transaksi pembayaran. Coba lagi nanti.", 500);
  }

  try {
    const transaction = await snap.createTransaction({
      transaction_details: {
        order_id: orderId,
        gross_amount: Math.round(total),
      },
      item_details: [
        {
          id: kelasId,
          price: Math.round(total),
          quantity: 1,
          name: kelas.nama,
        },
      ],
      customer_details: {
        first_name: (user.nama as string) ?? undefined,
        email: (user.email as string) ?? undefined,
      },
    });

    return NextResponse.json({ success: true, snapToken: transaction.token, orderId });
  } catch (midtransError) {
    console.error("[payment/create] Midtrans createTransaction failed:", midtransError);
    await supabaseServer.from("payments").update({ status: "gagal" }).eq("id", paymentId);
    return errorResponse("Gagal membuat transaksi pembayaran ke gateway. Coba lagi nanti.", 500);
  }
}
