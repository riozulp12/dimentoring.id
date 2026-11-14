/**
 * Nama mentor kelas untuk tampilan SISWA — bagian MURNI (tanpa database), supaya
 * aturannya bisa dites sendiri. Pembacaan datanya ada di lib/kelas/namaMentor.ts.
 *
 * Sumber (urutan): kelas_subtes_mentor + kelas_mentor (digabung, unik per
 * mentor) → kalau KEDUANYA tidak punya baris sama sekali (kelas lama), pakai
 * kelas.mentor_id (kolom lama, DEPRECATED). Hanya mentor AKTIF yang tampil.
 * Mentor nonaktif tidak pernah dimunculkan lewat jalur apa pun, termasuk
 * fallback: kelas yang punya baris tapi semuanya nonaktif = tidak ada nama.
 */

export interface MentorRef {
  id: string;
  nama: string;
}

/** Nama yang ditampilkan paling banyak segini; sisanya jadi "+N lainnya". */
export const MAKS_NAMA_MENTOR_TAMPIL = 3;

export interface InputMentorKelas {
  /** Baris kelas_subtes_mentor kelas ini (boleh berisi mentor nonaktif). */
  pasangan: MentorRef[];
  /** Baris kelas_mentor kelas ini (boleh berisi mentor nonaktif). */
  umum: MentorRef[];
  /** kelas.mentor_id (kolom lama) bila ada. */
  lama: MentorRef | null;
  /** id mentor dengan peran mentor berstatus active. */
  aktifIds: ReadonlySet<string>;
}

/** Mentor aktif untuk satu kelas: unik per id, urut abjad (stabil). */
export function tentukanMentorKelas(input: InputMentorKelas): MentorRef[] {
  const { pasangan, umum, lama, aktifIds } = input;

  const kandidat = pasangan.length > 0 || umum.length > 0 ? [...pasangan, ...umum] : lama ? [lama] : [];

  const unik = new Map<string, MentorRef>();
  for (const mentor of kandidat) {
    const nama = mentor.nama?.trim();
    if (!nama || !aktifIds.has(mentor.id) || unik.has(mentor.id)) continue;
    unik.set(mentor.id, { id: mentor.id, nama });
  }
  return Array.from(unik.values()).sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

/**
 * "A" | "A, B" | "A, B, C" | "A, B, C +2 lainnya". null kalau tidak ada nama
 * (pemanggil menampilkan "Mentor belum ditentukan").
 */
export function formatNamaMentor(nama: string[], maks: number = MAKS_NAMA_MENTOR_TAMPIL): string | null {
  if (nama.length === 0) return null;
  if (nama.length <= maks) return nama.join(", ");
  return `${nama.slice(0, maks).join(", ")} +${nama.length - maks} lainnya`;
}
