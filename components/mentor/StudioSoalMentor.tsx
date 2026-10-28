import Link from "next/link";
import { buttonClassName } from "@/components/ui/buttonClassName";
import TombolHapusDraf from "@/components/studio-soal/TombolHapusDraf";
import { CHIP } from "@/components/studio-soal/gaya";
import { alasanTidakBisaHapus, tampilkanTombolHapus } from "@/lib/shared/studio-soal/hapusDraf";
import {
  LABEL_STATUS_SOAL,
  LABEL_TIPE_SOAL,
  cuplikRedaksi,
  type KelompokSubtes,
  type StatusSoal,
  type StimulusRingkas,
  type StudioSoalMentorView,
} from "@/lib/shared/studio-soal/studioMentor";

/**
 * Studio Soal (Mentor) — PR 3a + 3b, UX-1. Subtes yang ditugaskan Admin, daftar
 * soal & bacaan (stimulus) tulisan mentor, tombol menulis baru (hanya di
 * subtes yang ditugaskan), dan tombol "Hapus draf" per baris.
 */

function formatTanggal(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

function ChipStatus({ status }: { status: string }) {
  return <span className={CHIP}>{LABEL_STATUS_SOAL[status as StatusSoal] ?? status}</span>;
}

const BARIS = "flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4";

function DaftarSoal({ kelompok, ditugaskan }: { kelompok: KelompokSubtes; ditugaskan: boolean }) {
  if (kelompok.soal.length === 0) {
    return <p className="text-sm text-muted">Belum ada soal di subtes ini.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-line">
      {kelompok.soal.map((s) => (
        <li key={s.id} className={BARIS}>
          <Link href={`/studio-soal/soal/${s.id}`} className="group flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="break-words text-sm text-black group-hover:text-primary sm:text-base">{cuplikRedaksi(s.redaksi)}</p>
            <p className="text-xs text-muted sm:text-sm">
              {LABEL_TIPE_SOAL[s.tipe] ?? s.tipe}
              {s.stimulusId ? " · bagian dari bacaan" : ""}
              {s.versi > 1 ? ` · versi ${s.versi}` : ""} · diubah {formatTanggal(s.updatedAt)}
            </p>
          </Link>
          <div className="flex shrink-0 items-center gap-3">
            <ChipStatus status={s.status} />
            {tampilkanTombolHapus(s.status) ? (
              <TombolHapusDraf
                objek="soal"
                id={s.id}
                versi={s.versi}
                alasan={alasanTidakBisaHapus("soal", {
                  status: s.status,
                  pernahDiajukan: s.pernahDiajukan ?? false,
                  ditugaskan,
                })}
              />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function DaftarBacaan({ stimulus, ditugaskan }: { stimulus: StimulusRingkas[]; ditugaskan: boolean }) {
  if (stimulus.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium text-black">Bacaan / teks pendukung</h3>
      <ul className="flex flex-col divide-y divide-line">
        {stimulus.map((st) => (
          <li key={st.id} className={BARIS}>
            <Link href={`/studio-soal/stimulus/${st.id}`} className="group flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="break-words text-sm text-black group-hover:text-primary">{st.judul || "(tanpa judul)"}</p>
              <p className="text-xs text-muted">
                Dipakai {st.jumlahSoal} soal{st.versi > 1 ? ` · versi ${st.versi}` : ""} · diubah {formatTanggal(st.updatedAt)}
              </p>
            </Link>
            <div className="flex shrink-0 items-center gap-3">
              <ChipStatus status={st.status} />
              {tampilkanTombolHapus(st.status) ? (
                <TombolHapusDraf
                  objek="stimulus"
                  id={st.id}
                  versi={st.versi}
                  alasan={alasanTidakBisaHapus("stimulus", {
                    status: st.status,
                    pernahDiajukan: st.pernahDiajukan ?? false,
                    ditugaskan,
                    jumlahSoal: st.jumlahSoal,
                  })}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StudioSoalMentor({
  data,
  stimulus = [],
}: {
  data: StudioSoalMentorView;
  stimulus?: StimulusRingkas[];
}) {
  const stimulusDi = (subtesId: string) => stimulus.filter((s) => s.subtesId === subtesId);
  return (
    <div className="flex flex-col gap-6">
      {data.ditugaskan.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[20px] border-[0.8px] border-line bg-white px-5 py-12 text-center">
          <p className="text-base font-medium text-black">Anda belum ditugaskan menulis soal</p>
          <p className="max-w-[520px] text-sm text-muted">
            Admin yang memilih subtes yang bisa Anda tulis. Subtes di profil mengajar Anda tidak otomatis masuk ke sini.
            Hubungi Admin kalau ingin ikut menulis soal.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            Tulis soal untuk subtes di bawah ini. Setelah dikirim, soal dicek dulu oleh mentor lain sebelum terbit.
          </p>
          {data.ditugaskan.map((k) => (
            <section
              key={k.subtesId}
              className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-line bg-white px-5 py-4 sm:px-6"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-base font-medium text-black sm:text-lg">{k.nama}</h2>
                  <p className="shrink-0 text-sm text-muted">{k.soal.length} soal</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/studio-soal/soal/baru?subtes=${k.subtesId}`} className={buttonClassName({ size: "sm" })}>
                    + Tulis soal
                  </Link>
                  <Link
                    href={`/studio-soal/stimulus/baru?subtes=${k.subtesId}`}
                    className={buttonClassName({ variant: "secondary", size: "sm" })}
                  >
                    + Buat bacaan
                  </Link>
                </div>
              </div>
              <DaftarBacaan stimulus={stimulusDi(k.subtesId)} ditugaskan />
              <DaftarSoal kelompok={k} ditugaskan />
            </section>
          ))}
        </>
      )}

      {data.tidakDitugaskan.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium text-black sm:text-lg">Soal di subtes yang tidak lagi ditugaskan</h2>
            <p className="text-sm text-muted">
              Soal ini tetap tersimpan, tapi tidak bisa diubah atau dikirim sampai Admin menugaskan Anda lagi.
            </p>
          </div>
          {data.tidakDitugaskan.map((k) => (
            <section
              key={k.subtesId}
              className="flex flex-col gap-2 rounded-[20px] border-[0.8px] border-line bg-surface px-5 py-4 sm:px-6"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-medium text-black">{k.nama}</h3>
                <p className="shrink-0 text-sm text-muted">{k.soal.length} soal</p>
              </div>
              <DaftarBacaan stimulus={stimulusDi(k.subtesId)} ditugaskan={false} />
              <DaftarSoal kelompok={k} ditugaskan={false} />
            </section>
          ))}
        </section>
      ) : null}
    </div>
  );
}
