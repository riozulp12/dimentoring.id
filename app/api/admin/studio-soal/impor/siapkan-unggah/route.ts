import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { BUCKET_STAGING } from "@/lib/admin/mediaSoal";
import { BATAS_BYTE_DOCX } from "@/lib/shared/studio-soal/imporDocx";

export const runtime = "nodejs";

/**
 * Siapkan unggahan Word (Admin): POST { namaBerkas, ukuran } -> { path, token, url }.
 * Browser mengunggah berkasnya LANGSUNG ke Storage lewat `url` (signed upload),
 * karena body fungsi Vercel dibatasi 4,5 MB. Path acak di bawah id admin.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  const tolak = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return tolak("Permintaan tidak valid.", 400);
  }
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof b.namaBerkas !== "string" || !b.namaBerkas.toLowerCase().endsWith(".docx")) {
    return tolak("Hanya berkas .docx yang diterima (bukan .doc atau PDF).", 400);
  }
  if (typeof b.ukuran !== "number" || !(b.ukuran > 0)) return tolak("Berkas kosong.", 400);
  if (b.ukuran > BATAS_BYTE_DOCX) return tolak("Berkas terlalu besar (maks. 25 MB).", 413);

  // Batas ukuran sebenarnya ditegakkan bucket (file_size_limit); angka dari browser hanya pemeriksaan awal.
  const { data, error } = await supabaseServer.storage.from(BUCKET_STAGING).createSignedUploadUrl(`${auth.adminId}/${randomUUID()}.docx`);
  if (error || !data) {
    console.error("[admin/studio-soal/impor/siapkan-unggah] gagal:", error);
    return tolak("Unggahan belum bisa disiapkan. Coba lagi sebentar lagi.", 500);
  }
  return NextResponse.json({ success: true, path: data.path, token: data.token, url: data.signedUrl });
}
