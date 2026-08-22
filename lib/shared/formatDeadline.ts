/**
 * Format tanggal deadline (konten_info.deadline dsb.) jadi teks Indonesia —
 * dipakai Dashboard Siswa dan section landing page "Info Beasiswa &
 * Internship" (PRD Bagian 4.3) supaya format tanggal konsisten di semua
 * tempat, tanpa "server-only" supaya aman diimport dari Server maupun Client
 * Component.
 */
export function formatDeadline(deadline: string | null): string {
  if (!deadline) return "Tanpa deadline";
  return new Date(deadline).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
