import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { generateKelasDeskripsi } from "@/lib/ai/generateKelasDeskripsi";
import { TINGKAT_KELAS_LABEL, TIPE_KELAS_LABEL } from "@/lib/shared/kelasLabels";

/** Generate deskripsi kelas via AI dari form Kelola Kelas — PRD Bagian 7.5.1. */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

interface GenerateDeskripsiBody {
  namaKelas?: string;
  tingkatKelas?: string;
  tipeKelas?: string;
  subtesId?: string;
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa generate deskripsi kelas.", 403);
  }

  let body: GenerateDeskripsiBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const namaKelas = body.namaKelas?.trim();
  if (!namaKelas) {
    return errorResponse("Isi Nama Kelas dulu sebelum generate deskripsi.", 400);
  }
  if (!body.tingkatKelas || !TINGKAT_KELAS_LABEL[body.tingkatKelas]) {
    return errorResponse("Pilih Tingkat Kelas dulu sebelum generate deskripsi.", 400);
  }
  if (!body.tipeKelas || !TIPE_KELAS_LABEL[body.tipeKelas]) {
    return errorResponse("Pilih Tipe Kelas dulu sebelum generate deskripsi.", 400);
  }
  if (!body.subtesId) {
    return errorResponse("Pilih Subtes dulu sebelum generate deskripsi.", 400);
  }

  const { data: subtes, error: subtesError } = await supabaseServer
    .from("subtes")
    .select("nama")
    .eq("id", body.subtesId)
    .maybeSingle();
  if (subtesError) {
    console.error("[generate-deskripsi] query subtes failed:", subtesError);
    return errorResponse("Gagal memuat subtes. Coba lagi nanti.", 500);
  }
  if (!subtes) {
    return errorResponse("Subtes tidak ditemukan.", 400);
  }

  const deskripsi = await generateKelasDeskripsi({
    namaKelas,
    tingkatKelasLabel: TINGKAT_KELAS_LABEL[body.tingkatKelas],
    tipeKelasLabel: TIPE_KELAS_LABEL[body.tipeKelas],
    subtesNama: subtes.nama as string,
  });

  if (!deskripsi) {
    return errorResponse("Gagal generate deskripsi lewat AI. Coba lagi atau isi manual.", 502);
  }

  return NextResponse.json({ success: true, deskripsi });
}
