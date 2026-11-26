import { NextRequest } from "next/server";
import { hapusBatchDraf } from "@/lib/admin/bankSoalApi";

/** Hapus soal draf satu batch impor (Admin). Soal terbit/arsip di batch itu dipertahankan. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return hapusBatchDraf(request, id);
}
