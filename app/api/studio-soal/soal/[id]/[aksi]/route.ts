import { NextRequest } from "next/server";
import { aksi } from "@/lib/mentor/studioSoalApi";

/**
 * Transisi status soal (Mentor) — PR 3b. POST /api/studio-soal/soal/:id/:aksi
 *   ajukan     validasi lengkap isi tersimpan -> RPC studio_soal_ajukan_soal
 *   tarik      diajukan -> draf (RPC studio_soal_tarik)
 *   versi-baru salin soal terbit jadi draf versi berikutnya (copy-on-write, K3)
 */
type Ctx = { params: Promise<{ id: string; aksi: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const p = await params;
  return aksi(request, "soal", p.id, p.aksi);
}
