import "server-only";
import { buatPenyediaFonnte } from "./fonnte";
import type { PenyediaWa } from "./types";

export { waNotifAktif, batasHarianWa } from "./config";
export { kirimNotifWa, type HasilNotifWa, type InputNotifWa, type DepsNotifWa } from "./kirimNotifWa";
export { buatPesanWaSiswaBaru } from "./pesan";
export { buatLogWaSupabase } from "./logStore";
export type { PenyediaWa, HasilKirimWa, LogWaStore } from "./types";

/**
 * Satu-satunya tempat yang tahu penyedia mana yang dipakai. Ganti ke WhatsApp
 * Business API resmi nanti dengan menulis PenyediaWa baru dan mengubah fungsi ini.
 * null = token belum diset (pengiriman dilewati, bukan galat).
 */
export function getPenyediaWa(env: Readonly<Record<string, string | undefined>> = process.env): PenyediaWa | null {
  const token = env.FONNTE_TOKEN?.trim();
  if (!token) return null;
  return buatPenyediaFonnte({ token });
}
