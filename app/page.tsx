import { cookies } from "next/headers";
import Navbar from "@/components/ui/Navbar";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import Hero from "@/components/sections/Hero";
import Value from "@/components/sections/Value";
import Prediction from "@/components/sections/Prediction";
import Why from "@/components/sections/Why";
import InfoBeasiswa from "@/components/sections/InfoBeasiswa";
import Program from "@/components/sections/Program";
import TryoutCTA from "@/components/sections/TryoutCTA";
import Mentor from "@/components/sections/Mentor";
import Testimonial from "@/components/sections/Testimonial";
import Leaderboard from "@/components/sections/Leaderboard";
import FAQ from "@/components/sections/FAQ";
import Statement from "@/components/sections/Statement";
import Footer from "@/components/sections/Footer";
import { getLandingMentors } from "@/lib/landing/getLandingMentors";
import { getPtnJurusanOptions } from "@/lib/landing/getPtnJurusanOptions";

/**
 * JSON-LD schema.org/EducationalOrganization (PRD Bagian 4) — cuma di
 * homepage, tempat wajar Google mengambil info entitas bisnis. `sameAs`
 * reuse persis 3 link sosial yang sudah ada di Footer.tsx (WhatsApp sengaja
 * TIDAK dimasukkan — itu kanal kontak, bukan halaman profil publik yang
 * merepresentasikan entitas). `logo` pakai app/icon.png (PNG persegi, bukan
 * SVG — Google secara eksplisit tidak merekomendasikan SVG untuk field
 * logo). `aggregateRating` sengaja belum diisi — belum ada sistem rating
 * asli, isi data palsu di sini justru bisa kena penalti Google (review
 * schema harus representasikan rating sungguhan).
 */
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "Dimentoring.id",
  url: "https://dimentoring.id",
  logo: "https://dimentoring.id/icon.png",
  sameAs: [
    "https://www.instagram.com/dimentoring.id",
    "https://www.tiktok.com/@dimentoring.id",
    "https://www.youtube.com/@DimentoringBimbingKamuMasukPTN",
  ],
};

export default async function Home() {
  // Navbar berubah kalau sudah login (PRD 7.0.6/12.1) — session dibaca di
  // server, sama seperti app/api/assessment/snbp/route.ts, bukan dari client.
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  // 3 query di bawah independen satu sama lain (cuma navbarProps yang butuh
  // session, tapi session sendiri sudah siap tanpa query DB) — jalankan
  // barengan lewat Promise.all, bukan berurutan, supaya waktu tunggu
  // total = query paling lambat, bukan jumlah semuanya.
  const [ptnJurusanOptions, navbarProps, mentors] = await Promise.all([
    // Widget Cek Keketatan (PRD 7.4.5/FR-3.11) — data publik, tidak butuh
    // login/session, murni dipakai buat isi 3 dropdown berjenjang di landing
    // page. Query di-paginate di getPtnJurusanOptions supaya tidak kena batas
    // default 1000 baris PostgREST (ptn_jurusan sekarang 7700+ baris).
    getPtnJurusanOptions(),
    getNavbarProps(session),
    // Section Mentor (PRD Bagian 4.3 #6) — hanya mentor active + avatar_url terisi.
    getLandingMentors(),
  ]);

  return (
    <div className="flex w-full flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
      />
      <Navbar activeItem="home" {...navbarProps} />
      <Hero />
      <Value />
      <Prediction ptnJurusanOptions={ptnJurusanOptions} />
      <TryoutCTA />
      <Testimonial />
      <Why />
      <InfoBeasiswa />
      <Program />
      <Mentor mentors={mentors} />
      <Leaderboard />
      <FAQ />
      <Statement />
      <Footer />
    </div>
  );
}
