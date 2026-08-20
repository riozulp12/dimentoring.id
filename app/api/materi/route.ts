import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";

/**
 * Upload materi manual Mentor — PRD Bagian 7.5.1 (FR-M1/FR-M4) & BR-31.
 * Beda dari materi AI-generated: upload manual dari Mentor yang sudah Active
 * langsung `published`, tanpa gerbang review tambahan.
 */

type Jenis = "video" | "dokumen" | "rangkuman_teks";
const VALID_JENIS: Jenis[] = ["video", "dokumen", "rangkuman_teks"];

interface MateriRequestBody {
  kelasId: string;
  judul: string;
  tipe: Jenis;
  konten: string;
  subtesId?: string;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "mentor") {
    return errorResponse("Cuma Mentor yang bisa menambah materi.", 403);
  }
  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    return errorResponse("Akun kamu masih menunggu approval Admin.", 403);
  }

  let body: MateriRequestBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const judul = body.judul?.trim();
  if (!judul) {
    return errorResponse("Judul wajib diisi.", 400);
  }
  if (!body.tipe || !VALID_JENIS.includes(body.tipe)) {
    return errorResponse("Jenis materi tidak valid.", 400);
  }
  const konten = body.konten?.trim() ?? "";
  const isLink = body.tipe === "video" || body.tipe === "dokumen";
  if (isLink && !isValidUrl(konten)) {
    return errorResponse("Konten wajib berupa link yang valid untuk jenis Video/Dokumen.", 400);
  }
  if (!isLink && konten.length === 0) {
    return errorResponse("Rangkuman tidak boleh kosong.", 400);
  }
  if (!body.kelasId) {
    return errorResponse("kelasId wajib diisi.", 400);
  }

  // BR-7: mentor cuma boleh tambah materi untuk kelas yang di-assign ke dia.
  const { data: kelas } = await supabaseServer
    .from("kelas")
    .select("id, mentor_id")
    .eq("id", body.kelasId)
    .maybeSingle();
  if (!kelas || kelas.mentor_id !== session.userId) {
    return errorResponse("Kelas tidak ditemukan atau bukan kelas yang kamu ampu.", 403);
  }

  const { error: insertError } = await supabaseServer.from("materi").insert({
    kelas_id: body.kelasId,
    subtes_id: body.subtesId || null,
    judul,
    tipe: body.tipe,
    konten,
    sumber: "upload_mentor",
    status: "published",
    dibuat_oleh_id: session.userId,
  });

  if (insertError) {
    console.error("[materi] insert failed:", insertError);
    return errorResponse("Gagal menyimpan materi. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
