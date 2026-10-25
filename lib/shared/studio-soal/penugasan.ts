/**
 * Aturan penugasan mentor ke subtes Studio Soal (PR 3a; revisi K2 di
 * docs/design/studio-soal-snbt-tahap1.md, BR-37). Modul MURNI — tanpa import
 * server, dipakai API route, data layer, dan komponen klien.
 *
 * Sumber kebenaran tetap di database (db/add_studio_soal_penugasan.sql): RPC
 * studio_soal_atur_penugasan memeriksa Admin aktif, subtes SNBT, mentor aktif,
 * dan menulis log. Modul ini hanya validasi bentuk permintaan, terjemahan hasil
 * RPC, dan perhitungan tampilan (peringatan < 2 mentor).
 */

export const AKSI_PENUGASAN = ["tugaskan", "cabut"] as const;
export type AksiPenugasan = (typeof AKSI_PENUGASAN)[number];

/** Peer review butuh mentor lain; di bawah angka ini subtes diberi peringatan. */
export const MIN_MENTOR_PEER_REVIEW = 2;

/** Urutan tampil 7 subtes SNBT (sama dengan db/seed_subtes.sql). */
export const URUTAN_SUBTES_SNBT = [
  "Penalaran Umum",
  "Pengetahuan dan Pemahaman Umum",
  "Pemahaman Bacaan dan Menulis",
  "Pengetahuan Kuantitatif",
  "Literasi dalam Bahasa Indonesia",
  "Literasi dalam Bahasa Inggris",
  "Penalaran Matematika",
] as const;

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && POLA_UUID.test(value);
}

export type PermintaanPenugasan =
  | { ok: true; mentorId: string; subtesId: string; aksi: AksiPenugasan }
  | { ok: false; error: string };

/** Validasi bentuk body PATCH /api/admin/studio-soal/penugasan. */
export function parsePermintaanPenugasan(body: unknown): PermintaanPenugasan {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body request tidak valid." };
  }
  const { mentorId, subtesId, aksi } = body as Record<string, unknown>;
  if (!isUuid(mentorId)) return { ok: false, error: "Mentor tidak valid." };
  if (!isUuid(subtesId)) return { ok: false, error: "Subtes tidak valid." };
  if (typeof aksi !== "string" || !(AKSI_PENUGASAN as readonly string[]).includes(aksi)) {
    return { ok: false, error: "Aksi tidak valid." };
  }
  return { ok: true, mentorId: mentorId.toLowerCase(), subtesId: subtesId.toLowerCase(), aksi: aksi as AksiPenugasan };
}

export interface HasilPenugasan {
  httpStatus: number;
  success: boolean;
  /** false = permintaan sah tapi tidak ada yang berubah (idempotent). */
  berubah: boolean;
  pesan: string;
}

/** Terjemahkan status JSONB dari RPC studio_soal_atur_penugasan. */
export function terjemahkanHasilRpc(status: unknown): HasilPenugasan {
  switch (status) {
    case "ditugaskan":
      return { httpStatus: 200, success: true, berubah: true, pesan: "Mentor ditugaskan." };
    case "dicabut":
      return { httpStatus: 200, success: true, berubah: true, pesan: "Penugasan dicabut. Soal yang sudah ditulis tetap ada." };
    case "sudah_ditugaskan":
      return { httpStatus: 200, success: true, berubah: false, pesan: "Mentor sudah ditugaskan ke subtes ini." };
    case "tidak_ditugaskan":
      return { httpStatus: 200, success: true, berubah: false, pesan: "Mentor memang tidak ditugaskan ke subtes ini." };
    case "bukan_admin":
      return { httpStatus: 403, success: false, berubah: false, pesan: "Cuma Admin yang bisa mengubah penugasan." };
    case "subtes_tidak_valid":
      return { httpStatus: 400, success: false, berubah: false, pesan: "Subtes bukan subtes SNBT." };
    case "bukan_mentor_aktif":
      return { httpStatus: 400, success: false, berubah: false, pesan: "Akun ini bukan mentor aktif." };
    case "input_tidak_valid":
      return { httpStatus: 400, success: false, berubah: false, pesan: "Permintaan tidak valid." };
    default:
      return { httpStatus: 500, success: false, berubah: false, pesan: "Gagal menyimpan penugasan. Coba lagi nanti." };
  }
}

export interface PenugasanRow {
  mentorId: string;
  subtesId: string;
}

export const kunciPenugasan = (mentorId: string, subtesId: string) => `${mentorId}|${subtesId}`;

/**
 * Terapkan satu aksi ke daftar penugasan (state klien). Idempotent: tugaskan
 * pasangan yang sudah ada / cabut yang tidak ada mengembalikan daftar yang sama.
 */
export function terapkanAksi(daftar: PenugasanRow[], mentorId: string, subtesId: string, aksi: AksiPenugasan): PenugasanRow[] {
  const ada = daftar.some((p) => p.mentorId === mentorId && p.subtesId === subtesId);
  if (aksi === "tugaskan") return ada ? daftar : [...daftar, { mentorId, subtesId }];
  return ada ? daftar.filter((p) => !(p.mentorId === mentorId && p.subtesId === subtesId)) : daftar;
}

export type PeringatanSubtes = "kosong" | "satu" | null;

export interface RingkasanSubtes {
  subtesId: string;
  nama: string;
  /** Mentor AKTIF yang ditugaskan (yang benar-benar eligible). */
  jumlahMentor: number;
  peringatan: PeringatanSubtes;
}

export function peringatanUntuk(jumlahMentor: number): PeringatanSubtes {
  if (jumlahMentor <= 0) return "kosong";
  if (jumlahMentor < MIN_MENTOR_PEER_REVIEW) return "satu";
  return null;
}

export const PESAN_PERINGATAN: Record<Exclude<PeringatanSubtes, null>, string> = {
  kosong: "Belum ada mentor. Belum ada yang bisa menulis soal subtes ini.",
  satu: "Baru 1 mentor. Soalnya tidak bisa ditinjau sejawat, jadi Admin yang mempublikasikan.",
};

/** Urutkan subtes mengikuti URUTAN_SUBTES_SNBT; nama lain di belakang (abjad). */
export function urutkanSubtes<T extends { nama: string }>(subtes: T[]): T[] {
  const posisi = (nama: string) => {
    const i = (URUTAN_SUBTES_SNBT as readonly string[]).indexOf(nama);
    return i === -1 ? URUTAN_SUBTES_SNBT.length : i;
  };
  return [...subtes].sort((a, b) => posisi(a.nama) - posisi(b.nama) || a.nama.localeCompare(b.nama, "id"));
}

/**
 * Jumlah mentor eligible + peringatan per subtes. Hanya mentor aktif yang
 * dihitung (sama dengan studio_soal_hitung_peninjau_eligible di database).
 */
export function ringkasPenugasan(
  subtes: { id: string; nama: string }[],
  penugasan: PenugasanRow[],
  mentorAktifIds: Iterable<string>,
): RingkasanSubtes[] {
  const aktif = new Set(mentorAktifIds);
  return urutkanSubtes(subtes).map((s) => {
    const mentor = new Set(penugasan.filter((p) => p.subtesId === s.id && aktif.has(p.mentorId)).map((p) => p.mentorId));
    return { subtesId: s.id, nama: s.nama, jumlahMentor: mentor.size, peringatan: peringatanUntuk(mentor.size) };
  });
}
