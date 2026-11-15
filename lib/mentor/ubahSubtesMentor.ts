import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import {
  hitungDiffSubtes,
  pesanTertahan,
  tentukanTertahan,
  validasiDaftarSubtes,
  type PemakaianSubtes,
  type SubtesTertahan,
} from "@/lib/shared/ubahSubtesMentor";

/**
 * Helper server bersama untuk mengubah mentor_subtes_diampu — dipakai
 * PATCH /api/mentor/subtes-diampu (kartu Info Mengajar) dan PATCH /api/profil/update
 * (Edit Profil). Aturan murni: lib/shared/ubahSubtesMentor.ts.
 *
 * Dua tahap supaya pemanggil bisa menolak SEBELUM menulis apa pun:
 *   1. rencanakanUbahSubtes — HANYA membaca (master, profil, daftar saat ini, penjaga).
 *      Gagal baca di mana pun = 500 fail-closed, belum ada yang ditulis.
 *   2. terapkanUbahSubtes — penulisan DIFF: sisipkan yang baru dulu, baru lepas HANYA
 *      subtes yang dilepas. Tidak pernah hapus-semua-lalu-sisip, jadi subtes yang tidak
 *      dilepas tidak bisa hilang walau langkah kedua gagal di tengah jalan.
 *
 * Catatan: cek penjaga dan penghapusan tidak dalam satu transaksi DB. Celah balapan
 * (Admin memasang mentor ke kelas tepat di antara keduanya) praktis sempit, dan
 * validateKelasInput tetap menolak pasangan yang tidak cocok profil pada simpan kelas berikutnya.
 */

export type RencanaSubtes =
  | { ok: true; mentorProfileId: string; tambah: string[]; lepas: string[] }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string; tertahan?: SubtesTertahan[] };

const GAGAL_BACA = "Gagal memeriksa Subtes yang Diampu. Coba lagi nanti.";

/** Pemakaian subtes (hanya untuk subtes di `lepas`) oleh mentor ini: kelas_subtes_mentor + pendaftaran offline. */
async function cariPemakaian(userId: string, lepas: string[]): Promise<PemakaianSubtes[] | "gagal"> {
  const pasangan = await supabaseServer
    .from("kelas_subtes_mentor")
    .select("subtes_id")
    .eq("mentor_id", userId)
    .in("subtes_id", lepas);
  if (pasangan.error) {
    console.error("[ubahSubtesMentor] query kelas_subtes_mentor failed:", pasangan.error);
    return "gagal";
  }
  const pemakaian: PemakaianSubtes[] = ((pasangan.data ?? []) as { subtes_id: string }[]).map((r) => ({
    subtesId: r.subtes_id,
    sumber: "kelas",
  }));

  const offline = await supabaseServer.from("enrollments").select("kelas_id").eq("mentor_offline_id", userId);
  if (offline.error) {
    console.error("[ubahSubtesMentor] query enrollments (offline) failed:", offline.error);
    return "gagal";
  }
  const kelasIds = Array.from(new Set(((offline.data ?? []) as { kelas_id: string }[]).map((r) => r.kelas_id)));
  if (kelasIds.length > 0) {
    const [viaPaket, viaKolomLama] = await Promise.all([
      supabaseServer.from("kelas_subtes").select("subtes_id").in("kelas_id", kelasIds).in("subtes_id", lepas),
      supabaseServer.from("kelas").select("subtes_id").in("id", kelasIds).in("subtes_id", lepas),
    ]);
    if (viaPaket.error || viaKolomLama.error) {
      console.error("[ubahSubtesMentor] query subtes kelas offline failed:", viaPaket.error ?? viaKolomLama.error);
      return "gagal";
    }
    for (const r of (viaPaket.data ?? []) as { subtes_id: string }[]) pemakaian.push({ subtesId: r.subtes_id, sumber: "offline" });
    for (const r of (viaKolomLama.data ?? []) as { subtes_id: string }[]) pemakaian.push({ subtesId: r.subtes_id, sumber: "offline" });
  }
  return pemakaian;
}

export async function rencanakanUbahSubtes(userId: string, namaDiminta: unknown): Promise<RencanaSubtes> {
  const master = await supabaseServer.from("subtes").select("id, nama");
  if (master.error) {
    console.error("[ubahSubtesMentor] query subtes failed:", master.error);
    return { ok: false, status: 500, error: GAGAL_BACA };
  }
  const daftarMaster = (master.data ?? []) as { id: string; nama: string }[];

  const valid = validasiDaftarSubtes(namaDiminta, daftarMaster);
  if (!valid.ok) return { ok: false, status: valid.status, error: valid.error };

  const profil = await supabaseServer.from("mentor_profiles").select("id").eq("user_id", userId).maybeSingle();
  if (profil.error) {
    console.error("[ubahSubtesMentor] query mentor_profiles failed:", profil.error);
    return { ok: false, status: 500, error: GAGAL_BACA };
  }
  const mentorProfileId = (profil.data as { id: string } | null)?.id;
  if (!mentorProfileId) return { ok: false, status: 404, error: "Profil mentor tidak ditemukan." };

  const saatIniRes = await supabaseServer.from("mentor_subtes_diampu").select("subtes_id").eq("mentor_profile_id", mentorProfileId);
  if (saatIniRes.error) {
    console.error("[ubahSubtesMentor] query mentor_subtes_diampu failed:", saatIniRes.error);
    return { ok: false, status: 500, error: GAGAL_BACA };
  }
  const saatIni = ((saatIniRes.data ?? []) as { subtes_id: string }[]).map((r) => r.subtes_id);

  const { tambah, lepas } = hitungDiffSubtes(saatIni, valid.subtesIds);

  if (lepas.length > 0) {
    const pemakaian = await cariPemakaian(userId, lepas);
    if (pemakaian === "gagal") return { ok: false, status: 500, error: GAGAL_BACA };
    const namaPerId = new Map(daftarMaster.map((s) => [s.id, s.nama]));
    const tertahan = tentukanTertahan(lepas, pemakaian, namaPerId);
    if (tertahan.length > 0) return { ok: false, status: 409, error: pesanTertahan(tertahan), tertahan };
  }

  return { ok: true, mentorProfileId, tambah, lepas };
}

export async function terapkanUbahSubtes(
  rencana: Extract<RencanaSubtes, { ok: true }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gagal = { ok: false as const, error: "Gagal menyimpan Subtes yang Diampu. Coba lagi nanti." };

  // 1) Sisipkan yang baru DULU. Gagal di sini = tidak ada yang berubah.
  if (rencana.tambah.length > 0) {
    const { error } = await supabaseServer
      .from("mentor_subtes_diampu")
      .insert(rencana.tambah.map((subtesId) => ({ mentor_profile_id: rencana.mentorProfileId, subtes_id: subtesId })));
    if (error) {
      console.error("[ubahSubtesMentor] insert mentor_subtes_diampu failed:", error);
      return gagal;
    }
  }

  // 2) Lepas HANYA yang dilepas (sudah lolos penjaga). Subtes lain tidak pernah disentuh.
  if (rencana.lepas.length > 0) {
    const { error } = await supabaseServer
      .from("mentor_subtes_diampu")
      .delete()
      .eq("mentor_profile_id", rencana.mentorProfileId)
      .in("subtes_id", rencana.lepas);
    if (error) {
      console.error("[ubahSubtesMentor] delete mentor_subtes_diampu failed:", error);
      return gagal;
    }
  }
  return { ok: true };
}
