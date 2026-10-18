import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import {
  isJadwalPilihanAktif,
  isSlotTersedia,
  parseJadwalSlot,
  parseJadwalSlots,
  type JadwalSlot,
} from "@/lib/shared/jadwalPilihan";
import { getKelasSubtesOptions, type KelasSubtesOption } from "@/lib/payment/getKelasForCheckout";

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
  /** 'manual' = didaftarkan Admin (PRD 7.5.10) -> badge "Manual". */
  sumber: "checkout" | "manual";
  /** Kelas offline: mentor tatap muka siswa ini (enrollments.mentor_offline_id). */
  mentorOffline: { id: string; nama: string } | null;
}

export interface PendaftarKelasData {
  kelas: {
    id: string;
    nama: string;
    /** Saklar menyala DAN bukan offline — aksi "Tetapkan jadwal" cuma ada kalau true. */
    jadwalPilihanAktif: boolean;
    slots: JadwalSlot[];
    modePembelajaran: "online" | "offline";
    kapasitas: number;
    /** Enrollment lunas — dasar "Kelas Penuh" (sama dengan katalog). */
    terisi: number;
    jumlahSesi: number;
    /** Pool subtes kelas (kelas_subtes) — > 1 = kelas paket, form manual minta pilihan. */
    subtesPool: KelasSubtesOption[];
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
  sumber: string | null;
  mentor_offline_id: string | null;
  users: NamaOnly | NamaOnly[] | null;
  mentor_offline: NamaOnly | NamaOnly[] | null;
}

export async function getPendaftarKelas(kelasId: string): Promise<PendaftarKelasData | null> {
  const { data: kelas, error: kelasError } = await supabaseServer
    .from("kelas")
    .select("id, nama, jadwal, jadwal_pilih_siswa, mode_pembelajaran, kapasitas, jumlah_sesi")
    .eq("id", kelasId)
    .maybeSingle();
  if (kelasError) {
    console.error("[getPendaftarKelas] query kelas failed:", kelasError);
    return null;
  }
  if (!kelas) return null;

  const { data, error } = await supabaseServer
    .from("enrollments")
    .select(
      "id, status_pembayaran, tanggal_daftar, jadwal_pilihan, jadwal_ditetapkan, jadwal_ditetapkan_at, sumber, mentor_offline_id, users:user_id(nama), mentor_offline:mentor_offline_id(nama)",
    )
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
      sumber: row.sumber === "manual" ? ("manual" as const) : ("checkout" as const),
      mentorOffline: row.mentor_offline_id
        ? {
            id: row.mentor_offline_id,
            nama: (Array.isArray(row.mentor_offline) ? row.mentor_offline[0] : row.mentor_offline)?.nama ?? "-",
          }
        : null,
    };
  });

  const subtesPool = await getKelasSubtesOptions(kelasId);

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
      modePembelajaran: kelas.mode_pembelajaran === "offline" ? "offline" : "online",
      kapasitas: kelas.kapasitas as number,
      terisi: pendaftar.filter((p) => p.statusPembayaran === "lunas").length,
      jumlahSesi: kelas.jumlah_sesi as number,
      subtesPool,
    },
    pendaftar,
  };
}
