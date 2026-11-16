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
import { KELAS_KETERSEDIAAN_SELECT, hitungKetersediaanKelas, normalisasiKelas } from "@/lib/jadwal/slotTerisi";
import { opsiJadwalCheckout, type OpsiJadwalCheckout } from "@/lib/shared/slotTerisi";
import { slotKey } from "@/lib/shared/jadwalPilihan";
import { hitungKapasitasKelas, type KapasitasKelas } from "@/lib/shared/kapasitasKelas";
import { ringkasSlotTerisi, type SlotTerisiRingkas } from "@/lib/shared/ringkasanKapasitasAdmin";

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
  /** Link Meet PER SISWA (kelas private) — enrollments.link_meet, apa adanya (belum disaring berlaku/tidak). */
  linkMeet: string | null;
  /** Siapa yang mengisi: nama mentor, "Admin" (pengisi kosong), atau null bila belum ada link. */
  linkMeetPengisi: string | null;
}

export interface PendaftarKelasData {
  kelas: {
    id: string;
    nama: string;
    /** Saklar menyala DAN bukan offline — aksi "Tetapkan jadwal" cuma ada kalau true. */
    jadwalPilihanAktif: boolean;
    slots: JadwalSlot[];
    /**
     * Opsi dropdown "Jadwal (opsional)" di form Daftarkan Siswa Manual: slot kelas.jadwal (tanpa duplikat) +
     * penanda penuh. KOSONG bila kelas tidak memakai pilihan jadwal (saklar mati/offline) atau tanpa slot —
     * kondisi yang SAMA dengan aksi "Tetapkan jadwal". Penanda penuh hanya ada untuk kelas yang memakai
     * aturan slot (private + online + saklar + 1 subtes); selain itu semua slot terbuka.
     */
    opsiJadwal: OpsiJadwalCheckout[];
    modePembelajaran: "online" | "offline";
    /** kelas.tipe_kelas — Link Meet per siswa hanya untuk 'private'. */
    tipeKelas: string | null;
    /** null = kapasitas manual kosong (otomatis / tanpa batas). */
    kapasitas: number | null;
    /** Enrollment lunas. */
    terisi: number;
    /**
     * Kapasitas EFEKTIF (hitungKapasitasKelas — sama dengan badge kartu katalog). Header halaman memakai ini;
     * `kapasitas` mentah di atas hanya untuk aturan pendaftaran manual (server hanya mengenal kapasitas manual).
     */
    kapasitasEfektif: KapasitasKelas;
    /** "Slot terisi A dari B" — hanya kelas yang memakai aturan slot; selain itu null. */
    slotTerisi: SlotTerisiRingkas | null;
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
  link_meet: string | null;
  link_meet_oleh: string | null;
  users: NamaOnly | NamaOnly[] | null;
  mentor_offline: NamaOnly | NamaOnly[] | null;
  link_meet_pengisi: NamaOnly | NamaOnly[] | null;
}

export async function getPendaftarKelas(kelasId: string): Promise<PendaftarKelasData | null> {
  const { data: kelas, error: kelasError } = await supabaseServer
    .from("kelas")
    .select(`nama, jumlah_sesi, ${KELAS_KETERSEDIAAN_SELECT}`)
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
      "id, status_pembayaran, tanggal_daftar, jadwal_pilihan, jadwal_ditetapkan, jadwal_ditetapkan_at, sumber, mentor_offline_id, link_meet, link_meet_oleh, users:user_id(nama), mentor_offline:mentor_offline_id(nama), link_meet_pengisi:link_meet_oleh(nama)",
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
      linkMeet: row.link_meet ?? null,
      linkMeetPengisi: row.link_meet
        ? row.link_meet_oleh
          ? ((Array.isArray(row.link_meet_pengisi) ? row.link_meet_pengisi[0] : row.link_meet_pengisi)?.nama ?? "Mentor")
          : "Admin"
        : null,
    };
  });

  const subtesPool = await getKelasSubtesOptions(kelasId);

  const jadwalPilihanAktif = isJadwalPilihanAktif({
    jadwalPilihSiswa: kelas.jadwal_pilih_siswa === true,
    modePembelajaran: kelas.mode_pembelajaran as string,
    jadwal: kelas.jadwal,
  });
  const slots = parseJadwalSlots(kelas.jadwal);
  // Galat baca ketersediaan (null) -> semua slot ditampilkan terbuka; server tetap penjaga & memberi peringatan.
  const ketersediaan = (await hitungKetersediaanKelas([normalisasiKelas(kelas as unknown as Record<string, unknown>)]))?.get(kelasId);
  const lunas = pendaftar.filter((p) => p.statusPembayaran === "lunas").length;
  const slotUnik = Array.from(new Map(slots.map((slot) => [slotKey(slot), slot])).values());
  const opsiJadwal =
    jadwalPilihanAktif && slotUnik.length > 0
      ? opsiJadwalCheckout(slotUnik, ketersediaan?.memakaiSlot ? ketersediaan.slot : null)
      : [];

  return {
    kelas: {
      id: kelas.id as string,
      nama: kelas.nama as string,
      jadwalPilihanAktif,
      slots,
      opsiJadwal,
      modePembelajaran: kelas.mode_pembelajaran === "offline" ? "offline" : "online",
      tipeKelas: (kelas.tipe_kelas as string | null) ?? null,
      kapasitas: typeof kelas.kapasitas === "number" ? kelas.kapasitas : null,
      terisi: lunas,
      kapasitasEfektif:
        ketersediaan?.kapasitas ??
        hitungKapasitasKelas({
          kapasitasManual: typeof kelas.kapasitas === "number" ? kelas.kapasitas : null,
          lunas,
          otomatis: null,
        }),
      slotTerisi: ketersediaan?.memakaiSlot ? ringkasSlotTerisi(ketersediaan.slot) : null,
      jumlahSesi: kelas.jumlah_sesi as number,
      subtesPool,
    },
    pendaftar,
  };
}
