import { ALUR_SESI, cariSilabusSnbt, strategiHook, type Subtes } from "@/lib/silabus/silabusSnbt";
import { silabusSnbtAktif } from "@/lib/shared/silabusSnbtFlag";
import { sesiPilihanAktif } from "@/lib/shared/sesiPilihanFlag";
import { kelasPrivateOnline } from "@/lib/shared/marginKelas";

/**
 * "Peta Materi" di detail kelas (baca-saja, tanpa JS klien): satu <details> tertutup per subtes yang cocok dengan
 * silabus SNBT. Saklar SILABUS_SNBT_AKTIF mati atau tak ada subtes cocok = tidak merender apa pun (tanpa wrapper kosong).
 * Hanya kalimat pertama strategi (hook) yang tampil.
 */
function kelompokkan(subtes: Subtes): { bagian: string | null; item: Subtes["tipeSoal"] }[] {
  const hasil: { bagian: string | null; item: Subtes["tipeSoal"] }[] = [];
  for (const tipe of subtes.tipeSoal) {
    const bagian = tipe.bagian ?? null;
    const terakhir = hasil[hasil.length - 1];
    if (terakhir && terakhir.bagian === bagian) terakhir.item.push(tipe);
    else hasil.push({ bagian, item: [tipe] });
  }
  return hasil;
}

export default function PetaMateri({
  subtesNama,
  programKategori,
  tipeKelas,
  modePembelajaran,
}: {
  subtesNama: (string | null | undefined)[];
  programKategori: string;
  tipeKelas: string | null | undefined;
  modePembelajaran: string | null | undefined;
}) {
  if (!silabusSnbtAktif()) return null;
  const cocok: Subtes[] = [];
  for (const nama of subtesNama) {
    const s = cariSilabusSnbt(nama, programKategori);
    if (s && !cocok.includes(s)) cocok.push(s);
  }
  if (cocok.length === 0) return null;
  const ajakTambahSesi = sesiPilihanAktif() && kelasPrivateOnline(tipeKelas, modePembelajaran);

  return (
    <div className="flex flex-col gap-3 border-t border-[#E3E3E3] pt-5">
      <h2 className="text-sm font-normal text-[#7E7C7C]">Peta Materi</h2>
      <div className="flex flex-col gap-2">
        {cocok.map((s) => (
          <details key={s.kunci} className="rounded-[12px] border border-[#E3E3E3] bg-white px-4 py-3">
            <summary className="cursor-pointer text-base font-medium text-black">{s.nama}</summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-black">{s.kemampuanInti}</p>
              {kelompokkan(s).map((g) => (
                <div key={g.bagian ?? "semua"} className="flex flex-col gap-1.5">
                  {g.bagian ? <p className="text-xs font-medium text-[#7E7C7C]">{g.bagian}</p> : null}
                  <ul className="flex flex-col gap-1.5">
                    {g.item.map((tipe) => (
                      <li key={tipe.nama} className="flex flex-col">
                        <span className="text-sm text-black">{tipe.nama}</span>
                        <span className="text-xs text-[#7E7C7C]">{strategiHook(tipe.strategi)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-sm text-black">
                <span className="text-[#7E7C7C]">Alur 10 sesi: </span>
                {ALUR_SESI}
              </p>
              {ajakTambahSesi ? (
                <p className="text-xs text-[#7E7C7C]">Mau lebih dalam di tipe soal tertentu? Tambah sesi saat checkout.</p>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
