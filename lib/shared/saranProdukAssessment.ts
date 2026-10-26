import { safeInternalPath } from "@/lib/auth/safeInternalPath";
import { hrefKelasDimiliki, hrefKelasJualan } from "@/lib/shared/kelasHref";

/**
 * Saran Kelas & Try Out di hasil Assessment, termasuk untuk tamu (belum
 * login). Fungsi murni supaya alurnya bisa dites tanpa DB/React.
 *
 * Alur tamu:
 * - Kartu kelas hanya membuka halaman DETAIL publik (/program/kelas/[id]).
 *   Tombol beli ada di halaman detail itu (KelasDaftarButton), dan untuk tamu
 *   mengarah ke /login?returnTo=<detail kelas>.
 * - Try Out berjalan di portal partner lewat /tryout (SSO). Tamu diarahkan ke
 *   /login?returnTo=/tryout, lalu kembali ke /tryout setelah login.
 * - returnTo selalu divalidasi safeInternalPath (hanya path internal).
 */

/** Link login yang membawa pengguna kembali ke `tujuan` setelah login.
 * Tujuan yang bukan path internal (open redirect) dibuang. */
export function hrefLoginKembali(tujuan: string | null | undefined): string {
  const aman = safeInternalPath(tujuan);
  return aman ? `/login?returnTo=${encodeURIComponent(aman)}` : "/login";
}

export type StatusKelasPengguna = "lunas" | "menunggu" | "batal" | null;

export interface AksiKartuKelas {
  href: string;
  label: string;
  /** Penanda status kepemilikan; null = belum punya. */
  status: string | null;
}

/** Tujuan klik kartu saran kelas. Tidak pernah langsung ke checkout. */
export function aksiKartuKelas(kelasId: string, statusPengguna: StatusKelasPengguna): AksiKartuKelas {
  if (statusPengguna === "lunas") {
    return { href: hrefKelasDimiliki(kelasId), label: "Buka Kelas", status: "Sudah kamu ikuti" };
  }
  if (statusPengguna === "menunggu") {
    return { href: hrefKelasJualan(kelasId), label: "Lihat Kelas", status: "Menunggu pembayaran" };
  }
  return { href: hrefKelasJualan(kelasId), label: "Lihat Kelas", status: null };
}

export const HREF_TRYOUT = "/tryout";

export function aksiTryout(sudahLogin: boolean): { href: string; label: string } {
  if (!sudahLogin) return { href: hrefLoginKembali(HREF_TRYOUT), label: "Masuk untuk Mulai Try Out" };
  return { href: HREF_TRYOUT, label: "Mulai Try Out" };
}

export interface KelasKatalogRingkas {
  id: string;
  programKategori: string;
  tingkatKelas: string;
  nama: string;
}

/** Program yang relevan untuk persiapan masuk PTN, urut prioritas. */
const PROGRAM_PERSIAPAN_PTN = ["snbt", "tka", "ujian_mandiri"];
/** Tingkat yang paling dekat dengan masa seleksi PTN diutamakan. */
const TINGKAT_PRIORITAS = ["kelas_12", "gap_year"];

/** Saran kelas umum (tamu, atau akun yang belum punya kecocokan personal):
 * kelas katalog dari program persiapan PTN, tingkat kelas 12/gap year dulu. */
export function pilihKelasUmum<T extends KelasKatalogRingkas>(kelas: T[], maks = 3): T[] {
  const skorTingkat = (t: string) => (TINGKAT_PRIORITAS.includes(t) ? 0 : 1);
  return kelas
    .filter((k) => PROGRAM_PERSIAPAN_PTN.includes(k.programKategori))
    .slice()
    .sort(
      (a, b) =>
        skorTingkat(a.tingkatKelas) - skorTingkat(b.tingkatKelas) ||
        PROGRAM_PERSIAPAN_PTN.indexOf(a.programKategori) - PROGRAM_PERSIAPAN_PTN.indexOf(b.programKategori) ||
        a.nama.localeCompare(b.nama, "id"),
    )
    .slice(0, maks);
}
