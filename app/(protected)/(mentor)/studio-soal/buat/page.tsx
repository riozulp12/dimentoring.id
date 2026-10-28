import Link from "next/link";
import type { ReactNode } from "react";
import PageTitle from "@/components/dashboard/PageTitle";
import KartuPesan from "@/components/studio-soal/KartuPesan";
import { buttonClassName } from "@/components/ui/buttonClassName";
import { mentorHalamanStudio } from "@/lib/mentor/studioSoalHalaman";
import { getSubtesDitugaskan } from "@/lib/mentor/studioSoal";

/**
 * "+ Buat soal" (Mentor) — Studio Soal UX-2. Satu pintu: pilih "Soal biasa"
 * (form soal baru) atau "Soal dengan bacaan" (form bacaan baru). Hanya
 * mengarahkan ke form yang sudah ada; route lama soal/baru & stimulus/baru
 * tetap bisa dibuka langsung. ?subtes= diteruskan bila memang ditugaskan.
 */
export default async function BuatSoalPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const mentorId = await mentorHalamanStudio();
  const sp = await searchParams;
  const subtes = await getSubtesDitugaskan(mentorId);

  let isi: ReactNode;
  if (subtes === "gagal") {
    isi = <KartuPesan judul="Studio Soal gagal dimuat" isi="Coba muat ulang halaman." />;
  } else if (subtes.length === 0) {
    isi = (
      <KartuPesan
        judul="Anda belum ditugaskan menulis soal"
        isi="Admin yang memilih subtes yang bisa Anda tulis. Hubungi Admin kalau ingin ikut menulis soal."
      />
    );
  } else {
    const param = typeof sp.subtes === "string" ? sp.subtes : "";
    const dipilih = subtes.find((s) => s.id === param) ?? (subtes.length === 1 ? subtes[0] : null);
    const q = dipilih ? `?subtes=${dipilih.id}` : "";
    const pilihan = [
      {
        href: `/studio-soal/soal/baru${q}`,
        judul: "Soal biasa",
        teks: "Satu soal berdiri sendiri.",
        tombol: "Pilih soal biasa",
      },
      {
        href: `/studio-soal/stimulus/baru${q}`,
        judul: "Soal dengan bacaan",
        teks: "Satu bacaan atau teks, lalu beberapa soal yang merujuk ke bacaan itu.",
        tombol: "Pilih soal dengan bacaan",
      },
    ];
    isi = (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Link href="/studio-soal" className="w-fit text-sm text-primary hover:underline">
            ← Studio Soal
          </Link>
          <h1 className="text-xl font-medium text-black sm:text-2xl">Buat soal{dipilih ? ` — ${dipilih.nama}` : ""}</h1>
          <p className="text-sm text-muted">Pilih bentuk soal yang mau dibuat.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pilihan.map((p) => (
            <div
              key={p.href}
              className="flex min-h-40 flex-col justify-between gap-5 rounded-[20px] border-[0.8px] border-line bg-white p-5 transition-colors hover:border-primary sm:p-6"
            >
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-medium text-black sm:text-xl">{p.judul}</h2>
                <p className="text-sm text-muted sm:text-base">{p.teks}</p>
              </div>
              <Link href={p.href} className={buttonClassName({ variant: "primary", className: "w-full" })}>
                {p.tombol}
              </Link>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageTitle value="Studio Soal" />
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 p-4 sm:p-6 lg:p-10">{isi}</div>
    </>
  );
}
