import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";

/**
 * Try Out — PRD Bagian 4.3/7.6. Public route, pola sama dengan app/assessment/page.tsx
 * (Navbar session-aware + Footer, bisa diakses tanpa login).
 *
 * HALAMAN PERANTARA SEMENTARA: kerjasama integrasi Try Out (in-house vs
 * redirect ke partner/agensoal) belum final. Begitu keputusan itu final,
 * HALAMAN INI YANG DIGANTI ISINYA (jadi form tryout in-house, atau redirect
 * ke partner) — TIDAK PERLU ubah link "/tryout" di landing page (CTA di
 * components/sections/TryoutCTA.tsx) atau di mana pun, karena link-nya
 * sudah menunjuk ke route internal ini dari awal.
 */

const KATEGORI_PREVIEW = [
  { nama: "TKA", deskripsi: "Latihan soal mapel wajib & pilihan sesuai kurikulum terbaru" },
  { nama: "SNBT", deskripsi: "Simulasi TPS & Literasi sesuai format ujian sungguhan" },
];

export default async function TryoutPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const navbarProps = await getNavbarProps(session);

  return (
    <div className="flex w-full flex-col">
      <Navbar {...navbarProps} />
      <main className="mx-auto flex w-full max-w-[900px] flex-col items-center gap-8 px-5 py-16 text-center sm:px-8 sm:py-20 md:px-12 lg:px-0">
        <div className="flex flex-col items-center gap-3 sm:gap-5">
          <span className="inline-flex w-fit items-center rounded-[20px] border-[0.8px] border-[#CAC9C9] bg-[#F9F9F9] px-5 py-2 text-sm tracking-[-0.28px] text-[#081EEA]">
            Segera Hadir
          </span>
          <h1 className="text-2xl leading-[1.5] font-semibold tracking-[-0.48px] text-black sm:text-3xl">
            Try Out Akan Segera Hadir
          </h1>
          <p className="max-w-[540px] text-lg leading-[1.5] tracking-[-0.36px] text-[#7E7C7C]">
            Kami sedang menyiapkan latihan soal dan simulasi ujian sungguhan biar kamu makin siap. Berikut kategori
            yang akan tersedia:
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
          {KATEGORI_PREVIEW.map((kategori) => (
            <div
              key={kategori.nama}
              className="flex flex-col items-start gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-6 text-left shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)]"
            >
              <p className="text-lg font-semibold tracking-[-0.36px] text-[#081EEA]">{kategori.nama}</p>
              <p className="text-base text-black">{kategori.deskripsi}</p>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
