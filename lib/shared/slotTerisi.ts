import { parseJadwalSlot, parseJadwalSlots, slotKey, type JadwalSlot } from "@/lib/shared/jadwalPilihan";

/**
 * Slot jadwal TERISI — logika murni (tanpa DB), dipakai server (payment/create, pembaca
 * lib/jadwal/slotTerisi.ts) dan UI (checkout). Keputusan Rio (Opsi 0, tanpa tabel baru):
 *
 *  - Kapasitas SATU slot = jumlah mentor aktif pemegang subtes kelas itu.
 *  - Slot efektif siswa = jadwal_ditetapkan; kalau belum ada, jadwal_pilihan[0] (Pilihan 1).
 *  - Slot terisi bila jumlah siswa LUNAS pada slot efektif itu >= kapasitas slot.
 *  - Pembayaran yang masih 'menunggu' TIDAK menahan slot (balapan diterima; Admin menangani).
 *  - Berlaku HANYA untuk kelas private + online + saklar jadwal_pilih_siswa menyala + tepat 1 subtes
 *    (kelasMemakaiSlot). Kelas lain, paket multi-subtes, dan offline tidak berubah (keputusan ditunda).
 */

export interface SlotEfektifInput {
  /** enrollments.jadwal_ditetapkan — satu object {hari, jam_mulai}. */
  jadwalDitetapkan: unknown;
  /** enrollments.jadwal_pilihan — array {hari, jam_mulai} (index 0 = Pilihan 1). */
  jadwalPilihan: unknown;
}

/** Slot yang benar-benar ditempati siswa: jadwal_ditetapkan, selain itu Pilihan 1. null = belum ada slot. */
export function slotEfektif(input: SlotEfektifInput): JadwalSlot | null {
  const ditetapkan = parseJadwalSlot(input.jadwalDitetapkan);
  if (ditetapkan) return ditetapkan;
  return parseJadwalSlots(input.jadwalPilihan)[0] ?? null;
}

export interface InputKelasMemakaiSlot {
  tipeKelas: string | null | undefined;
  modePembelajaran: string | null | undefined;
  jadwalPilihSiswa: boolean | null | undefined;
  /** Jumlah subtes di pool kelas (kelas_subtes; fallback kelas.subtes_id). */
  jumlahSubtes: number;
  /** Jumlah slot di kelas.jadwal. */
  jumlahSlot: number;
}

/** Aturan slot berlaku? private + online + saklar menyala + tepat 1 subtes + minimal 1 slot. */
export function kelasMemakaiSlot(input: InputKelasMemakaiSlot): boolean {
  return (
    input.tipeKelas === "private" &&
    input.modePembelajaran === "online" &&
    input.jadwalPilihSiswa === true &&
    input.jumlahSubtes === 1 &&
    input.jumlahSlot >= 1
  );
}

export interface StatusSlot {
  slot: JadwalSlot;
  terisi: number;
  kapasitas: number;
  penuh: boolean;
}

export interface InputHitungSlot {
  /** Slot kelas.jadwal saat ini (duplikat dibuang). */
  slots: JadwalSlot[];
  /** Mentor aktif pemegang subtes — kapasitas SATU slot. */
  kapasitasPerSlot: number;
  /** Slot efektif tiap siswa LUNAS (null = belum punya slot → tidak mengisi slot mana pun). */
  slotEfektifSiswa: (JadwalSlot | null)[];
}

/**
 * Status tiap slot kelas. Siswa yang slot efektifnya sudah tidak ada di kelas.jadwal (slot
 * dihapus Admin) tidak dihitung ke slot mana pun. Kapasitas 0 (tidak ada mentor aktif) = penuh.
 */
export function hitungSlotTerisi(input: InputHitungSlot): StatusSlot[] {
  const unik = new Map<string, JadwalSlot>();
  for (const slot of input.slots) if (!unik.has(slotKey(slot))) unik.set(slotKey(slot), slot);

  const terisiPerSlot = new Map<string, number>();
  for (const slot of input.slotEfektifSiswa) {
    if (!slot) continue;
    const key = slotKey(slot);
    if (unik.has(key)) terisiPerSlot.set(key, (terisiPerSlot.get(key) ?? 0) + 1);
  }

  const kapasitas = Math.max(0, Math.floor(input.kapasitasPerSlot));
  return Array.from(unik.entries()).map(([key, slot]) => {
    const terisi = terisiPerSlot.get(key) ?? 0;
    return { slot, terisi, kapasitas, penuh: terisi >= kapasitas };
  });
}

/** Ringkasan seluruh slot: kapasitas total (slot × mentor) dan kursi yang masih kosong. */
export function ringkasSlot(status: StatusSlot[]): { kapasitas: number; sisa: number } {
  return {
    kapasitas: status.reduce((jumlah, s) => jumlah + s.kapasitas, 0),
    sisa: status.reduce((jumlah, s) => jumlah + Math.max(0, s.kapasitas - s.terisi), 0),
  };
}

/** Status satu slot menurut kuncinya (hari|jam_mulai); undefined bila slot tidak ada di kelas. */
export function cariStatusSlot(status: StatusSlot[], slot: JadwalSlot): StatusSlot | undefined {
  return status.find((s) => slotKey(s.slot) === slotKey(slot));
}

/** Opsi dropdown checkout: slot kelas + penanda penuh. status null (galat baca) → semua slot ditampilkan terbuka. */
export interface OpsiJadwalCheckout extends JadwalSlot {
  penuh: boolean;
}

export function opsiJadwalCheckout(slots: JadwalSlot[], status: StatusSlot[] | null): OpsiJadwalCheckout[] {
  return slots.map((slot) => ({
    hari: slot.hari,
    jam_mulai: slot.jam_mulai,
    penuh: status ? (cariStatusSlot(status, slot)?.penuh ?? false) : false,
  }));
}

/** Semua slot penuh (dan ada slot)? Dasar pesan "Semua jadwal kelas ini sudah terisi" + tombol Bayar nonaktif. */
export function semuaSlotPenuh(status: StatusSlot[] | null): boolean {
  return Boolean(status && status.length > 0 && status.every((s) => s.penuh));
}
