import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Ketersediaan subtes pada kelas PAKET (siswa memilih subtes): sebuah subtes
 * "tersedia" HANYA kalau ada pasangan kelas_subtes_mentor untuk subtes itu
 * dengan mentor AKTIF. Dipakai SATU aturan yang sama oleh UI pilihan subtes di
 * checkout ("Belum tersedia", tidak bisa dipilih) dan oleh app/api/payment/create
 * (menolak subtes yang tetap dikirim klien).
 *
 * Aturan ketat — kelas_mentor (daftar datar, tanpa subtes) TIDAK dihitung sama
 * sekali, juga bukan sebagai fallback untuk kelas lama tanpa pasangan: sisa
 * sistem sudah memperlakukan paket lewat pasangan (notifikasi siswa baru hanya
 * ke mentor subtes yang dipilih, label mapel presensi dari pasangan), jadi
 * subtes tanpa pasangan mentor aktif tidak boleh dijual. Kelas lama tanpa
 * pasangan menjadi "Belum tersedia" sampai Admin memasangkan mentor per subtes
 * di Kelola Kelas.
 *
 * Mentor aktif = user_roles: role_type 'mentor', status 'active'.
 */

export interface SubtesPool {
  id: string;
  nama: string;
}

export interface SubtesKetersediaan extends SubtesPool {
  tersedia: boolean;
}

export interface KetersediaanKelas {
  subtes: SubtesKetersediaan[];
  /** Kelas ber-subtes yang SEMUA subtesnya tidak tersedia = tidak bisa dibeli.
   * Kelas tanpa subtes (pool kosong, mis. Konsultasi) tidak dibatasi di sini. */
  kelasBisaDibeli: boolean;
  /** id subtes di pool yang tidak tersedia. */
  subtesTidakTersediaIds: string[];
}

export interface InputKetersediaan {
  pool: SubtesPool[];
  /** Semua baris kelas_subtes_mentor kelas ini (mentor aktif maupun tidak). */
  pasangan: { subtesId: string; mentorId: string }[];
  aktifIds: ReadonlySet<string>;
}

/** Murni (tanpa DB). */
export function hitungKetersediaanSubtes(input: InputKetersediaan): KetersediaanKelas {
  const { pool, pasangan, aktifIds } = input;

  const subtesDenganMentorAktif = new Set(
    pasangan.filter((p) => aktifIds.has(p.mentorId)).map((p) => p.subtesId),
  );

  const subtes = pool.map((item) => ({ ...item, tersedia: subtesDenganMentorAktif.has(item.id) }));

  return {
    subtes,
    kelasBisaDibeli: subtes.length === 0 ? true : subtes.some((item) => item.tersedia),
    subtesTidakTersediaIds: subtes.filter((item) => !item.tersedia).map((item) => item.id),
  };
}

export type HasilCekSubtesDipilih = { ok: true } | { ok: false; error: string; subtesIds: string[] };

/**
 * Pilihan siswa tidak boleh memuat subtes yang tidak tersedia. Subtes yang tidak
 * ada di pool diabaikan di sini (validasi pool sudah dilakukan pemanggil).
 */
export function cekSubtesDipilihTersedia(ketersediaan: KetersediaanKelas, subtesIds: string[]): HasilCekSubtesDipilih {
  const tidakTersedia = new Set(ketersediaan.subtesTidakTersediaIds);
  const ditolak = Array.from(new Set(subtesIds)).filter((id) => tidakTersedia.has(id));
  if (ditolak.length === 0) return { ok: true };
  return {
    ok: false,
    error: "Ada subtes yang belum tersedia karena belum ada mentornya. Pilih subtes lain, ya.",
    subtesIds: ditolak,
  };
}

/**
 * Baca ketersediaan dari database untuk satu kelas. `pool` = subtes yang
 * ditawarkan kelas (hasil getKelasSubtesOptions, dioper pemanggil supaya tidak
 * ada dua sumber pool). Mengembalikan null kalau query gagal (sudah di-log) —
 * pemanggil memutuskan: UI menampilkan semua subtes, server menolak (fail-closed).
 */
export async function getKetersediaanSubtes(kelasId: string, pool: SubtesPool[]): Promise<KetersediaanKelas | null> {
  const pasanganRes = await supabaseServer.from("kelas_subtes_mentor").select("subtes_id, mentor_id").eq("kelas_id", kelasId);
  if (pasanganRes.error) {
    console.error("[getKetersediaanSubtes] query kelas_subtes_mentor gagal:", pasanganRes.error);
    return null;
  }

  const pasangan = ((pasanganRes.data ?? []) as unknown as { subtes_id: string; mentor_id: string }[]).map((row) => ({
    subtesId: row.subtes_id,
    mentorId: row.mentor_id,
  }));

  const mentorIds = Array.from(new Set(pasangan.map((p) => p.mentorId)));
  let aktifIds = new Set<string>();
  if (mentorIds.length > 0) {
    const rolesRes = await supabaseServer
      .from("user_roles")
      .select("user_id")
      .eq("role_type", "mentor")
      .eq("status", "active")
      .in("user_id", mentorIds);
    if (rolesRes.error) {
      console.error("[getKetersediaanSubtes] query user_roles gagal:", rolesRes.error);
      return null;
    }
    aktifIds = new Set(((rolesRes.data ?? []) as unknown as { user_id: string }[]).map((row) => row.user_id));
  }

  return hitungKetersediaanSubtes({ pool, pasangan, aktifIds });
}
