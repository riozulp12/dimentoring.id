/**
 * Teks WhatsApp "siswa baru" untuk mentor. SENGAJA hanya memuat nama mentor
 * dan nama kelas — tanpa nama, nomor, atau email siswa (WhatsApp kurang
 * terlindungi dibanding halaman web). Satu tautan, domain dimentoring.id.
 */

function bersihkan(teks: string, maks: number): string {
  // satu baris saja: buang baris baru/tab/karakter kontrol supaya nama tidak bisa menyisipkan format pesan
  return teks.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maks);
}

export function buatPesanWaSiswaBaru(namaMentor: string, namaKelas: string, subtesKlaim?: string | null): string {
  const mentor = bersihkan(namaMentor, 60) || "Mentor";
  const kelas = bersihkan(namaKelas, 80) || "kamu";
  const subtes = subtesKlaim ? bersihkan(subtesKlaim, 80) : "";
  if (subtes) {
    // Subtes yang dipegang beberapa mentor: siapa menerima lebih dulu mengajar siswa itu.
    return `Halo Kak ${mentor}, ada siswa baru di kelas ${kelas} (subtes ${subtes}). Siapa yang menerima lebih dulu akan mengajar siswa ini. Buka dimentoring.id/kelas-saya untuk menerima. Terima kasih, tim Dimentoring.`;
  }
  return `Halo Kak ${mentor}, ada siswa baru di kelas ${kelas}. Buka dimentoring.id/kelas-saya untuk melihat kelas dan siswa barumu. Terima kasih, tim Dimentoring.`;
}
