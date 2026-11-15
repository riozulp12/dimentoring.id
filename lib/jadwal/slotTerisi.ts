import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { parseJadwalSlots } from "@/lib/shared/jadwalPilihan";
import {
  hitungKapasitasKelas,
  type KapasitasKelas,
} from "@/lib/shared/kapasitasKelas";
import {
  hitungSlotTerisi,
  kelasMemakaiSlot,
  ringkasSlot,
  slotEfektif,
  type StatusSlot,
} from "@/lib/shared/slotTerisi";

/**
 * Pembaca server untuk ketersediaan kelas: kapasitas (lib/shared/kapasitasKelas.ts) dan slot jadwal
 * terisi (lib/shared/slotTerisi.ts). SENGAJA di luar lib/payment — dipakai halaman (checkout, katalog,
 * detail) dan app/api/payment/create.
 *
 * Sumber data: kelas.jadwal, enrollments LUNAS (jadwal_ditetapkan, jadwal_pilihan), kelas_subtes
 * (fallback kelas.subtes_id), dan mentor AKTIF pemegang subtes = kelas_subtes_mentor ∩ user_roles
 * ('mentor','active') — tanpa fallback ke kelas_mentor (kelas_mentor tidak punya subtes).
 *
 * Banyak kelas sekaligus: jumlah query tetap (maks. 5), bukan per kelas. Galat database mana pun →
 * `null` (sudah di-log): pemanggil memutuskan — UI menampilkan apa adanya (server tetap penjaga),
 * server menolak penjualan sementara (fail-closed).
 */

export interface KelasKetersediaanInput {
  id: string;
  tipe_kelas: string | null;
  mode_pembelajaran: string | null;
  jadwal_pilih_siswa: boolean | null;
  jadwal: unknown;
  /** kelas.kapasitas — boleh kosong (opsional). */
  kapasitas: number | null;
  /** kelas.subtes_id (kolom lama) — fallback pool subtes bila kelas belum punya baris kelas_subtes. */
  subtes_id: string | null;
}

export interface KetersediaanKelas {
  kapasitas: KapasitasKelas;
  /** Aturan slot berlaku untuk kelas ini (private + online + saklar + 1 subtes). */
  memakaiSlot: boolean;
  /** Status tiap slot; kosong bila kelas tidak memakai slot. */
  slot: StatusSlot[];
}

/** Kolom kelas yang dibutuhkan pembaca ini — dipakai pemanggil yang membaca kelas sendiri. */
export const KELAS_KETERSEDIAAN_SELECT = "id, tipe_kelas, mode_pembelajaran, jadwal_pilih_siswa, jadwal, kapasitas, subtes_id";

type EnrollmentRow = { kelas_id: string; jadwal_pilihan: unknown; jadwal_ditetapkan: unknown };

export async function hitungKetersediaanKelas(
  rows: KelasKetersediaanInput[],
): Promise<Map<string, KetersediaanKelas> | null> {
  const hasil = new Map<string, KetersediaanKelas>();
  if (rows.length === 0) return hasil;
  const kelasIds = rows.map((row) => row.id);

  const { data: enrollmentRows, error: enrollmentError } = await supabaseServer
    .from("enrollments")
    .select("kelas_id, jadwal_pilihan, jadwal_ditetapkan")
    .eq("status_pembayaran", "lunas")
    .in("kelas_id", kelasIds);
  if (enrollmentError) {
    console.error("[hitungKetersediaanKelas] query enrollments gagal:", enrollmentError);
    return null;
  }
  const lunasPerKelas = new Map<string, EnrollmentRow[]>();
  for (const row of (enrollmentRows ?? []) as unknown as EnrollmentRow[]) {
    const daftar = lunasPerKelas.get(row.kelas_id) ?? [];
    daftar.push(row);
    lunasPerKelas.set(row.kelas_id, daftar);
  }

  // Kandidat aturan slot (murah: tanpa query) — baru dicek jumlah subtes & mentor bila ada.
  const kandidat = rows.filter(
    (row) =>
      row.tipe_kelas === "private" &&
      row.mode_pembelajaran === "online" &&
      row.jadwal_pilih_siswa === true &&
      parseJadwalSlots(row.jadwal).length >= 1,
  );

  const subtesPerKelas = new Map<string, Set<string>>();
  const mentorAktifPerKelas = new Map<string, number>();
  if (kandidat.length > 0) {
    const kandidatIds = kandidat.map((row) => row.id);
    const { data: subtesRows, error: subtesError } = await supabaseServer
      .from("kelas_subtes")
      .select("kelas_id, subtes_id")
      .in("kelas_id", kandidatIds);
    if (subtesError) {
      console.error("[hitungKetersediaanKelas] query kelas_subtes gagal:", subtesError);
      return null;
    }
    for (const row of (subtesRows ?? []) as { kelas_id: string; subtes_id: string }[]) {
      const set = subtesPerKelas.get(row.kelas_id) ?? new Set<string>();
      set.add(row.subtes_id);
      subtesPerKelas.set(row.kelas_id, set);
    }
    // Kelas lama tanpa baris kelas_subtes: pool = kelas.subtes_id (sama dengan getKelasSubtesOptions).
    for (const row of kandidat) {
      if (!subtesPerKelas.has(row.id) && row.subtes_id) subtesPerKelas.set(row.id, new Set([row.subtes_id]));
    }

    const tepatSatu = kandidat.filter((row) => subtesPerKelas.get(row.id)?.size === 1);
    if (tepatSatu.length > 0) {
      const { data: pasanganRows, error: pasanganError } = await supabaseServer
        .from("kelas_subtes_mentor")
        .select("kelas_id, subtes_id, mentor_id")
        .in("kelas_id", tepatSatu.map((row) => row.id));
      if (pasanganError) {
        console.error("[hitungKetersediaanKelas] query kelas_subtes_mentor gagal:", pasanganError);
        return null;
      }
      const pasangan = (pasanganRows ?? []) as { kelas_id: string; subtes_id: string; mentor_id: string }[];
      const mentorIds = Array.from(new Set(pasangan.map((p) => p.mentor_id)));
      const aktif = new Set<string>();
      if (mentorIds.length > 0) {
        const { data: roleRows, error: roleError } = await supabaseServer
          .from("user_roles")
          .select("user_id")
          .in("user_id", mentorIds)
          .eq("role_type", "mentor")
          .eq("status", "active");
        if (roleError) {
          console.error("[hitungKetersediaanKelas] query user_roles gagal:", roleError);
          return null;
        }
        for (const row of roleRows ?? []) aktif.add(row.user_id as string);
      }
      for (const row of tepatSatu) {
        const subtesId = Array.from(subtesPerKelas.get(row.id) ?? [])[0];
        const mentor = new Set(
          pasangan.filter((p) => p.kelas_id === row.id && p.subtes_id === subtesId && aktif.has(p.mentor_id)).map((p) => p.mentor_id),
        );
        mentorAktifPerKelas.set(row.id, mentor.size);
      }
    }
  }

  for (const row of rows) {
    const lunas = lunasPerKelas.get(row.id) ?? [];
    const slots = parseJadwalSlots(row.jadwal);
    const memakaiSlot = kelasMemakaiSlot({
      tipeKelas: row.tipe_kelas,
      modePembelajaran: row.mode_pembelajaran,
      jadwalPilihSiswa: row.jadwal_pilih_siswa,
      jumlahSubtes: subtesPerKelas.get(row.id)?.size ?? 0,
      jumlahSlot: slots.length,
    });

    let slot: StatusSlot[] = [];
    let otomatis = null;
    if (memakaiSlot) {
      slot = hitungSlotTerisi({
        slots,
        kapasitasPerSlot: mentorAktifPerKelas.get(row.id) ?? 0,
        slotEfektifSiswa: lunas.map((e) => slotEfektif({ jadwalDitetapkan: e.jadwal_ditetapkan, jadwalPilihan: e.jadwal_pilihan })),
      });
      otomatis = ringkasSlot(slot);
    }

    hasil.set(row.id, {
      kapasitas: hitungKapasitasKelas({ kapasitasManual: row.kapasitas, lunas: lunas.length, otomatis }),
      memakaiSlot,
      slot,
    });
  }
  return hasil;
}

/** Ketersediaan SATU kelas (membaca baris kelas sendiri). null = galat database ATAU kelas tidak ada. */
export async function getKetersediaanKelas(kelasId: string): Promise<KetersediaanKelas | null> {
  const { data, error } = await supabaseServer.from("kelas").select(KELAS_KETERSEDIAAN_SELECT).eq("id", kelasId).maybeSingle();
  if (error) {
    console.error("[getKetersediaanKelas] query kelas gagal:", error);
    return null;
  }
  if (!data) return null;
  const hasil = await hitungKetersediaanKelas([normalisasiKelas(data as unknown as Record<string, unknown>)]);
  return hasil?.get(kelasId) ?? null;
}

/** Baris kelas mentah → bentuk input pembaca (kolom kapasitas boleh kosong/tidak ada). */
export function normalisasiKelas(row: Record<string, unknown>): KelasKetersediaanInput {
  const kapasitas = row.kapasitas;
  return {
    id: row.id as string,
    tipe_kelas: (row.tipe_kelas as string | null | undefined) ?? null,
    mode_pembelajaran: (row.mode_pembelajaran as string | null | undefined) ?? null,
    jadwal_pilih_siswa: (row.jadwal_pilih_siswa as boolean | null | undefined) ?? null,
    jadwal: row.jadwal,
    kapasitas: typeof kapasitas === "number" ? kapasitas : null,
    subtes_id: (row.subtes_id as string | null | undefined) ?? null,
  };
}
