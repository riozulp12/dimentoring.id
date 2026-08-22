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
