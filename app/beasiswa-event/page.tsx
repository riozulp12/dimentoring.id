import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import { getKontenInfoList } from "@/lib/dashboard/getInfoBeasiswaEvent";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";
import BeasiswaEventListClient from "@/components/beasiswa-event/BeasiswaEventListClient";

/**
 * "Beasiswa & Event" (list) — PRD Bagian 4.3/13 (konten_info). HALAMAN
 * PUBLIC ROUTE (di luar route group (protected)), sama polanya dengan
 * app/assessment/page.tsx: pakai Navbar landing page yang berubah otomatis
 * sesuai status login, BUKAN Header+Sidebar dashboard — supaya link sidebar
 * "Beasiswa & Event" (Siswa/Mentor) bisa dibuka juga oleh pengunjung anonim.
 */
export default async function BeasiswaEventPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  // navbarProps & items independen satu sama lain — Promise.all supaya
  // tidak menunggu bergantian.
  const [navbarProps, items] = await Promise.all([
    getNavbarProps(session),
    getKontenInfoList(),
  ]);

  return (
    <div className="flex w-full flex-col">
      <Navbar {...navbarProps} />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:px-20 lg:py-16">
        <div className="mb-8 flex flex-col gap-2 sm:mb-10">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">
            Beasiswa &amp; Event
          </h1>
          <p className="text-base text-[#7E7C7C]">
            Info beasiswa, internship, dan event terbaru untuk menemani perjalananmu sampai kuliah
          </p>
        </div>
        <BeasiswaEventListClient items={items} />
      </main>
      <Footer />
    </div>
  );
}
