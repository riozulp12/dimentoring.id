import { NextRequest } from "next/server";
import { hapusDrafAdmin, simpanDrafAdmin } from "@/lib/admin/bankSoalApi";

type Ctx = { params: Promise<{ id: string }> };

/** Simpan draf soal Buatan Sendiri (Admin). */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return simpanDrafAdmin(request, id);
}

/** Hapus permanen draf soal Buatan Sendiri (Admin). Soal terbit tidak bisa dihapus. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return hapusDrafAdmin(request, id);
}
