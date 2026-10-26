import { NextRequest } from "next/server";
import { aksi } from "@/lib/mentor/studioSoalApi";

/**
 * Transisi status stimulus (Mentor) — PR 3b. POST /api/studio-soal/stimulus/:id/:aksi
 *   ajukan     stimulus + semua soal drafnya diajukan sebagai satu kelompok
 *   tarik      kelompok diajukan -> draf
 *   versi-baru salin stimulus terbit + soal terbitnya jadi draf versi berikutnya
 */
type Ctx = { params: Promise<{ id: string; aksi: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const p = await params;
  return aksi(request, "stimulus", p.id, p.aksi);
}
