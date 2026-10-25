import {
  LABEL_STATUS_SOAL,
  LABEL_TIPE_SOAL,
  cuplikRedaksi,
  type KelompokSubtes,
  type StatusSoal,
  type StudioSoalMentorView,
} from "@/lib/shared/studio-soal/studioMentor";

/**
 * Studio Soal (Mentor) — PR 3a. Menampilkan subtes yang ditugaskan Admin dan
 * daftar soal tulisan mentor. Belum ada form pembuat soal (PR 3b).
 */

function formatTanggal(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

function DaftarSoal({ kelompok }: { kelompok: KelompokSubtes }) {
  if (kelompok.soal.length === 0) {
    return <p className="text-sm text-[#7E7C7C]">Belum ada soal di subtes ini.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-[#E3E3E3]">
      {kelompok.soal.map((s) => (
        <li key={s.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="break-words text-sm text-black sm:text-base">{cuplikRedaksi(s.redaksi)}</p>
            <p className="text-xs text-[#7E7C7C] sm:text-sm">
              {LABEL_TIPE_SOAL[s.tipe] ?? s.tipe}
              {s.versi > 1 ? ` · versi ${s.versi}` : ""} · diperbarui {formatTanggal(s.updatedAt)}
            </p>
          </div>
          <span className="w-fit shrink-0 rounded-full bg-[#F1F1F1] px-2.5 py-0.5 text-xs font-medium text-black">
            {LABEL_STATUS_SOAL[s.status as StatusSoal] ?? s.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function StudioSoalMentor({ data }: { data: StudioSoalMentorView }) {
  return (
    <div className="flex flex-col gap-6">
      {data.ditugaskan.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base font-medium text-black">Anda belum ditugaskan ke subtes mana pun</p>
          <p className="max-w-[520px] text-sm text-[#7E7C7C]">
            Admin yang menentukan subtes yang bisa Anda tulis dan tinjau soalnya. Subtes di profil mengajar Anda tidak
            otomatis masuk ke sini. Hubungi Admin bila ingin ikut menulis soal.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-[#7E7C7C]">
            Anda bisa menulis dan meninjau soal untuk subtes di bawah ini. Form pembuat soal segera hadir.
          </p>
          {data.ditugaskan.map((k) => (
            <section
              key={k.subtesId}
              className="flex flex-col gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-6"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-medium text-black sm:text-lg">{k.nama}</h2>
                <p className="shrink-0 text-sm text-[#7E7C7C]">{k.soal.length} soal</p>
              </div>
              <DaftarSoal kelompok={k} />
            </section>
          ))}
        </>
      )}

      {data.tidakDitugaskan.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium text-black sm:text-lg">Soal di subtes yang tidak lagi ditugaskan</h2>
            <p className="text-sm text-[#7E7C7C]">
              Soal ini tetap tersimpan dengan status yang sama, tapi Anda tidak bisa mengubah atau mengajukannya sampai
              Admin menugaskan Anda lagi.
            </p>
          </div>
          {data.tidakDitugaskan.map((k) => (
            <section
              key={k.subtesId}
              className="flex flex-col gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-[#FAFAFA] px-5 py-4 sm:px-6"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-medium text-black">{k.nama}</h3>
                <p className="shrink-0 text-sm text-[#7E7C7C]">{k.soal.length} soal</p>
              </div>
              <DaftarSoal kelompok={k} />
            </section>
          ))}
        </section>
      ) : null}
    </div>
  );
}
