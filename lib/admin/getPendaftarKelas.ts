import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import {
  isJadwalPilihanAktif,
  isSlotTersedia,
  parseJadwalSlot,
  parseJadwalSlots,
  type JadwalSlot,
} from "@/lib/shared/jadwalPilihan";

/**
 * Data layer halaman "Pendaftar" per kelas (Admin, Kelola Kelas) — PRD 7.5.8.
 * Slot dirujuk lewat salinan {hari, jam_mulai}; kalau Admin sudah menghapus
 * slot itu dari kelas.jadwal, `tersedia=false` -> badge "slot tidak lagi
 * tersedia" (penghapusan slot memang TIDAK diblokir).
 */

export interface SlotStatus {
  slot: JadwalSlot;
  tersedia: boolean;
}

export interface PendaftarItem {
  enrollmentId: string;
  siswaNama: string;
  statusPembayaran: "menunggu" | "lunas" | "batal";
  tanggalDaftar: string;
  /** Urut Pilihan 1, Pilihan 2. */
  pilihan: SlotStatus[];
  ditetapkan: SlotStatus | null;
  ditetapkanAt: string | null;
}

export interface PendaftarKelasData {
  kelas: {
    id: string;
    nama: string;
    /** Saklar menyala DAN bukan offline — aksi "Tetapkan jadwal" cuma ada kalau true. */
    jadwalPilihanAktif: boolean;
    slots: JadwalSlot[];
  };
  pendaftar: PendaftarItem[];
}

type NamaOnly = { nama: string };

interface EnrollmentRow {
  id: string;
  status_pembayaran: PendaftarItem["statusPembayaran"];
  tanggal_daftar: string;
  jadwal_pilihan: unknown;
  jadwal_ditetapkan: unknown;
  jadwal_ditetapkan_at: string | null;
  users: NamaOnly | NamaOnly[] | null;
}

export async function getPendaftarKelas(kelasId: string): Promise<PendaftarKelasData | null> {
  const { data: kelas, error: kelasError } = await supabaseServer
    .from("kelas")
    .select("id, nama, jadwal, jadwal_pilih_siswa, mode_pembelajaran")
    .eq("id", kelasId)
    .maybeSingle();
  if (kelasError) {
    console.error("[getPendaftarKelas] query kelas failed:", kelasError);
    return null;
  }
  if (!kelas) return null;

  const { data, error } = await supabaseServer
    .from("enrollments")
    .select("id, status_pembayaran, tanggal_daftar, jadwal_pilihan, jadwal_ditetapkan, jadwal_ditetapkan_at, users:user_id(nama)")
    .eq("kelas_id", kelasId)
    .order("tanggal_daftar", { ascending: true });
  if (error) {
    console.error("[getPendaftarKelas] query enrollments failed:", error);
    return null;
  }

  const toStatus = (slot: JadwalSlot): SlotStatus => ({ slot, tersedia: isSlotTersedia(slot, kelas.jadwal) });

  const pendaftar = ((data ?? []) as unknown as EnrollmentRow[]).map((row) => {
    const user = Array.isArray(row.users) ? (row.users[0] ?? null) : row.users;
    const ditetapkan = parseJadwalSlot(row.jadwal_ditetapkan);
    return {
      enrollmentId: row.id,
      siswaNama: user?.nama ?? "(akun terhapus)",
      statusPembayaran: row.status_pembayaran,
      tanggalDaftar: row.tanggal_daftar,
      pilihan: parseJadwalSlots(row.jadwal_pilihan).map(toStatus),
      ditetapkan: ditetapkan ? toStatus(ditetapkan) : null,
      ditetapkanAt: row.jadwal_ditetapkan_at,
    };
  });

  return {
    kelas: {
      id: kelas.id as string,
      nama: kelas.nama as string,
      jadwalPilihanAktif: isJadwalPilihanAktif({
        jadwalPilihSiswa: kelas.jadwal_pilih_siswa === true,
        modePembelajaran: kelas.mode_pembelajaran as string,
        jadwal: kelas.jadwal,
      }),
      slots: parseJadwalSlots(kelas.jadwal),
    },
    pendaftar,
  };
}
