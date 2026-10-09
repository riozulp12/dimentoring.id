import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import { getPtnJurusanOptions } from "@/lib/landing/getPtnJurusanOptions";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";
import AssessmentSNBPForm, { type PtnJurusanOption } from "./AssessmentSNBPForm";

/**
 * Assessment Prediksi Masuk PTN — PRD Bagian 7.4. Fase 1 fokus ke tab SNBP
 * (7.4.1-7.4.2); SNBT & Jalur Mandiri masih placeholder "Segera Hadir".
 *
 * PRD Bagian 7.4.1b/BR-29: halaman ini WAJIB bisa diakses tanpa login (trial
 * anonim, cookie dm_trial_id di-set oleh middleware.ts) — jangan tambahkan
 * redirect ke /login di sini.
 *
 * Akses role (revisi Oktober 2026): TERBUKA untuk SEMUA role (Siswa, Mentor,
 * Admin) + visitor anonim. Guard "khusus akun Siswa" yang lama DIHAPUS —
 * Mentor/Admin perlu bisa mencoba & mendemokan fitur ini. Konsekuensinya,
 * validasi provinsi BR-28 (satu dari dua pilihan wajib seprovinsi dengan
 * profil siswa) cuma berlaku untuk role Student, lihat
 * app/api/assessment/snbp/route.ts.
 *
 * Server Component: ambil daftar PTN/Jurusan (jalur='snbp') untuk dropdown
 * "Pilihan Universitas dan Jurusan" di sini (bukan lewat API terpisah), lalu
 * diteruskan ke Client Component untuk interaksi tab/accordion.
 */
export default async function AssessmentPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const navbarProps = await getNavbarProps(session);

  // Sumber data sama dengan Widget Cek Keketatan landing page — sudah
  // di-paginate lewat .range() supaya tidak kena batas default 1000 baris
  // PostgREST (ptn_jurusan 7700+ baris). Query lama di sini langsung
  // .select() tanpa .range() sehingga diam-diam terpotong di baris ke-1000,
  // dan hasilnya didominasi batch import terbaru (PTKIN/Politeknik Vokasi).
  const allPtnJurusanOptions = await getPtnJurusanOptions();
  const snbpRows = allPtnJurusanOptions
    .filter((row) => row.jalur === "snbp")
    .sort(
      (a, b) =>
        a.namaUniversitas.localeCompare(b.namaUniversitas) ||
        a.namaJurusan.localeCompare(b.namaJurusan) ||
        a.jenjang.localeCompare(b.jenjang),
    );

  const options: PtnJurusanOption[] = snbpRows.map((row) => ({
    id: row.id,
    universitas: row.namaUniversitas,
    jurusan: row.namaJurusan,
    jenjang: row.jenjang,
  }));

  // Disclaimer (BR-4/FR-3.6) wajib menampilkan tahun data — ptn_jurusan.tahun_data
  // per-baris, jadi dipakai tahun TERBARU di antara seluruh data SNBP sebagai
  // representasi tunggal di banner sebelum siswa memilih prodi manapun.
  const tahunData = snbpRows.reduce<number | null>((latest, row) => {
    return latest === null || row.tahunData > latest ? row.tahunData : latest;
  }, null);

  return (
    <div className="flex w-full flex-col">
      <Navbar activeItem="cek-peluang" {...navbarProps} />
      <AssessmentSNBPForm ptnJurusanOptions={options} tahunData={tahunData} />
      <Footer />
    </div>
  );
}
