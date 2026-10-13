/**
 * Pilihan Jadwal Siswa (maks. 2, preferensi berurutan) — PRD 7.5.8.
 *
 * Slot dirujuk lewat SALINAN {hari, jam_mulai} (tanpa tabel slot terpisah),
 * jadi identitas slot = pasangan hari + jam_mulai. Fungsi di sini murni
 * (tanpa "server-only"/env) supaya dipakai bersama server (validasi checkout,
 * penetapan Admin) dan Client Component (form checkout, Kelola Kelas).
 */

export interface JadwalSlot {
  hari: string;
  jam_mulai: string;
}

export const MAX_JADWAL_PILIHAN = 2;

function toSlot(entry: unknown): JadwalSlot | null {
  if (!entry || typeof entry !== "object") return null;
  const obj = entry as Record<string, unknown>;
  const hari = typeof obj.hari === "string" ? obj.hari.trim() : "";
  const jamMulai = typeof obj.jam_mulai === "string" ? obj.jam_mulai.trim() : "";
  if (!hari || !jamMulai) return null;
  return { hari, jam_mulai: jamMulai };
}

/** Slot lengkap dari kelas.jadwal (array, atau object tunggal data lama). */
export function parseJadwalSlots(jadwal: unknown): JadwalSlot[] {
  if (!jadwal) return [];
  const entries = Array.isArray(jadwal) ? jadwal : [jadwal];
  return entries.map(toSlot).filter((s): s is JadwalSlot => s !== null);
}

/** Satu slot tersimpan (mis. enrollments.jadwal_ditetapkan). */
export function parseJadwalSlot(value: unknown): JadwalSlot | null {
  return toSlot(value);
}

export function slotKey(slot: JadwalSlot): string {
  return `${slot.hari}|${slot.jam_mulai}`;
}

export function formatSlot(slot: JadwalSlot): string {
  return `${slot.hari}, ${slot.jam_mulai} WIB`;
}

export function isSlotTersedia(slot: JadwalSlot, kelasJadwal: unknown): boolean {
  const key = slotKey(slot);
  return parseJadwalSlots(kelasJadwal).some((s) => slotKey(s) === key);
}

export interface KelasJadwalPilihanInfo {
  jadwalPilihSiswa: boolean;
  modePembelajaran: string;
  jadwal: unknown;
}

/** Fitur aktif untuk kelas ini? (saklar menyala DAN bukan offline — v1). */
export function isJadwalPilihanAktif(kelas: KelasJadwalPilihanInfo): boolean {
  return kelas.jadwalPilihSiswa && kelas.modePembelajaran !== "offline";
}

/** Siswa perlu memilih di checkout? (aktif + 2 slot atau lebih). */
export function perluPilihJadwal(kelas: KelasJadwalPilihanInfo): boolean {
  return isJadwalPilihanAktif(kelas) && parseJadwalSlots(kelas.jadwal).length >= 2;
}

export type ValidateJadwalPilihanResult =
  | { ok: true; value: JadwalSlot[] | null }
  | { ok: false; error: string };

/**
 * Validasi pilihan dari body checkout. `value: null` = tidak disimpan.
 * - Saklar mati / kelas offline / kelas 0 slot -> diabaikan (null).
 * - Tepat 1 slot -> otomatis slot itu (input diabaikan).
 * - 2+ slot -> wajib 1-2 slot, tanpa duplikat, masing-masing ada di kelas.jadwal.
 */
export function validateJadwalPilihan(
  requested: unknown,
  kelas: KelasJadwalPilihanInfo,
): ValidateJadwalPilihanResult {
  if (!isJadwalPilihanAktif(kelas)) return { ok: true, value: null };

  const slots = parseJadwalSlots(kelas.jadwal);
  if (slots.length === 0) return { ok: true, value: null };
  if (slots.length === 1) return { ok: true, value: [slots[0]] };

  if (!Array.isArray(requested) || requested.length < 1) {
    return { ok: false, error: "Pilih minimal 1 jadwal." };
  }
  if (requested.length > MAX_JADWAL_PILIHAN) {
    return { ok: false, error: `Pilih maksimal ${MAX_JADWAL_PILIHAN} jadwal.` };
  }

  const tersedia = new Map(slots.map((s) => [slotKey(s), s]));
  const seen = new Set<string>();
  const value: JadwalSlot[] = [];
  for (const raw of requested) {
    const slot = toSlot(raw);
    const match = slot ? tersedia.get(slotKey(slot)) : undefined;
    if (!match) {
      return { ok: false, error: "Jadwal yang dipilih tidak tersedia di kelas ini." };
    }
    const key = slotKey(match);
    if (seen.has(key)) {
      return { ok: false, error: "Pilihan jadwal tidak boleh sama." };
    }
    seen.add(key);
    // Simpan salinan dari kelas.jadwal (bukan objek mentah dari client).
    value.push({ hari: match.hari, jam_mulai: match.jam_mulai });
  }
  return { ok: true, value };
}

/**
 * Teks jadwal untuk siswa yang SUDAH terdaftar (Kelas Saya, detail kelas).
 * null = fitur tidak aktif untuk kelas ini -> caller pakai formatJadwal() biasa.
 */
export function formatJadwalSiswaTerdaftar(kelas: KelasJadwalPilihanInfo, jadwalDitetapkan: unknown): string | null {
  if (!isJadwalPilihanAktif(kelas)) return null;
  const slot = parseJadwalSlot(jadwalDitetapkan);
  return slot ? `Jadwal: ${formatSlot(slot)}` : "Menunggu penetapan jadwal";
}
