import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import {
  hitungProgresSesi,
  hitungSesiTerkonfirmasi,
  type ProgresSesi,
  type SesiStatusRow,
} from "@/lib/shared/progresSesi";

/**
 * Pengambilan data Progress Kehadiran per pendaftaran (enrollment) — satu
 * jalur untuk semua halaman yang menampilkan progress (lihat header
 * lib/shared/progresSesi.ts). Hanya membaca sesi_kelas; tidak mengubah apa pun.
 */

export interface PendaftaranProgresInput {
  /** enrollments.id */
  id: string;
  /** kelas.jumlah_sesi — total sesi paket. */
  jumlahSesi: number | null;
}

/** Map enrollment id → Progress Kehadiran. Pendaftaran tanpa baris sesi → 0%. */
export async function getProgresSesiPerPendaftaran(
  pendaftaran: PendaftaranProgresInput[],
): Promise<Map<string, ProgresSesi>> {
  const hasil = new Map<string, ProgresSesi>();
  if (pendaftaran.length === 0) return hasil;

  const { data, error } = await supabaseServer
    .from("sesi_kelas")
    .select("enrollment_id, dikonfirmasi_mentor, status_siswa")
    .in(
      "enrollment_id",
      pendaftaran.map((p) => p.id),
    );

  if (error) {
    console.error("[getProgresSesiPerPendaftaran] query sesi_kelas failed:", error);
  }

  const sesiPerPendaftaran = new Map<string, SesiStatusRow[]>();
  for (const sesi of (data ?? []) as unknown as (SesiStatusRow & { enrollment_id: string })[]) {
    const daftar = sesiPerPendaftaran.get(sesi.enrollment_id) ?? [];
    daftar.push(sesi);
    sesiPerPendaftaran.set(sesi.enrollment_id, daftar);
  }

  for (const p of pendaftaran) {
    hasil.set(
      p.id,
      hitungProgresSesi(hitungSesiTerkonfirmasi(sesiPerPendaftaran.get(p.id) ?? []), p.jumlahSesi ?? 0),
    );
  }
  return hasil;
}

/**
 * Id pendaftaran yang sudah RESMI KELUAR (enrollments.tanggal_keluar terisi,
 * db/add_honor_fondasi.sql). Kolom itu opsional di database — kalau belum ada
 * (migrasi belum dijalankan) query gagal, dicatat, dan tidak ada yang dianggap
 * keluar (daftar kosong), bukan membuat dashboard ikut gagal.
 */
export async function getPendaftaranKeluar(ids: string[]): Promise<Set<string>> {
  const keluar = new Set<string>();
  if (ids.length === 0) return keluar;

  const { data, error } = await supabaseServer.from("enrollments").select("id, tanggal_keluar").in("id", ids);
  if (error) {
    console.error("[getPendaftaranKeluar] query failed (kolom tanggal_keluar belum ada?):", error);
    return keluar;
  }
  for (const row of (data ?? []) as unknown as { id: string; tanggal_keluar?: string | null }[]) {
    if (row.tanggal_keluar) keluar.add(row.id);
  }
  return keluar;
}
