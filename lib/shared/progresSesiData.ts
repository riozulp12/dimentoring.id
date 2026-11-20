import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { kuotaSubtes, totalSesiEnrollment } from "@/lib/shared/sesiEnrollment";
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
  /** kelas.jumlah_sesi — total sesi paket kelas; DIGANTI enrollments.jumlah_sesi_total bila terisi (sesi pilihan siswa). */
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
    .select("enrollment_id, dikonfirmasi_mentor, dikonfirmasi_mentor_pada, status_siswa, dikonfirmasi_siswa_pada")
    .in(
      "enrollment_id",
      pendaftaran.map((p) => p.id),
    );

  if (error) {
    console.error("[getProgresSesiPerPendaftaran] query sesi_kelas failed:", error);
  }

  // Total sesi MILIK SISWA: enrollments.jumlah_sesi_total bila terisi, selain itu kelas.jumlah_sesi (NULL = perilaku lama).
  const totalPerPendaftaran = new Map<string, number>();
  const { data: totalRows, error: totalError } = await supabaseServer
    .from("enrollments")
    .select("id, jumlah_sesi_total")
    .in(
      "id",
      pendaftaran.map((p) => p.id),
    );
  if (totalError) {
    console.error("[getProgresSesiPerPendaftaran] query enrollments.jumlah_sesi_total failed:", totalError);
  }
  for (const row of (totalRows ?? []) as unknown as { id: string; jumlah_sesi_total?: number | null }[]) {
    if (typeof row.jumlah_sesi_total === "number") totalPerPendaftaran.set(row.id, row.jumlah_sesi_total);
  }

  const now = new Date();
  const sesiPerPendaftaran = new Map<string, SesiStatusRow[]>();
  for (const sesi of (data ?? []) as unknown as (SesiStatusRow & { enrollment_id: string })[]) {
    const daftar = sesiPerPendaftaran.get(sesi.enrollment_id) ?? [];
    daftar.push(sesi);
    sesiPerPendaftaran.set(sesi.enrollment_id, daftar);
  }

  for (const p of pendaftaran) {
    hasil.set(
      p.id,
      hitungProgresSesi(
        hitungSesiTerkonfirmasi(sesiPerPendaftaran.get(p.id) ?? [], now),
        totalSesiEnrollment({ jumlah_sesi_total: totalPerPendaftaran.get(p.id) ?? null }, { jumlah_sesi: p.jumlahSesi }) ?? 0,
      ),
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

export interface SisaSesiSubtes {
  subtesId: string;
  nama: string;
  kuota: number;
  /** max(0, kuota - sesi subtes ini yang sudah ditandai mentor). */
  sisa: number;
}

/**
 * Sisa sesi per subtes untuk siswa — HANYA pendaftaran yang punya kuota per subtes (enrollment_subtes.kuota_sesi terisi);
 * pendaftaran lain tidak ada di hasil (tampilan lama). Subtes tanpa kuota tidak ditampilkan. Gagal baca = kosong (dicatat).
 */
export async function getSisaSesiPerSubtes(enrollmentIds: string[]): Promise<Map<string, SisaSesiSubtes[]>> {
  const hasil = new Map<string, SisaSesiSubtes[]>();
  if (enrollmentIds.length === 0) return hasil;

  const [subtesRes, sesiRes] = await Promise.all([
    supabaseServer.from("enrollment_subtes").select("enrollment_id, subtes_id, kuota_sesi, subtes:subtes_id(nama)").in("enrollment_id", enrollmentIds),
    supabaseServer.from("sesi_kelas").select("enrollment_id, subtes_id").in("enrollment_id", enrollmentIds).eq("dikonfirmasi_mentor", true),
  ]);
  if (subtesRes.error || sesiRes.error) {
    console.error("[getSisaSesiPerSubtes] query failed:", subtesRes.error ?? sesiRes.error);
    return hasil;
  }
  const terpakai = new Map<string, number>();
  for (const row of (sesiRes.data ?? []) as unknown as { enrollment_id: string; subtes_id?: string | null }[]) {
    if (!row.subtes_id) continue;
    const kunci = `${row.enrollment_id}|${row.subtes_id}`;
    terpakai.set(kunci, (terpakai.get(kunci) ?? 0) + 1);
  }
  type Row = { enrollment_id: string; subtes_id: string; kuota_sesi?: number | null; subtes?: { nama: string } | { nama: string }[] | null };
  for (const row of (subtesRes.data ?? []) as unknown as Row[]) {
    const kuota = kuotaSubtes(row);
    if (kuota === null) continue;
    const subtes = Array.isArray(row.subtes) ? (row.subtes[0] ?? null) : (row.subtes ?? null);
    const daftar = hasil.get(row.enrollment_id) ?? [];
    daftar.push({
      subtesId: row.subtes_id,
      nama: subtes?.nama ?? "Subtes",
      kuota,
      sisa: Math.max(0, kuota - (terpakai.get(`${row.enrollment_id}|${row.subtes_id}`) ?? 0)),
    });
    hasil.set(row.enrollment_id, daftar);
  }
  return hasil;
}
