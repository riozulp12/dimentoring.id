/**
 * Penjaga LEPAS mentor dari subtes pada kelas — logika MURNI (tanpa DB).
 *
 * Aturan (keputusan Rio): seorang mentor TIDAK boleh dilepas dari sebuah subtes di
 * sebuah kelas selama dia masih tercatat sebagai penerima (enrollment_subtes.mentor_id)
 * untuk siswa kelas itu pada subtes itu. Admin harus memindahkan siswanya dulu.
 */

export interface PasanganKelas {
  subtesId: string;
  mentorId: string;
}

export interface PerubahanPasangan {
  /** Ada di pasangan lama, tidak ada di pasangan baru. */
  dilepas: PasanganKelas[];
  /** Ada di pasangan baru, belum ada di pasangan lama. */
  ditambah: PasanganKelas[];
}

const kunci = (p: PasanganKelas) => `${p.subtesId}|${p.mentorId}`;

export function hitungPerubahanPasangan(lama: PasanganKelas[], baru: PasanganKelas[]): PerubahanPasangan {
  const kunciLama = new Set(lama.map(kunci));
  const kunciBaru = new Set(baru.map(kunci));
  const unik = (daftar: PasanganKelas[]) => {
    const dilihat = new Set<string>();
    return daftar.filter((p) => (dilihat.has(kunci(p)) ? false : (dilihat.add(kunci(p)), true)));
  };
  return {
    dilepas: unik(lama.filter((p) => !kunciBaru.has(kunci(p)))),
    ditambah: unik(baru.filter((p) => !kunciLama.has(kunci(p)))),
  };
}

export interface MentorTertahan extends PasanganKelas {
  mentorNama: string;
  subtesNama: string;
  /** Jumlah siswa (baris enrollment_subtes) yang masih dipegang. */
  jumlahSiswa: number;
}

/**
 * Pasangan yang dilepas DAN masih jadi penerima siswa -> tertahan.
 * `pemegang` = baris enrollment_subtes (subtes, mentor penerima) milik siswa kelas ini.
 */
export function tentukanMentorTertahan(
  dilepas: PasanganKelas[],
  pemegang: PasanganKelas[],
  namaMentor: Map<string, string>,
  namaSubtes: Map<string, string>,
): MentorTertahan[] {
  const hasil: MentorTertahan[] = [];
  for (const p of dilepas) {
    const jumlah = pemegang.filter((h) => h.subtesId === p.subtesId && h.mentorId === p.mentorId).length;
    if (jumlah === 0) continue;
    hasil.push({
      ...p,
      jumlahSiswa: jumlah,
      mentorNama: namaMentor.get(p.mentorId) ?? p.mentorId,
      subtesNama: namaSubtes.get(p.subtesId) ?? p.subtesId,
    });
  }
  return hasil;
}

/** Pesan 409. Satu temuan: "Mentor X masih memegang siswa di subtes Y. Pindahkan siswanya dulu." */
export function pesanMentorTertahan(tertahan: MentorTertahan[]): string {
  const [pertama, ...sisa] = tertahan;
  if (!pertama) return "";
  const kalimat = (t: MentorTertahan) => `Mentor ${t.mentorNama} masih memegang siswa di subtes ${t.subtesNama}.`;
  return [kalimat(pertama), ...sisa.map(kalimat)].join(" ") + " Pindahkan siswanya dulu.";
}
