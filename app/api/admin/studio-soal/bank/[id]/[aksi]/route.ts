import { NextRequest } from "next/server";
import { aksiAdmin } from "@/lib/admin/bankSoalApi";

/** POST versi-baru | terbitkan-versi | arsipkan (Admin, soal Buatan Sendiri). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; aksi: string }> }) {
  const { id, aksi } = await params;
  return aksiAdmin(request, id, aksi);
}
