import Link from "next/link";

/**
 * Card kelas dipakai ulang di dua section halaman "Kelas Saya" (PRD 7.5):
 * - progresPersen diisi → mode "Kelas Saya" (tampilkan progress bar)
 * - progresPersen undefined → mode "Rekomendasi Kelas" (CTA "Lihat Detail & Daftar")
 * Klik card selalu ke /kelas/[id] — halaman detail sendiri yang menentukan
 * akses penuh vs preview berdasarkan status enrollment siswa.
 */

export interface KelasCardProps {
  id: string;
  nama: string;
  mentorNama: string | null;
  jadwal: string;
  progresPersen?: number;
}

function ProgressBar({ persen }: { persen: number }) {
  const clamped = Math.min(100, Math.max(0, persen));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-[#E3E3E3]">
      <div className="h-full rounded-full bg-[#081EEA]" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export default function KelasCard({ id, nama, mentorNama, jadwal, progresPersen }: KelasCardProps) {
  const isEnrolled = progresPersen !== undefined;

  return (
    <Link
      href={`/kelas/${id}`}
      className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 transition-colors hover:border-[#081EEA] sm:px-6 sm:py-5"
    >
      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-medium tracking-[-0.02em] text-black">{nama}</h3>
        <p className="text-sm text-[#7E7C7C]">
          {mentorNama ? `Mentor: ${mentorNama}` : "Mentor belum ditentukan"}
        </p>
        <p className="text-sm text-[#7E7C7C]">{jadwal}</p>
      </div>

      {isEnrolled ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-black">Progress</span>
            <span className="text-sm text-[#7E7C7C]">{progresPersen}%</span>
          </div>
          <ProgressBar persen={progresPersen} />
        </div>
      ) : (
        <span className="inline-flex w-fit items-center rounded-[18px] bg-[#081EEA] px-4 py-2 text-sm font-medium text-white">
          Lihat Detail &amp; Daftar
        </span>
      )}
    </Link>
  );
}
