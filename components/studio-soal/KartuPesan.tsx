import Link from "next/link";

/** Kartu pesan sederhana untuk halaman Studio Soal (gagal muat, tidak ditugaskan, dsb.). */
export default function KartuPesan({ judul, isi }: { judul: string; isi?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border-[0.8px] border-line bg-white px-5 py-12 text-center">
      <p className="text-base font-medium text-black">{judul}</p>
      {isi ? <p className="max-w-[520px] text-sm text-muted">{isi}</p> : null}
      <Link href="/studio-soal" className="text-sm font-medium text-primary hover:underline">
        Kembali ke Studio Soal
      </Link>
    </div>
  );
}
