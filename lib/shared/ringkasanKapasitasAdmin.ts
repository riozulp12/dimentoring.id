import type { KapasitasKelas } from "@/lib/shared/kapasitasKelas";
import type { StatusSlot } from "@/lib/shared/slotTerisi";

/**
 * Teks kapasitas untuk tampilan ADMIN (Kelola Kelas + halaman Pendaftar). Fungsi murni.
 *
 * Angka SELALU dari hitungKapasitasKelas (kapasitas EFEKTIF — sama dengan badge kartu katalog), bukan dari
 * kolom kelas.kapasitas mentah: kelas private-online-slot dengan kapasitas manual 10 tetapi hanya 2 slot × 1
 * mentor = kapasitas efektif 2, jadi Admin melihat "Terisi 2 dari 2", bukan "2 dari 10".
 */

export interface SlotTerisiRingkas {
  /** Jumlah siswa lunas yang menempati slot kelas saat ini (jumlah terisi seluruh slot). */
  terisi: number;
  /** Kapasitas seluruh slot (slot × mentor aktif pemegang subtes). */
  kapasitas: number;
}

/** Ringkasan slot dari status tiap slot; null = kelas tidak memakai aturan slot. */
export function ringkasSlotTerisi(slot: StatusSlot[]): SlotTerisiRingkas | null {
  if (slot.length === 0) return null;
  return {
    terisi: slot.reduce((jumlah, s) => jumlah + s.terisi, 0),
    kapasitas: slot.reduce((jumlah, s) => jumlah + s.kapasitas, 0),
  };
}

/** Sel tabel daftar kelas: "2/2" atau "2/∞" (tanpa batas). */
export function teksTerisiRingkas(info: KapasitasKelas): string {
  return `${info.terisi}/${info.terbatas && info.kapasitas !== null ? info.kapasitas : "∞"}`;
}

/** Detail kelas: "Terisi 2 dari 2" atau "Terisi 2 siswa (tanpa batas)". */
export function teksTerisiDetail(info: KapasitasKelas): string {
  return info.terbatas && info.kapasitas !== null
    ? `Terisi ${info.terisi} dari ${info.kapasitas}`
    : `Terisi ${info.terisi} siswa (tanpa batas)`;
}

/** "Slot terisi A dari B" untuk kelas private-online-slot; null bila kelas tidak memakai slot. */
export function teksSlotTerisi(slot: SlotTerisiRingkas | null): string | null {
  return slot ? `Slot terisi ${slot.terisi} dari ${slot.kapasitas}` : null;
}
