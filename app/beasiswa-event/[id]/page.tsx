import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps, type NavbarSessionProps } from "@/lib/dashboard/getNavbarProps";
import { formatDeadline } from "@/lib/shared/formatDeadline";
import {
  KONTEN_INFO_STATUS_BADGE_CLASS,
  KONTEN_INFO_STATUS_LABEL,
  KONTEN_INFO_TIPE_BADGE_CLASS,
  KONTEN_INFO_TIPE_LABEL,
} from "@/lib/shared/kontenInfoLabels";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";
import DetailInteractionButtons from "@/components/beasiswa-event/DetailInteractionButtons";

/**
 * Detail Beasiswa/Internship/Event — PRD Bagian 4.3/13 (konten_info). HALAMAN
 * PUBLIC ROUTE (di luar route group (protected)), sama pola dengan
 * app/assessment/hasil/[id]/page.tsx: akses tanpa login diizinkan, guard
 * akses (login) hanya dipakai buat tombol interaksi opsional di bawah.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

function NotFoundState({ navbarProps }: { navbarProps: NavbarSessionProps }) {
  return (
    <div className="flex w-full flex-col">
      <Navbar {...navbarProps} />
      <main className="mx-auto flex min-h-[60vh] w-full max-w-[1600px] flex-col items-center justify-center gap-2 px-5 py-20 text-center sm:px-8">
        <h1 className="text-xl font-semibold text-black sm:text-2xl">Konten Tidak Ditemukan</h1>
        <p className="max-w-md text-base text-[#7E7C7C]">
          Info beasiswa, internship, atau event yang kamu cari tidak ditemukan. Coba cek lagi lewat halaman
          Beasiswa &amp; Event.
        </p>
      </main>
      <Footer />
    </div>
  );
}

export default async function BeasiswaEventDetailPage({ params }: PageProps) {
  const { id } = await params;

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const navbarProps = await getNavbarProps(session);

  if (!UUID_RE.test(id)) {
    return <NotFoundState navbarProps={navbarProps} />;
  }

  const { data: konten, error } = await supabaseServer
    .from("konten_info")
    .select("id, tipe, judul, deskripsi, deskripsi_lengkap, link_pendaftaran, deadline, status")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[beasiswa-event/detail] query konten_info failed:", error);
  }

  if (!konten) {
    return <NotFoundState navbarProps={navbarProps} />;
  }

  const isDitutup = konten.status === "ditutup";
  const linkPendaftaran = konten.link_pendaftaran as string | null;
  const deskripsiLengkap = (konten.deskripsi_lengkap as string | null) || (konten.deskripsi as string | null);

  let ctaLabel = "Daftar Sekarang";
  let ctaDisabled = false;
  if (isDitutup) {
    ctaLabel = "Pendaftaran Sudah Ditutup";
    ctaDisabled = true;
  } else if (!linkPendaftaran) {
    ctaLabel = "Link Pendaftaran Belum Tersedia";
    ctaDisabled = true;
  }

  return (
    <div className="flex w-full flex-col">
      <Navbar {...navbarProps} />
      <main className="mx-auto w-full max-w-[900px] flex-1 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:py-16">
        <div className="flex flex-col gap-5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-6 sm:gap-6 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                KONTEN_INFO_TIPE_BADGE_CLASS[konten.tipe as string] ?? "bg-gray-100 text-[#7E7C7C]"
              }`}
            >
              {KONTEN_INFO_TIPE_LABEL[konten.tipe as string] ?? konten.tipe}
            </span>
            <span
              className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                KONTEN_INFO_STATUS_BADGE_CLASS[konten.status as string] ?? "bg-gray-100 text-[#7E7C7C]"
              }`}
            >
              {KONTEN_INFO_STATUS_LABEL[konten.status as string] ?? konten.status}
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">
            {konten.judul as string}
          </h1>

          <p className={`text-sm sm:text-base ${isDitutup ? "text-[#7E7C7C]" : "text-[#E70A0A]"}`}>
            Deadline: {formatDeadline(konten.deadline as string | null)}
          </p>

          {deskripsiLengkap ? (
            <p className="whitespace-pre-wrap text-base text-black">{deskripsiLengkap}</p>
          ) : (
            <p className="text-base text-[#7E7C7C]">Belum ada deskripsi lengkap untuk konten ini.</p>
          )}

          <div className="flex flex-col gap-4 border-t border-[#E3E3E3] pt-5 sm:gap-5">
            {ctaDisabled ? (
              <span
                aria-disabled="true"
                className="inline-flex w-fit cursor-not-allowed items-center justify-center rounded-[18px] bg-[#E3E3E3] px-6 py-2.5 text-sm font-medium text-[#7E7C7C] sm:text-base"
              >
                {ctaLabel}
              </span>
            ) : (
              <a
                href={linkPendaftaran as string}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center justify-center rounded-[18px] bg-[#081EEA] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 sm:text-base"
              >
                {ctaLabel}
              </a>
            )}

            {session ? <DetailInteractionButtons kontenInfoId={konten.id as string} /> : null}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
