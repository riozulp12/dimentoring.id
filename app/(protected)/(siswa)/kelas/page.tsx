import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { getKelasSaya, getRekomendasiKelas } from "@/lib/siswa/getKelasSayaData";
import PageTitle from "@/components/dashboard/PageTitle";
import KelasCard from "@/components/siswa/KelasCard";

/**
 * "Kelas Saya" — PRD Bagian 7.5 (Kelas Bimbingan). Dua section: kelas yang
 * sudah lunas (dengan progress bar), dan Rekomendasi Kelas berdasarkan
 * mapel_tersulit + tingkat_kelas siswa (Bagian 7.0.2 Langkah 2 & 3).
 */

// Server Component ini sengaja tidak import Button (client component) cuma
// buat 1 CTA link — style disamakan manual dengan Button variant="primary" size="sm"
// (pola sama seperti DashboardOverview.tsx).
const CTA_LINK_CLASS =
  "inline-flex items-center justify-center rounded-[18px] font-medium leading-[1.5] whitespace-nowrap transition-[filter,border-color] duration-150 ease-out px-5 py-2 text-sm sm:text-base tracking-[-0.32px] bg-[#081EEA] text-white border border-solid border-transparent drop-shadow-[2px_2px_0px_#000000] hover:border-white hover:drop-shadow-[0px_0px_5px_#000000] active:border-white active:drop-shadow-[2px_2px_0px_#000000]";

export default async function KelasSayaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  // (protected)/layout.tsx sudah memastikan session ada — di sini cuma jaga
  // supaya role LAIN tidak bisa buka halaman ini lewat URL.
  if (!session) return null;
  if (session.role !== "student") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const { data: user } = await supabaseServer
    .from("users")
    .select("tingkat_kelas")
    .eq("id", session.userId)
    .maybeSingle();

  const [kelasSaya, rekomendasi] = await Promise.all([
    getKelasSaya(session.userId),
    getRekomendasiKelas(session.userId, (user?.tingkat_kelas as string | null) ?? null),
  ]);

  return (
    <>
      <PageTitle value="Kelas Saya" />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 p-4 sm:gap-10 sm:p-6 lg:gap-12 lg:p-10">
        {error ? (
          <p className="w-full rounded-[16px] bg-[#FFEBEB] px-4 py-3 text-center text-sm text-[#E70A0A] sm:text-base">
            {error}
          </p>
        ) : null}

        <section className="flex flex-col gap-4 sm:gap-6">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-black sm:text-2xl">Kelas Saya</h2>
          {kelasSaya.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
              <p className="text-base text-[#7E7C7C]">
                Kamu belum ikut kelas apa pun nih. Yuk cari tahu kelas yang cocok buatmu lewat Assessment!
              </p>
              <Link href="/assessment" className={CTA_LINK_CLASS}>
                Coba Assessment Sekarang
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {kelasSaya.map((kelas) => (
                <KelasCard key={kelas.id} {...kelas} />
              ))}
            </div>
          )}
        </section>

        {rekomendasi.length > 0 ? (
          <section className="flex flex-col gap-4 sm:gap-6">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-black sm:text-2xl">
              Rekomendasi Kelas
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {rekomendasi.map((kelas) => (
                <KelasCard key={kelas.id} {...kelas} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
