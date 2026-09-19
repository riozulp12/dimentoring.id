import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getKelasForCheckout, getKelasSubtesOptions, isKelasSudahLunas } from "@/lib/payment/getKelasForCheckout";
import { getOfflineMentorOptions } from "@/lib/payment/getOfflineMentorOptions";
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
  /** Pilihan Subtes siswa untuk kelas paket (kelas_subtes > 1) — WAJIB 1-3
   * kalau kelas ini paket, diabaikan sepenuhnya kalau bukan (server yang
   * menentukan pool aslinya lewat kelas_subtes, bukan percaya array ini
   * mentah-mentah). */
  subtesIds?: string[];
  /** WAJIB kalau kelas.mode_pembelajaran='offline' — mentor pilihan siswa dari
   * daftar /api/payment/offline-mentors, DIVALIDASI ULANG di sini (server
   * tidak percaya mentorOfflineId mentah dari client, sama prinsipnya dengan
   * subtesIds/harga). lokasiSiswaLat/Lng dari navigator.geolocation browser
   * siswa, ditampung di payments dulu sampai webhook pindahkan ke enrollments. */
  mentorOfflineId?: string;
  lokasiSiswaLat?: number;
  lokasiSiswaLng?: number;
}

const MAX_SUBTES_PILIHAN = 3;

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

  // Pool Subtes ASLI dari server (kelas_subtes) — JANGAN pernah percaya
  // subtesIds dari body kalau bukan bagian dari pool ini (client bisa
  // memanipulasi devtools/curl, sama prinsipnya dengan harga di atas).
  const subtesPool = await getKelasSubtesOptions(kelasId);
  const subtesPoolIds = new Set(subtesPool.map((s) => s.id));
  let resolvedSubtesIds: string[] = [];
  if (subtesPool.length > 1) {
    const requested = Array.isArray(body.subtesIds)
      ? Array.from(new Set(body.subtesIds.filter((id): id is string => typeof id === "string" && subtesPoolIds.has(id))))
      : [];
    if (requested.length < 1 || requested.length > MAX_SUBTES_PILIHAN) {
      return errorResponse(`Pilih minimal 1, maksimal ${MAX_SUBTES_PILIHAN} subtes.`, 400);
    }
    resolvedSubtesIds = requested;
  } else {
    // Kelas tunggal/tanpa subtes — otomatis, tidak minta siswa pilih apa pun.
    resolvedSubtesIds = subtesPool.map((s) => s.id);
  }

  // Kelas offline: mentor TIDAK ditentukan di muka waktu bikin kelas —
  // otomatis di-assign berdasar jarak terdekat, tapi siswa yang pilih dari
  // daftar (bukan dipaksa otomatis yang paling dekat). Validasi ulang di sini
  // (bukan cuma percaya /api/payment/offline-mentors yang dipanggil sebelumnya)
  // supaya mentorId yang tersimpan benar-benar qualified.
  let mentorOfflineId: string | null = null;
  let lokasiSiswaLat: number | null = null;
  let lokasiSiswaLng: number | null = null;
  if (kelas.modePembelajaran === "offline") {
    const lat = Number(body.lokasiSiswaLat);
    const lng = Number(body.lokasiSiswaLng);
    if (!body.mentorOfflineId || typeof body.mentorOfflineId !== "string") {
      return errorResponse("Pilih mentor tatap muka dulu sebelum checkout.", 400);
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return errorResponse("Lokasi kamu tidak valid. Izinkan akses lokasi lalu coba lagi.", 400);
    }
    const subtesIdForMatching = subtesPool[0]?.id;
    if (!subtesIdForMatching) {
      return errorResponse("Kelas ini belum punya Subtes yang diatur. Hubungi Admin.", 400);
    }
    const qualifiedMentors = await getOfflineMentorOptions(subtesIdForMatching, lat, lng);
    const isQualified = qualifiedMentors.some((m) => m.mentorId === body.mentorOfflineId);
    if (!isQualified) {
      return errorResponse(
        "Belum ada mentor tatap muka tersedia untuk mapel ini di area kamu, atau mentor yang dipilih sudah tidak tersedia.",
        409,
      );
    }
    mentorOfflineId = body.mentorOfflineId;
    lokasiSiswaLat = lat;
    lokasiSiswaLng = lng;
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
        mentor_offline_id: mentorOfflineId,
        lokasi_siswa_lat: lokasiSiswaLat,
        lokasi_siswa_lng: lokasiSiswaLng,
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

  // Tampung pilihan Subtes di sini dulu (enrollments belum ada — baru dibuat
  // webhook kalau payment sukses) — dipindahkan ke enrollment_subtes oleh
  // webhook, lihat app/api/payment/webhook/route.ts.
  if (resolvedSubtesIds.length > 0) {
    const { error: pilihanInsertError } = await supabaseServer
      .from("payment_subtes_pilihan")
      .insert(resolvedSubtesIds.map((subtesId) => ({ payment_id: paymentId, subtes_id: subtesId })));
    if (pilihanInsertError) {
      console.error("[payment/create] insert payment_subtes_pilihan failed:", pilihanInsertError);
      await supabaseServer.from("payments").update({ status: "gagal" }).eq("id", paymentId);
      return errorResponse("Gagal menyimpan pilihan subtes. Coba lagi nanti.", 500);
    }
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
