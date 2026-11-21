/** Filter daftar konten_info untuk halaman siswa /beasiswa-event (pencarian judul + jenis + status). Murni, tanpa efek samping. */
export interface KontenInfoFilterable {
  judul: string;
  tipe: string;
  status: string;
}

export function filterKontenInfo<T extends KontenInfoFilterable>(
  items: T[],
  opsi: { search: string; tipe: string; status: string },
): T[] {
  const q = opsi.search.trim().toLowerCase();
  return items.filter((item) => {
    if (q && !item.judul.toLowerCase().includes(q)) return false;
    if (opsi.tipe !== "semua" && item.tipe !== opsi.tipe) return false;
    if (opsi.status !== "semua" && item.status !== opsi.status) return false;
    return true;
  });
}
