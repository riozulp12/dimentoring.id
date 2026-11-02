/**
 * Konfigurasi WhatsApp notifikasi — dibaca dari env, SEMUA bawaan = mati/aman.
 * Murni (menerima env sebagai argumen) supaya mudah dites.
 */

export type EnvLike = Readonly<Record<string, string | undefined>>;

/** Hanya nilai PERSIS "true" yang menyalakan; kosong, "TRUE", "1", " true" = mati. */
export function waNotifAktif(env: EnvLike = process.env): boolean {
  return env.WA_NOTIF_ENABLED === "true";
}

export const BATAS_HARIAN_WA_BAWAAN = 50;

/** Batas pesan per hari (WIB). WA_NOTIF_BATAS_HARIAN opsional; nilai tak valid = bawaan 50. */
export function batasHarianWa(env: EnvLike = process.env): number {
  const mentah = env.WA_NOTIF_BATAS_HARIAN?.trim();
  if (!mentah || !/^\d{1,5}$/.test(mentah)) return BATAS_HARIAN_WA_BAWAAN;
  const angka = Number(mentah);
  return angka > 0 ? angka : BATAS_HARIAN_WA_BAWAAN;
}
