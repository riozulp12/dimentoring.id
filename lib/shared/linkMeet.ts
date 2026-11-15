/**
 * Link Meet — logika murni (tanpa DB), dipakai server dan UI.
 *
 * Kelas PRIVATE: tiap siswa punya link Meet sendiri (enrollments.link_meet), diisi
 * mentor yang menerima siswa itu. TIDAK PERNAH jatuh ke link kelas (kelas.link_meet) —
 * link kelas bisa bersama untuk siswa lain dan bukan milik siswa ini.
 * Kelas grup/semi-private (dan tipe tidak dikenal): link kelas, seperti sebelumnya.
 */

/** URL http/https yang valid (menolak javascript:, data:, teks bebas). */
export function isValidLinkUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isKelasPrivate(tipeKelas: string | null | undefined): boolean {
  return tipeKelas === "private";
}

export type SumberLinkMeet = "enrollment" | "kelas" | "tidak_ada";

export interface HasilLinkMeet {
  link: string | null;
  sumber: SumberLinkMeet;
  /** Private: ada link tersimpan tapi tidak berlaku (pengisinya bukan lagi mentor penerima/pemegang aktif, atau URL rusak). */
  tidakBerlaku: boolean;
}

export interface InputResolveLinkMeet {
  tipeKelas: string | null | undefined;
  /** enrollments.link_meet */
  linkEnrollment: string | null | undefined;
  /** enrollments.link_meet_oleh — null + link terisi = diisi Admin (atau akun pengisi dihapus). */
  linkEnrollmentOleh: string | null | undefined;
  /** Mentor yang SAAT INI berhak atas siswa ini (penerima / pemegang aktif) — lihat mentorBerhakDariSubtes. */
  penerimaMentorIds: string[];
  /** kelas.link_meet */
  linkKelas: string | null | undefined;
}

function bersih(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Link Meet yang berlaku untuk SATU siswa.
 *  - private: hanya link milik enrollment; berlaku bila URL valid DAN (diisi Admin/pengisi
 *    terhapus [oleh kosong] ATAU pengisinya masih termasuk penerimaMentorIds). TANPA fallback ke link kelas.
 *  - selain private: link kelas (URL tak valid dianggap kosong).
 */
export function resolveLinkMeet(input: InputResolveLinkMeet): HasilLinkMeet {
  if (!isKelasPrivate(input.tipeKelas)) {
    const linkKelas = bersih(input.linkKelas);
    return linkKelas && isValidLinkUrl(linkKelas)
      ? { link: linkKelas, sumber: "kelas", tidakBerlaku: false }
      : { link: null, sumber: "tidak_ada", tidakBerlaku: false };
  }

  const link = bersih(input.linkEnrollment);
  if (!link) return { link: null, sumber: "tidak_ada", tidakBerlaku: false };

  const olehBerhak = !input.linkEnrollmentOleh || input.penerimaMentorIds.includes(input.linkEnrollmentOleh);
  if (!isValidLinkUrl(link) || !olehBerhak) return { link: null, sumber: "tidak_ada", tidakBerlaku: true };
  return { link, sumber: "enrollment", tidakBerlaku: false };
}

export interface SubtesBerhak {
  status: "tidak_perlu_klaim" | "menunggu" | "diterima";
  mentorIdPenerima: string | null;
  /** Mentor AKTIF pemegang subtes itu di kelas itu. */
  mentorAktifSubtes: string[];
}

/**
 * Mentor yang SAAT INI berhak atas siswa ini (boleh mengisi / link-nya berlaku):
 *  - subtes "diterima" → mentor penerimanya;
 *  - subtes "tidak_perlu_klaim" → pemegang aktifnya (siswa 1 mentor / siswa lama);
 *  - subtes "menunggu" → tidak ada;
 *  - subtes tanpa pemegang aktif sama sekali, atau siswa tanpa pilihan subtes → mentor tingkat kelas
 *    (mentorKelasIds = kelas.mentor_id + kelas_mentor, yang aktif) — sama dengan perilaku otorisasi presensi.
 */
export function mentorBerhakDariSubtes(subtesSiswa: SubtesBerhak[], mentorKelasIds: string[]): string[] {
  if (subtesSiswa.length === 0) return Array.from(new Set(mentorKelasIds));
  const hasil = new Set<string>();
  for (const subtes of subtesSiswa) {
    if (subtes.status === "diterima") {
      if (subtes.mentorIdPenerima) hasil.add(subtes.mentorIdPenerima);
    } else if (subtes.status === "tidak_perlu_klaim") {
      if (subtes.mentorAktifSubtes.length > 0) subtes.mentorAktifSubtes.forEach((id) => hasil.add(id));
      else mentorKelasIds.forEach((id) => hasil.add(id));
    }
  }
  return Array.from(hasil);
}
