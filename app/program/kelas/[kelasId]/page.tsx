import Link from "next/link";
import type { ReactNode, SVGProps } from "react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import {
  getKelasDetailPublic,
  getMateriPublicByKelasId,
  type KelasMentorInfo,
  type MateriPublicItem,
} from "@/lib/dashboard/getProgramData";
import { PROGRAM_KATEGORI_SLUG } from "@/lib/shared/kelasLabels";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import KelasCardVisual from "@/components/ui/KelasCardVisual";

/** Detail publik 1 kelas (PRD 7.5.4) — TIGA card independen (masing-masing
 * border+shadow+padding sendiri, dipisah gap yang jelas, bukan satu card besar
 * dibagi kolom): Card 1 banner (KelasCardVisual full-bleed), Card 2 info kelas
 * (kiri, lebih lebar) + Card 3 sidebar Materi (kanan, lebih sempit) berdampingan
 * di desktop dan bertumpuk di mobile, lalu tombol "Daftar Sekarang" full-width
 * TERPISAH di luar ketiga card. Logic tombol TETAP SAMA seperti sebelumnya:
 * belum login -> /login; sudah login sebagai Siswa -> /checkout/[kelasId];
 * sudah login sebagai role lain (Mentor/Admin) -> nonaktif (kelas cuma untuk
 * Siswa). List Mentor & Materi dibatasi gradient putih untuk visitor belum
 * login (teaser), tampil penuh begitu sudah login (role apa pun). */

function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-[#F9FAFF] px-3 py-1 text-xs font-medium text-[#081EEA]">
      {children}
    </span>
  );
}

function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6.5" />
      <line x1="16" y1="3" x2="16" y2="6.5" />
    </svg>
  );
}

function DocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <line x1="8.5" y1="12" x2="15.5" y2="12" />
      <line x1="8.5" y1="15.5" x2="15.5" y2="15.5" />
    </svg>
  );
}

/** Teaser gated: batasi tinggi + tutup pakai rectangle gradient putih
 * (100% -> 0%) buat visitor belum login, ajak login untuk lihat semua. */
function GatedTeaser({ isGated, children }: { isGated: boolean; children: ReactNode }) {
  if (!isGated) return <>{children}</>;
  return (
    <div className="relative max-h-[210px] overflow-hidden">
      {children}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-white/0" />
      <div className="absolute inset-x-0 bottom-0 flex justify-center pb-1">
        <Link href="/login" className="pointer-events-auto text-sm font-medium text-[#081EEA] hover:underline">
          Login untuk lihat semua
        </Link>
      </div>
    </div>
  );
}

function MentorListItem({ mentor }: { mentor: KelasMentorInfo }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar avatarUrl={mentor.avatarUrl} nama={mentor.nama} size="md" />
      <div className="flex min-w-0 flex-col">
        <p className="truncate text-sm font-medium text-black">{mentor.nama}</p>
        {mentor.asalPtn ? <p className="truncate text-xs text-[#7E7C7C]">{mentor.asalPtn}</p> : null}
      </div>
    </div>
  );
}

function MateriListItem({ item }: { item: MateriPublicItem }) {
  return (
    <div className="flex items-start gap-3 rounded-[14px] border-[0.8px] border-[#E3E3E3] bg-white px-3 py-2.5">
      <DocumentIcon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[#081EEA]" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="line-clamp-1 text-sm font-medium text-black">{item.judul}</p>
        <p className="line-clamp-1 text-xs text-[#7E7C7C]">{item.snippet}</p>
      </div>
    </div>
  );
}

export default async function KelasDetailPublicPage({ params }: { params: Promise<{ kelasId: string }> }) {
  const { kelasId } = await params;
  const [kelas, materi] = await Promise.all([getKelasDetailPublic(kelasId), getMateriPublicByKelasId(kelasId)]);
  if (!kelas) notFound();

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const navbarProps = await getNavbarProps(session);
  const isLoggedIn = Boolean(session);

  return (
    <div className="flex w-full flex-col">
      <Navbar {...navbarProps} activeItem="program" />
      <main className="mx-auto w-full max-w-[1040px] flex-1 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:px-0 lg:py-16">
        <Link href={`/program/${PROGRAM_KATEGORI_SLUG[kelas.programKategori]}`} className="mb-6 inline-block w-fit text-sm font-medium text-[#081EEA] hover:underline sm:mb-8">
          &larr; {kelas.programKategoriLabel}
        </Link>

        <div className="flex flex-col gap-5 sm:gap-6">
          {/* CARD 1 — Banner, full-bleed, tanpa padding tambahan */}
          <div className="overflow-hidden rounded-[20px] border-[0.8px] border-[#E3E3E3] shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)]">
            <KelasCardVisual
              namaKelas={kelas.nama}
              index={0}
              diskonAktif={kelas.diskonAktif}
              sisaSlot={kelas.sisaSlot}
              kapasitas={kelas.kapasitas}
              programKategori={kelas.programKategori}
              tingkatKelas={kelas.tingkatKelas}
              subtesNama={kelas.subtesNama}
              size="banner"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[2fr_1fr]">
            {/* CARD 2 — Info Kelas */}
            <div className="flex flex-col gap-5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-5 shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)] sm:p-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex flex-col gap-1.5">
                  <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">{kelas.nama}</h1>
                  {kelas.jadwalDisplay ? (
                    <div className="flex items-center gap-1.5 text-sm text-[#7E7C7C]">
                      <CalendarIcon aria-hidden className="h-4 w-4 shrink-0" />
                      <span>{kelas.jadwalDisplay}</span>
                    </div>
                  ) : null}
                </div>
                <p className="text-xl font-semibold whitespace-nowrap text-[#081EEA] sm:text-2xl">{formatRupiah(kelas.harga)}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge>{kelas.tipeKelasLabel}</Badge>
                {kelas.subtesNama ? <Badge>{kelas.subtesNama}</Badge> : null}
                <Badge>{kelas.tingkatKelasLabel}</Badge>
              </div>

              {kelas.deskripsi ? (
                <div className="flex flex-col gap-1.5 border-t border-[#E3E3E3] pt-5">
                  <p className="text-sm text-[#7E7C7C]">Deskripsi</p>
                  <p className="whitespace-pre-wrap text-base text-black">{kelas.deskripsi}</p>
                </div>
              ) : null}

              {kelas.mentors.length > 0 ? (
                <div className="flex flex-col gap-3 border-t border-[#E3E3E3] pt-5">
                  <p className="text-sm text-[#7E7C7C]">Mentor Kelas Ini</p>
                  <GatedTeaser isGated={!isLoggedIn}>
                    <div className="flex flex-col gap-3">
                      {kelas.mentors.map((mentor) => (
                        <MentorListItem key={mentor.nama} mentor={mentor} />
                      ))}
                    </div>
                  </GatedTeaser>
                </div>
              ) : null}
            </div>

            {/* CARD 3 — Materi */}
            <div className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-5 shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)] sm:p-8">
              <p className="text-sm text-[#7E7C7C]">Materi</p>
              {materi.length === 0 ? (
                <p className="text-sm text-[#7E7C7C]">Materi untuk kelas ini akan segera tersedia.</p>
              ) : (
                <GatedTeaser isGated={!isLoggedIn}>
                  <div className="flex flex-col gap-2">
                    {materi.map((item) => (
                      <MateriListItem key={item.id} item={item} />
                    ))}
                  </div>
                </GatedTeaser>
              )}
            </div>
          </div>

          {/* Tombol Daftar Sekarang — full-width, terpisah dari ketiga card */}
          <div className="flex flex-col gap-2">
            {kelas.sisaSlot <= 0 ? (
              <>
                <Button type="button" variant="primary" size="lg" className="w-full" disabled>
                  Kelas Penuh
                </Button>
                <p className="text-center text-sm text-[#7E7C7C]">Kelas ini sudah penuh, kuota sudah terisi semua.</p>
              </>
            ) : session?.role === "student" ? (
              <Link href={`/checkout/${kelas.id}`} className="w-full">
                <Button type="button" variant="primary" size="lg" className="w-full">
                  Daftar Sekarang
                </Button>
              </Link>
            ) : session ? (
              <>
                <Button type="button" variant="primary" size="lg" className="w-full" disabled>
                  Daftar Sekarang
                </Button>
                <p className="text-center text-sm text-[#7E7C7C]">Pendaftaran kelas hanya untuk akun Siswa.</p>
              </>
            ) : (
              <Link href="/login" className="w-full">
                <Button type="button" variant="primary" size="lg" className="w-full">
                  Daftar Sekarang
                </Button>
              </Link>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
