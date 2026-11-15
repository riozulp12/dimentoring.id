/**
 * Ubah "Subtes yang Diampu" mentor — logika MURNI (tanpa DB), dipakai bersama
 * oleh endpoint kartu Info Mengajar (PATCH /api/mentor/subtes-diampu) dan rute
 * Edit Profil (PATCH /api/profil/update). Helper server: lib/mentor/ubahSubtesMentor.ts.
 *
 * Aturan (keputusan Rio):
 * - Subtes harus ada di master, tanpa duplikat, minimal 1.
 * - Penulisan = DIFF (tambah yang baru, lepas HANYA yang dilepas) — tidak pernah
 *   hapus-semua-lalu-sisip.
 * - Penjaga konservatif: subtes yang dilepas ditahan selama mentor itu masih
 *   tercatat di kelas_subtes_mentor untuk subtes itu (apa pun status kelasnya),
 *   atau masih memegang pendaftaran offline (enrollments.mentor_offline_id) pada
 *   kelas yang memuat subtes itu.
 */

export interface SubtesMaster {
  id: string;
  nama: string;
}

export type HasilValidasiSubtes =
  | { ok: true; subtesIds: string[] }
  | { ok: false; error: string; status: 400 };

export const PESAN_SUBTES_MINIMAL = "Pilih minimal satu Subtes yang Diampu.";
export const PESAN_SUBTES_TIDAK_DIKENAL = "Salah satu Subtes yang Diampu tidak dikenali sistem.";
export const PESAN_SUBTES_DUPLIKAT = "Subtes yang Diampu tidak boleh duplikat.";

/**
 * Validasi daftar NAMA subtes yang diminta terhadap master: array berisi string,
 * minimal 1, tanpa duplikat, semuanya ada di master. Mengembalikan id (urut sesuai input).
 */
export function validasiDaftarSubtes(input: unknown, master: SubtesMaster[]): HasilValidasiSubtes {
  if (!Array.isArray(input)) return { ok: false, error: PESAN_SUBTES_MINIMAL, status: 400 };
  const nama: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") return { ok: false, error: PESAN_SUBTES_TIDAK_DIKENAL, status: 400 };
    nama.push(item.trim());
  }
  if (nama.length === 0) return { ok: false, error: PESAN_SUBTES_MINIMAL, status: 400 };
  if (new Set(nama).size !== nama.length) return { ok: false, error: PESAN_SUBTES_DUPLIKAT, status: 400 };

  const idPerNama = new Map(master.map((s) => [s.nama, s.id]));
  const ids: string[] = [];
  for (const n of nama) {
    const id = idPerNama.get(n);
    if (!id) return { ok: false, error: PESAN_SUBTES_TIDAK_DIKENAL, status: 400 };
    ids.push(id);
  }
  return { ok: true, subtesIds: ids };
}

export interface DiffSubtes {
  /** Ada di daftar baru, belum ada di daftar saat ini -> disisipkan. */
  tambah: string[];
  /** Ada di daftar saat ini, tidak ada di daftar baru -> dilepas (setelah lolos penjaga). */
  lepas: string[];
}

export function hitungDiffSubtes(saatIni: string[], baru: string[]): DiffSubtes {
  const ada = new Set(saatIni);
  const mau = new Set(baru);
  return {
    tambah: baru.filter((id, i) => !ada.has(id) && baru.indexOf(id) === i),
    lepas: saatIni.filter((id, i) => !mau.has(id) && saatIni.indexOf(id) === i),
  };
}

export type SumberPenahan = "kelas" | "offline";

export interface PemakaianSubtes {
  subtesId: string;
  sumber: SumberPenahan;
}

export interface SubtesTertahan {
  subtesId: string;
  nama: string;
  sumber: SumberPenahan[];
  alasan: string;
}

function gabungNama(nama: string[]): string {
  return nama.join(", ");
}

/** Alasan per subtes (dipakai UI di samping chip yang tertahan). */
export function alasanTertahan(nama: string, sumber: SumberPenahan[]): string {
  const dipakaiDiKelas = sumber.includes("kelas");
  if (dipakaiDiKelas) return `Subtes ${nama} masih dipakai di kelas. Hubungi Admin untuk memindahkannya.`;
  return `Subtes ${nama} masih dipakai pada siswa kelas offline yang kamu pegang. Hubungi Admin untuk memindahkannya.`;
}

/**
 * Subtes yang dilepas DAN masih dipakai -> tertahan. Hanya subtes yang ada di
 * `lepas` yang dipertimbangkan (pemakaian subtes yang tidak dilepas diabaikan).
 */
export function tentukanTertahan(lepas: string[], pemakaian: PemakaianSubtes[], namaPerId: Map<string, string>): SubtesTertahan[] {
  const hasil: SubtesTertahan[] = [];
  for (const subtesId of lepas) {
    const sumber = Array.from(new Set(pemakaian.filter((p) => p.subtesId === subtesId).map((p) => p.sumber)));
    if (sumber.length === 0) continue;
    const nama = namaPerId.get(subtesId) ?? subtesId;
    hasil.push({ subtesId, nama, sumber, alasan: alasanTertahan(nama, sumber) });
  }
  return hasil;
}

/** Pesan 409 gabungan bila satu atau lebih subtes tertahan. */
export function pesanTertahan(tertahan: SubtesTertahan[]): string {
  const dikelas = tertahan.filter((t) => t.sumber.includes("kelas"));
  const hanyaOffline = tertahan.filter((t) => !t.sumber.includes("kelas"));
  const bagian: string[] = [];
  if (dikelas.length > 0) {
    bagian.push(`Subtes ${gabungNama(dikelas.map((t) => t.nama))} masih dipakai di kelas.`);
  }
  if (hanyaOffline.length > 0) {
    bagian.push(`Subtes ${gabungNama(hanyaOffline.map((t) => t.nama))} masih dipakai pada siswa kelas offline yang kamu pegang.`);
  }
  return `${bagian.join(" ")} Hubungi Admin untuk memindahkannya.`;
}
