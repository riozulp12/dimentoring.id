import { cookies } from "next/headers";
import Navbar from "@/components/ui/Navbar";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import Hero from "@/components/sections/Hero";
import Value from "@/components/sections/Value";
import Prediction, { type PtnJurusanCheckOption } from "@/components/sections/Prediction";
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
import { supabaseServer } from "@/lib/supabase/server";

export default async function Home() {
  // Widget Cek Keketatan (PRD 7.4.5/FR-3.11) — data publik, tidak butuh
  // login/session, murni dipakai buat isi 3 dropdown berjenjang di landing page.
  const { data: ptnJurusanRows, error: ptnJurusanError } = await supabaseServer
    .from("ptn_jurusan")
    .select("id, nama_universitas, nama_jurusan, jenjang, jalur");

  if (ptnJurusanError) {
    console.error("[landing] query ptn_jurusan failed:", ptnJurusanError);
  }

  const ptnJurusanOptions: PtnJurusanCheckOption[] = (ptnJurusanRows ?? []).map((row) => ({
    id: row.id as string,
    namaUniversitas: row.nama_universitas as string,
    namaJurusan: row.nama_jurusan as string,
    jenjang: row.jenjang as string,
    jalur: row.jalur as PtnJurusanCheckOption["jalur"],
  }));

  // Navbar berubah kalau sudah login (PRD 7.0.6/12.1) — session dibaca di
  // server, sama seperti app/api/assessment/snbp/route.ts, bukan dari client.
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const navbarProps = await getNavbarProps(session);

  return (
    <div className="flex w-full flex-col">
      <Navbar activeItem="home" {...navbarProps} />
      <Hero />
      <Value />
      <Prediction ptnJurusanOptions={ptnJurusanOptions} />
      <TryoutCTA />
      <Testimonial />
      <Why />
      <InfoBeasiswa />
      <Program />
      <Mentor />
      <Leaderboard />
      <FAQ />
      <Statement />
      <Footer />
    </div>
  );
}
