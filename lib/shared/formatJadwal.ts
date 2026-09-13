/**
 * Format jadwal kelas untuk tampilan — kelas.jadwal (JSONB) sekarang
 * menyimpan ARRAY {hari, jam_mulai} supaya satu kelas bisa punya lebih dari
 * satu slot per minggu (mis. Senin & Rabu). Backward-compatible dengan data
 * lama yang masih berupa satu object tunggal (bukan array) — dibungkus jadi
 * array 1 elemen sebelum diformat, jadi satu code path untuk keduanya.
 *
 * SENGAJA di file tanpa "server-only" supaya aman diimport dari Client
 * Component juga (mis. components/admin/KelolaKelasClient.tsx).
 */

interface JadwalEntryRaw {
  hari?: unknown;
  jam_mulai?: unknown;
}

function formatEntry(entry: unknown): string | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as JadwalEntryRaw;
  const hari = typeof e.hari === "string" && e.hari.trim() ? e.hari.trim() : null;
  const jamMulai = typeof e.jam_mulai === "string" && e.jam_mulai.trim() ? e.jam_mulai.trim() : null;
  if (hari && jamMulai) return `${hari}, ${jamMulai} WIB`;
  if (hari) return hari;
  return null;
}

export function formatJadwal(jadwal: unknown): string {
  if (!jadwal) return "Jadwal belum diatur";
  const entries = Array.isArray(jadwal) ? jadwal : [jadwal];
  const formatted = entries.map(formatEntry).filter((s): s is string => Boolean(s));
  return formatted.length > 0 ? formatted.join(" & ") : "Jadwal belum diatur";
}

/** Sama seperti formatJadwal(), tapi mengelompokkan hari yang jam-nya sama jadi
 * satu baris (mis. "Senin & Rabu, 19:00 WIB") bukan diulang per-hari, dan
 * mengembalikan null kalau jadwal kosong (bukan placeholder teks) — dipakai di
 * konteks yang butuh kalimat ringkas (detail kelas publik, notifikasi). */
export function formatJadwalRingkas(jadwal: unknown): string | null {
  if (!jadwal) return null;
  const entries = Array.isArray(jadwal) ? jadwal : [jadwal];

  const slots: { hari: string; jam: string }[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as JadwalEntryRaw;
    const hari = typeof e.hari === "string" && e.hari.trim() ? e.hari.trim() : null;
    const jam = typeof e.jam_mulai === "string" && e.jam_mulai.trim() ? e.jam_mulai.trim() : "";
    if (hari) slots.push({ hari, jam });
  }
  if (slots.length === 0) return null;

  const hariByJam = new Map<string, string[]>();
  for (const slot of slots) {
    const list = hariByJam.get(slot.jam) ?? [];
    list.push(slot.hari);
    hariByJam.set(slot.jam, list);
  }

  const parts = Array.from(hariByJam.entries()).map(([jam, hariList]) => {
    const hariJoined = hariList.join(" & ");
    return jam ? `${hariJoined}, ${jam} WIB` : hariJoined;
  });

  return parts.join(", ");
}
