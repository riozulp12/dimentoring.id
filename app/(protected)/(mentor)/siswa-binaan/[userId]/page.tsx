import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { getMateriWithProgressForSiswa, getSiswaBinaanDetail } from "@/lib/mentor/getSiswaBinaanData";
import Avatar from "@/components/ui/Avatar";
import PageTitle from "@/components/dashboard/PageTitle";

/**
 * Detail Siswa (per Kelas) — PRD Bagian 7.5. GUARD (BR-7): kombinasi
 * userId+kelasId WAJIB valid — enrollment lunas untuk siswa ini di kelas ini
 * DAN kelas itu di-assign ke mentor yang login. Kalau tidak, redirect balik
 * ke /siswa-binaan dengan pesan error — jangan pernah render data siswa yang
 * bukan binaan mentor ini, baik lewat userId asing maupun kelasId asing.
 */

const TIPE_LABEL: Record<string, string> = {
  video: "Video",
  dokumen: "Dokumen",
  rangkuman_teks: "Rangkuman",
};

const ACCESS_DENIED_MESSAGE = "Siswa ini bukan bagian dari kelas yang kamu ampu.";

export default async function SiswaBinaanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ kelasId?: string }>;
}) {
  const { userId: siswaUserId } = await params;
  const { kelasId } = await searchParams;

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "mentor") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  // BR-27: fitur mengajar (termasuk detail Siswa Saya) terkunci selama Pending.
  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    redirect("/dashboard/mentor");
  }

  if (!kelasId) {
    redirect(`/siswa-binaan?error=${encodeURIComponent(ACCESS_DENIED_MESSAGE)}`);
  }

  const detail = await getSiswaBinaanDetail(session.userId, siswaUserId, kelasId);
  if (!detail) {
    redirect(`/siswa-binaan?error=${encodeURIComponent(ACCESS_DENIED_MESSAGE)}`);
  }

  const materiList = await getMateriWithProgressForSiswa(detail.kelasId, detail.userId);

  return (
    <>
      <PageTitle value={detail.nama} />
      <div className="mx-auto flex w-full max-w-[800px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <div className="flex flex-col items-center gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-6 text-center sm:px-8">
          <Avatar avatarUrl={detail.avatarUrl} nama={detail.nama} size="lg" />
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-black">{detail.nama}</h1>
            <p className="text-sm text-[#7E7C7C]">{detail.kelasNama}</p>
          </div>
          <div className="flex flex-col items-center gap-1 pt-2">
            <p className="text-4xl font-semibold tracking-[-0.02em] text-[#081EEA]">{detail.progresPersen}%</p>
            <p className="text-sm text-[#7E7C7C]">Progress Kelas</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Materi</h2>
          {materiList.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-10 text-center">
              <p className="text-base text-[#7E7C7C]">Belum ada materi untuk kelas ini</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {materiList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4"
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="inline-flex w-fit items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
                      {TIPE_LABEL[item.tipe]}
                    </span>
                    <p className="text-base text-black">{item.judul}</p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      item.selesai ? "bg-[#F0FDF4] text-[#0CBA00]" : "bg-gray-100 text-[#7E7C7C]"
                    }`}
                  >
                    {item.selesai ? "Selesai" : "Belum Selesai"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
