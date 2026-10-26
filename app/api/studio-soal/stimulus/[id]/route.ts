import { NextRequest } from "next/server";
import { hapusDraf, simpanStimulus } from "@/lib/mentor/studioSoalApi";

/**
 * Draf stimulus Studio Soal (Mentor) — PR 3b.
 *   PUT    buat ATAU ubah draf (idempoten per id).
 *   DELETE hapus draf kosong yang belum pernah diajukan.
 * Semua tulis lewat RPC studio_soal_* — lihat lib/mentor/studioSoalApi.ts.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return simpanStimulus(request, id);
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return hapusDraf(request, "stimulus", id);
}
