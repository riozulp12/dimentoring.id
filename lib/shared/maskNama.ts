export interface NamaJoin {
  nama: string;
  nama_panggilan: string | null;
}

/**
 * Alias privasi (BR-12, BR-14) — dipakai di Leaderboard publik
 * (app/leaderboard/page.tsx, components/sections/Leaderboard.tsx) dan
 * Riwayat Referral (lib/referral/getReferralData.ts): nama_panggilan kalau
 * orangnya sudah isi, kalau belum huruf pertama nama + "***". SATU tempat
 * supaya polanya konsisten di semua tempat yang menampilkan nama publik
 * anak di bawah umur — jangan duplikasi logic ini di file lain.
 */
export function maskNama(person: NamaJoin | null): string {
  if (!person) return "***";
  if (person.nama_panggilan && person.nama_panggilan.trim()) return person.nama_panggilan.trim();
  const source = person.nama.trim();
  if (!source) return "***";
  return `${source[0].toUpperCase()}***`;
}
