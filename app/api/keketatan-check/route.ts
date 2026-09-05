import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { calculateKeketatan } from "@/lib/assessment/calculatePeluang";

/**
 * Widget Cek Keketatan (landing page) — PRD Bagian 7.4.5, FR-3.12/FR-3.14.
 *
 * Endpoint RINGAN dan sengaja publik total: tidak ada auth check, tidak ada
 * cookie trial, tidak ada batasan pemakaian (beda dari BR-29 Assessment).
 * Cuma lookup ptn_jurusan + hitung Keketatan (formula publik, sama seperti
 * Bagian 7.4) — TIDAK menyimpan apa pun ke database, tidak ada assessment
 * yang dibuat.
 */

interface KeketatanCheckRequestBody {
  ptnJurusanId?: string;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body: KeketatanCheckRequestBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const ptnJurusanId = body.ptnJurusanId;
  if (!ptnJurusanId || typeof ptnJurusanId !== "string") {
    return errorResponse("ptnJurusanId wajib diisi.", 400);
  }

  const { data: ptnJurusan, error } = await supabaseServer
    .from("ptn_jurusan")
    .select("nama_universitas, nama_jurusan, jenjang, kuota_tahun_berjalan, jumlah_peminat_tahun_lalu, tahun_data")
    .eq("id", ptnJurusanId)
    .maybeSingle();

  if (error) {
    console.error("[keketatan-check] query ptn_jurusan failed:", error);
    return errorResponse("Gagal memuat data program studi. Coba lagi nanti.", 500);
  }
  if (!ptnJurusan) {
    return errorResponse("Program studi tidak ditemukan.", 404);
  }

  const keketatan = calculateKeketatan(
    ptnJurusan.kuota_tahun_berjalan as number,
    ptnJurusan.jumlah_peminat_tahun_lalu as number,
  );

  return NextResponse.json({
    success: true,
    namaUniversitas: ptnJurusan.nama_universitas as string,
    namaJurusan: ptnJurusan.nama_jurusan as string,
    jenjang: ptnJurusan.jenjang as string,
    keketatanScore: keketatan.score,
    keketatanLabel: keketatan.label,
    tahunData: ptnJurusan.tahun_data as number,
    kuotaTahunBerjalan: ptnJurusan.kuota_tahun_berjalan as number,
    jumlahPeminatTahunLalu: ptnJurusan.jumlah_peminat_tahun_lalu as number,
  });
}
