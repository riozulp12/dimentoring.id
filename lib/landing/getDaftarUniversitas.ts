import "server-only";
import { buildOpsiUniversitas } from "@/lib/shared/universitasMentor";
import { getPtnJurusanOptions } from "./getPtnJurusanOptions";

/**
 * Daftar universitas untuk form pendaftaran mentor — diturunkan dari sumber
 * yang sama dengan Assessment (getPtnJurusanOptions, ber-pagination), jadi
 * tidak ada daftar hardcoded terpisah yang bisa tertinggal.
 */
export async function getDaftarUniversitas(): Promise<string[]> {
  const rows = await getPtnJurusanOptions();
  return buildOpsiUniversitas(rows.map((r) => r.namaUniversitas));
}
