import { NextRequest } from "next/server";
import { hapusDraf, simpanSoal } from "@/lib/mentor/studioSoalApi";

/**
 * Draf soal Studio Soal (Mentor) — PR 3b.
 *   PUT    buat ATAU ubah draf. Id dibuat di halaman "Tulis soal" (sekali per
 *          form), jadi klik Simpan dua kali tidak membuat soal ganda.
 *   DELETE hapus draf yang belum pernah diajukan.
 * Semua tulis lewat RPC studio_soal_* — lihat lib/mentor/studioSoalApi.ts.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return simpanSoal(request, id);
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return hapusDraf(request, "soal", id);
}
