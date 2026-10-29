/**
 * Aturan murni untuk peringatan "perubahan belum tersimpan" (Studio Soal
 * revisi UX-3 butir 5) — dipakai components/studio-soal/PenjagaKeluar.tsx.
 */

/** Bentuk minimal event klik + elemen yang dibutuhkan (supaya bisa diuji tanpa DOM). */
export interface KlikTautan {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

interface ElemenTautan {
  getAttribute(nama: string): string | null;
  hasAttribute(nama: string): boolean;
  href: string;
}

const isElemen = (t: unknown): t is { closest(sel: string): unknown } =>
  typeof t === "object" && t !== null && typeof (t as { closest?: unknown }).closest === "function";

/**
 * Alamat tujuan (path + query + hash) bila klik ini adalah perpindahan ke
 * halaman LAIN di aplikasi yang sama dan perlu dikonfirmasi; null bila
 * tidak perlu dicegat (klik kanan/tengah, Ctrl/⌘/Shift/Alt = tab baru,
 * target lain, unduhan, situs lain, atau hanya pindah #bagian di halaman ini).
 */
export function tujuanTautanDalam(e: KlikTautan, alamatSekarang: string): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  if (!isElemen(e.target)) return null;
  const a = e.target.closest("a[href]") as ElemenTautan | null;
  if (!a) return null;
  const target = a.getAttribute("target");
  if ((target && target !== "_self") || a.hasAttribute("download")) return null;
  let tujuan: URL;
  let sekarang: URL;
  try {
    sekarang = new URL(alamatSekarang);
    tujuan = new URL(a.href, sekarang);
  } catch {
    return null;
  }
  if (tujuan.origin !== sekarang.origin) return null;
  if (tujuan.pathname === sekarang.pathname && tujuan.search === sekarang.search) return null;
  return `${tujuan.pathname}${tujuan.search}${tujuan.hash}`;
}

/**
 * Perlu memperingatkan? Form baru yang belum pernah disimpan dibandingkan
 * dengan isi awalnya (bukan dianggap "berubah" sejak awal); form yang sudah
 * tersimpan dibandingkan dengan jejak simpan terakhir.
 */
export function formBerubah(opsi: { jejakTersimpan: string | null; jejakAwal: string; jejakSekarang: string }): boolean {
  return opsi.jejakSekarang !== (opsi.jejakTersimpan ?? opsi.jejakAwal);
}
