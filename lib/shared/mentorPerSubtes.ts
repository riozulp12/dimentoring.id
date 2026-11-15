/**
 * Mentor per Subtes pada kelas (kelas_subtes_mentor) — logika MURNI (tanpa DB),
 * dipakai form & tabel Kelola Kelas serta penjaga simpan kelas.
 *
 * Satu subtes boleh dipegang BEBERAPA mentor (kunci utama tabel: kelas+subtes+mentor).
 * Bentuk datar (daftar pasangan) dipakai API/DB; bentuk kelompok (subtes -> mentor[])
 * dipakai form & tampilan.
 */

export interface PasanganSubtesMentor {
  subtesId: string;
  subtesNama: string;
  mentorId: string;
  mentorNama: string;
}

export interface KelompokMentorSubtes {
  subtesId: string;
  subtesNama: string;
  mentorIds: string[];
  mentorNama: string[];
}

/** Kelompokkan pasangan per subtes (urutan kemunculan pertama), pasangan kembar dibuang. */
export function kelompokkanMentorPerSubtes(pasangan: PasanganSubtesMentor[]): KelompokMentorSubtes[] {
  const hasil = new Map<string, KelompokMentorSubtes>();
  for (const p of pasangan) {
    let kelompok = hasil.get(p.subtesId);
    if (!kelompok) {
      kelompok = { subtesId: p.subtesId, subtesNama: p.subtesNama, mentorIds: [], mentorNama: [] };
      hasil.set(p.subtesId, kelompok);
    }
    if (kelompok.mentorIds.includes(p.mentorId)) continue;
    kelompok.mentorIds.push(p.mentorId);
    kelompok.mentorNama.push(p.mentorNama);
  }
  return Array.from(hasil.values());
}

/** "Kimia: A, B; Fisika: C" — semua nama mentor per subtes, subtes dipisah titik koma. */
export function formatMentorPerSubtes(pasangan: PasanganSubtesMentor[]): string {
  return kelompokkanMentorPerSubtes(pasangan)
    .map((k) => `${k.subtesNama}: ${k.mentorNama.join(", ")}`)
    .join("; ");
}

/** Peta subtesId -> mentorId[] dari pasangan tersimpan (untuk memuat form edit). */
export function petaMentorPerSubtes(pasangan: Pick<PasanganSubtesMentor, "subtesId" | "mentorId">[]): Record<string, string[]> {
  const peta: Record<string, string[]> = {};
  for (const p of pasangan) {
    const daftar = (peta[p.subtesId] ??= []);
    if (!daftar.includes(p.mentorId)) daftar.push(p.mentorId);
  }
  return peta;
}

/** Subtes unik (urutan kemunculan pertama) dari pasangan tersimpan. */
export function subtesUnikDariPasangan(pasangan: Pick<PasanganSubtesMentor, "subtesId">[]): string[] {
  return Array.from(new Set(pasangan.map((p) => p.subtesId)));
}

/**
 * Susun daftar pasangan datar untuk API dari subtes terpilih + peta mentor.
 * Urutan: sesuai urutan subtes terpilih, lalu urutan mentor. Mentor kembar dibuang.
 */
export function susunPasangan(
  subtesTerpilih: string[],
  petaMentor: Record<string, string[]>,
): { subtesId: string; mentorId: string }[] {
  const hasil: { subtesId: string; mentorId: string }[] = [];
  for (const subtesId of subtesTerpilih) {
    for (const mentorId of Array.from(new Set(petaMentor[subtesId] ?? []))) {
      hasil.push({ subtesId, mentorId });
    }
  }
  return hasil;
}

/** Subtes terpilih yang belum punya satu pun mentor (minimal 1 mentor per subtes). */
export function subtesTanpaMentor(subtesTerpilih: string[], petaMentor: Record<string, string[]>): string[] {
  return subtesTerpilih.filter((id) => (petaMentor[id] ?? []).length === 0);
}
