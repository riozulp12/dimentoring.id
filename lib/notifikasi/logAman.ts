/**
 * Pembantu log aman untuk notifikasi (email & WhatsApp): alamat email dan
 * nomor WA disamarkan, isi pesan & token TIDAK PERNAH ikut dicatat. Murni
 * (tanpa server-only) supaya mudah dites.
 */

/** "rio.zulfa@gmail.com" -> "r***@gmail.com". */
export function samarkanEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** "6281234567890" -> "6281****890" (4 digit awal + 3 digit akhir). */
export function samarkanNomor(nomor: string): string {
  const digit = nomor.replace(/\D/g, "");
  if (digit.length < 8) return "***";
  return `${digit.slice(0, 4)}****${digit.slice(-3)}`;
}

const POLA_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const POLA_NOMOR = /\+?\d[\d\s().-]{7,}\d/g;

/**
 * Ubah pesan galat dari layanan luar jadi teks pendek yang aman dicatat:
 * rahasia (mis. token) dihapus, email & nomor ditutup, dipotong 160 karakter.
 */
export function bersihkanGalat(galat: unknown, rahasia: ReadonlyArray<string | undefined> = []): string {
  let teks =
    typeof galat === "string"
      ? galat
      : galat && typeof galat === "object" && "message" in galat && typeof galat.message === "string"
        ? galat.message
        : "galat tak dikenal";
  for (const kunci of rahasia) {
    if (kunci) teks = teks.split(kunci).join("[disembunyikan]");
  }
  teks = teks.replace(POLA_EMAIL, "[email]").replace(POLA_NOMOR, "[nomor]").replace(/\s+/g, " ").trim();
  return teks.slice(0, 160) || "galat tak dikenal";
}
