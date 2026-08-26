import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { notifyRedemptionDiproses } from "@/lib/notifikasi/notify";
import { hitungDanUpdateLevel } from "@/lib/gamifikasi/hitungLevel";

/**
 * Tukar Poin — PRD Bagian 7.2 (FR-G5) & Bagian 13 (reward_catalog,
 * reward_redemptions), BR-13. Poin & stok dicek ULANG di sini (bukan cuma
 * percaya tombol "Tukar" nonaktif di client). Poin dipotong dulu baru stok
 * dipotong — kalau potong stok gagal (race, kalah rebutan stok terakhir),
 * poin yang sudah dipotong dikembalikan supaya user tidak dirugikan. Kedua
 * potongan pakai UPDATE kondisional (WHERE total_poin/stok masih cukup) —
 * bukan read-then-write biasa — supaya aman dari klik dobel / race concurrent.
 */

interface TukarRequestBody {
  rewardCatalogId?: string;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }

  let body: TukarRequestBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const rewardCatalogId = body.rewardCatalogId;
  if (!rewardCatalogId || typeof rewardCatalogId !== "string") {
    return errorResponse("Reward tidak valid.", 400);
  }

  const { data: reward, error: rewardError } = await supabaseServer
    .from("reward_catalog")
    .select("id, nama_reward, biaya_poin, stok_atau_anggaran_tersisa")
    .eq("id", rewardCatalogId)
    .maybeSingle();

  if (rewardError) {
    console.error("[reward/tukar] query reward_catalog failed:", JSON.stringify(rewardError, null, 2));
    return errorResponse("Gagal memuat reward. Coba lagi nanti.", 500);
  }
  if (!reward) {
    return errorResponse("Reward tidak ditemukan.", 404);
  }
  if ((reward.stok_atau_anggaran_tersisa as number) <= 0) {
    return errorResponse("Stok reward ini sudah habis.", 409);
  }

  const biayaPoin = reward.biaya_poin as number;

  const { data: profile, error: profileError } = await supabaseServer
    .from("gamifikasi_profiles")
    .select("total_poin")
    .eq("user_id", session.userId)
    .maybeSingle();

  if (profileError) {
    console.error("[reward/tukar] query gamifikasi_profiles failed:", JSON.stringify(profileError, null, 2));
    return errorResponse("Gagal memuat poin kamu. Coba lagi nanti.", 500);
  }
  const totalPoin = (profile?.total_poin as number | undefined) ?? 0;
  if (totalPoin < biayaPoin) {
    return errorResponse("Poin kamu belum cukup.", 400);
  }

  // 1. Potong poin — kondisional (WHERE total_poin >= biayaPoin) sebagai guard race.
  const { data: deductedProfile, error: deductError } = await supabaseServer
    .from("gamifikasi_profiles")
    .update({ total_poin: totalPoin - biayaPoin })
    .eq("user_id", session.userId)
    .gte("total_poin", biayaPoin)
    .select("user_id")
    .maybeSingle();

  if (deductError) {
    console.error("[reward/tukar] deduct total_poin failed:", JSON.stringify(deductError, null, 2));
    return errorResponse("Gagal memproses penukaran. Coba lagi nanti.", 500);
  }
  if (!deductedProfile) {
    return errorResponse("Poin kamu belum cukup.", 400);
  }

  // 2. Potong stok — kondisional (WHERE stok masih > 0). Kalau kalah race, kembalikan poin.
  const { data: deductedReward, error: stockError } = await supabaseServer
    .from("reward_catalog")
    .update({ stok_atau_anggaran_tersisa: (reward.stok_atau_anggaran_tersisa as number) - 1 })
    .eq("id", rewardCatalogId)
    .gt("stok_atau_anggaran_tersisa", 0)
    .select("id")
    .maybeSingle();

  if (stockError) {
    console.error("[reward/tukar] deduct stok failed:", JSON.stringify(stockError, null, 2));
    await supabaseServer
      .from("gamifikasi_profiles")
      .update({ total_poin: totalPoin })
      .eq("user_id", session.userId);
    return errorResponse("Gagal memproses penukaran. Coba lagi nanti.", 500);
  }
  if (!deductedReward) {
    await supabaseServer
      .from("gamifikasi_profiles")
      .update({ total_poin: totalPoin })
      .eq("user_id", session.userId);
    return errorResponse("Stok reward ini sudah habis.", 409);
  }

  // Poin sudah final (tidak akan di-rollback lagi setelah titik ini) — FR-G2:
  // penukaran bisa MENURUNKAN level, wajib dicek ulang, bukan cuma saat poin naik.
  await hitungDanUpdateLevel(session.userId);

  const { error: insertError } = await supabaseServer.from("reward_redemptions").insert({
    user_id: session.userId,
    reward_catalog_id: rewardCatalogId,
    poin_terpakai: biayaPoin,
    status: "diproses",
  });

  if (insertError) {
    console.error("[reward/tukar] insert reward_redemptions failed:", JSON.stringify(insertError, null, 2));
    return errorResponse("Gagal mencatat penukaran. Coba lagi nanti.", 500);
  }

  await notifyRedemptionDiproses(session.userId, reward.nama_reward as string);

  return NextResponse.json({ success: true });
}
