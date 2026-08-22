import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getProfilData, getProvinsiOptions, getSubtesNamaOptions } from "@/lib/profil/getProfilData";
import PageTitle from "@/components/dashboard/PageTitle";
import ProfilClient from "@/components/profil/ProfilClient";

/** Halaman Profil — SATU halaman untuk Siswa/Mentor/Admin, kontennya
 * menyesuaikan role sesi yang login (PRD Bagian 7 poin 1, Bagian 5). */
export default async function ProfilPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) redirect("/login");

  const [profil, provinsiOptions, subtesOptions] = await Promise.all([
    getProfilData(session.userId, session.role),
    getProvinsiOptions(),
    getSubtesNamaOptions(),
  ]);

  if (!profil) redirect("/login");

  return (
    <>
      <PageTitle value="Profil" />
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <ProfilClient profil={profil} provinsiOptions={provinsiOptions} subtesOptions={subtesOptions} />
      </div>
    </>
  );
}
