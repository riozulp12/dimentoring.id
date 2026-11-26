/** Tanggal ringkas untuk Bank Soal; zona dikunci supaya sama di server dan browser. */
export function formatTanggalSoal(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(t);
}
