"use client";

import TeksKaya from "@/components/studio-soal/TeksKaya";
import type { BlokStimulus } from "@/lib/shared/studio-soal/tipe";

/** Pratinjau stimulus (bacaan + tabel) seperti yang akan dilihat siswa. */
export default function StimulusPratinjau({ blok }: { blok: BlokStimulus[] }) {
  if (blok.length === 0) return <p className="text-sm italic text-[#AFAFAF]">Stimulus masih kosong.</p>;
  return (
    <div className="flex flex-col gap-4 text-sm text-black sm:text-base">
      {blok.map((b, i) =>
        b.jenis === "teks" ? (
          <TeksKaya key={i} teks={b.teks} kosong="(blok teks kosong)" />
        ) : (
          <figure key={i} className="flex min-w-0 flex-col gap-2">
            {b.judul ? (
              <figcaption className="text-sm font-medium">
                <TeksKaya teks={b.judul} />
              </figcaption>
            ) : null}
            <div className="max-w-full overflow-x-auto rounded-[12px] border border-[#E3E3E3]">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[#F6F6F6]">
                  <tr>
                    {b.kepala.map((k, j) => (
                      <th key={j} scope="col" className="border-b border-[#E3E3E3] px-3 py-2 align-top font-medium">
                        <TeksKaya teks={k} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.baris.map((row, r) => (
                    <tr key={r} className="border-b border-[#F1F1F1] last:border-b-0">
                      {row.map((sel, j) => (
                        <td key={j} className="px-3 py-2 align-top">
                          <TeksKaya teks={sel} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </figure>
        ),
      )}
    </div>
  );
}
