import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken, type SessionRole } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { getKelasSaya, getRekomendasiKelas, type KelasSayaItem } from "@/lib/siswa/getKelasSayaData";
import { getKelasKatalog, type KelasCardPreview } from "@/lib/dashboard/getProgramData";
import { getInfoBeasiswaEvent } from "@/lib/dashboard/getInfoBeasiswaEvent";
import { formatDeadline } from "@/lib/shared/formatDeadline";
import { hrefKelasJualan } from "@/lib/shared/kelasHref";
import PageTitle from "@/components/dashboard/PageTitle";
import { ListCard } from "@/components/dashboard/DashboardOverview";
import KelasSayaCard from "@/components/siswa/KelasSayaCard";
import KelasCardFrame from "@/components/program/KelasCardFrame";
import KelasCardMeta from "@/components/program/KelasCardMeta";

/**
 * "Kelas Saya" — PRD Bagian 7.5 (Kelas Bimbingan). Kelas yang sudah lunas
 * dipisah "Sedang Berjalan"/"Selesai" berdasar Progress KEHADIRAN
 * (lib/shared/progresSesi.ts, sama dengan detail kelas), Rekomendasi Kelas
 * (mapel_tersulit + tingkat_kelas, fallback ke kelas katalog lain), lalu
 * "Event dan Beasiswa". Siswa yang belum punya kelas lunas melihat seluruh
 * kelas katalog sebagai pengganti dua section pertama.
 */

const MAX_EVENT_BEASISWA = 6;

/** Card jualan — REUSE persis komponen /program (KelasCardFrame +
 * KelasCardMeta, tombol daftar pakai pola stretched-link, bukan tombol di
 * dalam Link). `compact` = grid 2 kolom di mobile seperti /program. Kelas di
 * sini BELUM dibeli, jadi klik card → detail jualan (/program/kelas/[id]),
 * bukan halaman kelas siswa. */
function KelasJualGrid({
  items,
  sessionRole,
  compact = false,
}: {
  items: KelasCardPreview[];
  sessionRole: SessionRole;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "grid w-full grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
          : "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
      }
    >
      {items.map((item, idx) => (
        <KelasCardFrame
          key={item.id}
          href={hrefKelasJualan(item.id)}
          namaKelas={item.nama}
          index={idx}
          diskonAktif={item.diskonAktif}
          sisaSlot={item.sisaSlot}
          kapasitas={item.kapasitas}
          programKategori={item.programKategori}
          tingkatKelas={item.tingkatKelas}
          subtesNama={item.subtesNama}
          compact={compact}
        >
          <KelasCardMeta item={item} sessionRole={sessionRole} compact={compact} />
        </KelasCardFrame>
      ))}
    </div>
  );
}

function KelasSayaGroup({ judul, items, indexOffset }: { judul: string; items: KelasSayaItem[]; indexOffset: number }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">{judul}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {items.map((kelas, idx) => (
          <KelasSayaCard key={kelas.id} index={indexOffset + idx} {...kelas} />
        ))}
      </div>
    </div>
  );
}

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

  const [kelasSaya, eventBeasiswa] = await Promise.all([
    getKelasSaya(session.userId),
    getInfoBeasiswaEvent(MAX_EVENT_BEASISWA),
  ]);

  const punyaKelas = kelasSaya.length > 0;
  // Belum punya kelas lunas: tawarkan SELURUH kelas katalog. Sudah punya:
  // Rekomendasi (mapel tersulit + tingkat kelas, fallback kelas katalog lain).
  const kelasTawaran = punyaKelas
    ? await getRekomendasiKelas(session.userId, (user?.tingkat_kelas as string | null) ?? null)
    : await getKelasKatalog();

  const kelasBerjalan = kelasSaya.filter((kelas) => !kelas.selesai);
  const kelasSelesai = kelasSaya.filter((kelas) => kelas.selesai);

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
          {punyaKelas ? (
            <>
              <KelasSayaGroup judul="Sedang Berjalan" items={kelasBerjalan} indexOffset={0} />
              <KelasSayaGroup judul="Selesai" items={kelasSelesai} indexOffset={kelasBerjalan.length} />
            </>
          ) : (
            <>
              <p className="rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-6 text-center text-base text-[#7E7C7C]">
                Kamu belum ikut kelas apa pun nih. Yuk telusuri kelas yang cocok untukmu dibawah ini
              </p>
              <KelasJualGrid items={kelasTawaran} sessionRole={session.role} compact />
            </>
          )}
        </section>

        {punyaKelas && kelasTawaran.length > 0 ? (
          <section className="flex flex-col gap-4 sm:gap-6">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-black sm:text-2xl">
              Rekomendasi Kelas
            </h2>
            {/* Kelas di sini BELUM dibeli — treatment jualan lengkap tetap
                relevan, makanya reuse persis komponen yang sama dengan
                /program (variant "jual" default di KelasCardVisual). */}
            <KelasJualGrid items={kelasTawaran} sessionRole={session.role} />
          </section>
        ) : null}

        {eventBeasiswa.length > 0 ? (
          <section>
            <ListCard
              title="Event dan Beasiswa"
              headerAction={{ href: "/beasiswa-event", label: "Lihat Semua" }}
              rows={eventBeasiswa.map((item) => ({
                left: item.judul,
                right: formatDeadline(item.deadline),
                rightColor: "text-[#E70A0A]",
              }))}
              emptyText=""
            />
          </section>
        ) : null}
      </div>
    </>
  );
}
