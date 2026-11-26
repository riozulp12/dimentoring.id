"use client";

import { useState } from "react";
import TeksKaya from "@/components/studio-soal/TeksKaya";
import StimulusPratinjau from "@/components/studio-soal/StimulusPratinjau";
import SoalPratinjau from "@/components/studio-soal/SoalPratinjau";
import { LABEL_KESULITAN, LABEL_TIPE } from "@/lib/shared/studio-soal/formSoal";
import { LABEL_STATUS_SOAL, type StatusSoal } from "@/lib/shared/studio-soal/studioMentor";
import type { BlokStimulus, TipeSoal } from "@/lib/shared/studio-soal/tipe";

/**
 * Satu soal seperti dilihat siswa (bacaan, redaksi, pilihan/pernyataan/kotak
 * isian). Murni presentasi: tanpa data fetching.
 *
 *  - mode "siswa": jenis prop TIDAK memuat kunci & pembahasan, dan cabang ini
 *    hanya meneruskan tipe, redaksi, dan konten. Jawaban hanya state lokal.
 *  - mode "admin": metadata + coba jawab & periksa (nilaiJawaban, di browser,
 *    untuk pratinjau saja) + tombol buka kunci & pembahasan.
 *
 * Belum dipakai layar siswa sungguhan; di sana kunci tidak boleh ikut terkirim
 * dari server, bukan sekadar tidak dirender.
 */

type Obj = Record<string, unknown>;

export interface SoalSiswa {
  tipe: string;
  redaksi: string;
  konten: Obj;
  kunci?: never;
  pembahasan?: never;
}
export interface SoalAdminTampil {
  tipe: string;
  redaksi: string;
  konten: Obj;
  kunci: Obj;
  pembahasan: string;
}
export interface MetadataSoal {
  subtes: string;
  topik: string | null;
  kesulitan: string;
  level: number | null;
  estimasiDetik: number | null;
  versi: number;
  status: string;
}

export type PropsTampilanSoal =
  | { mode: "siswa"; soal: SoalSiswa; stimulus?: BlokStimulus[] | null; metadata?: never }
  | { mode: "admin"; soal: SoalAdminTampil; stimulus?: BlokStimulus[] | null; metadata: MetadataSoal; awalTampilKunci?: boolean };

const daftar = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export default function TampilanSoal(props: PropsTampilanSoal) {
  if (props.mode === "siswa") {
    const { tipe, redaksi, konten } = props.soal;
    return <LembarSiswa tipe={tipe} redaksi={redaksi} konten={konten} stimulus={props.stimulus ?? null} />;
  }
  const m = props.metadata;
  const baris: [string, string][] = [
    ["Subtes", m.subtes],
    ["Topik", m.topik ?? "—"],
    ["Jenis", LABEL_TIPE[props.soal.tipe as TipeSoal] ?? props.soal.tipe],
    ["Kesulitan", LABEL_KESULITAN[m.kesulitan] ?? m.kesulitan],
    ["Level kognitif", m.level === null ? "—" : `L${m.level}`],
    ["Estimasi waktu", m.estimasiDetik === null ? "—" : `${m.estimasiDetik} detik`],
    ["Versi", String(m.versi)],
    ["Status", LABEL_STATUS_SOAL[m.status as StatusSoal] ?? m.status],
  ];
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 rounded-[16px] border border-line bg-surface p-4 text-sm sm:grid-cols-4">
        {baris.map(([nama, isi]) => (
          <div key={nama} className="min-w-0">
            <dt className="text-xs text-muted">{nama}</dt>
            <dd className="break-words text-black">{isi}</dd>
          </div>
        ))}
      </dl>
      <SoalPratinjau soal={props.soal} stimulus={props.stimulus} teksKunci="kunci dan pembahasan" awalTampilKunci={props.awalTampilKunci} />
    </div>
  );
}

function LembarSiswa({ tipe, redaksi, konten, stimulus }: { tipe: string; redaksi: string; konten: Obj; stimulus: BlokStimulus[] | null }) {
  const [opsi, setOpsi] = useState<string | null>(null);
  const [perBaris, setPerBaris] = useState<Record<string, number>>({});
  const [isian, setIsian] = useState<Record<string, string>>({});
  const label = daftar<string>(konten.label_kolom);
  const jenisRumpang = new Map(daftar<{ id: string; jenis: string }>(konten.rumpang).map((r) => [r.id, r.jenis]));
  const tombol = (aktif: boolean) => (aktif ? "border-primary bg-primary-soft" : "border-line bg-white hover:border-primary");

  return (
    <div className="flex flex-col gap-4">
      {stimulus && stimulus.length > 0 ? (
        <div className="rounded-[16px] border border-line bg-surface p-4">
          <StimulusPratinjau blok={stimulus} />
        </div>
      ) : null}

      <div className="text-sm text-black sm:text-base">
        <TeksKaya
          teks={redaksi}
          rumpang={
            tipe === "isian"
              ? (id) =>
                  jenisRumpang.has(id) ? (
                    <input
                      value={isian[id] ?? ""}
                      onChange={(e) => setIsian((p) => ({ ...p, [id]: e.target.value }))}
                      inputMode={jenisRumpang.get(id) === "angka" ? "decimal" : "text"}
                      aria-label={`Jawaban kotak ${id}`}
                      className="mx-1 w-28 rounded-[8px] border border-subtle px-2 py-0.5 text-sm outline-none focus:border-primary"
                    />
                  ) : null
              : undefined
          }
        />
      </div>

      {tipe === "pilihan_ganda" ? (
        <div role="radiogroup" aria-label="Pilihan jawaban" className="flex flex-col gap-2">
          {daftar<{ label: string; teks: string }>(konten.opsi).map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={opsi === o.label}
              onClick={() => setOpsi(o.label)}
              className={`flex items-start gap-3 rounded-[12px] border px-3 py-2 text-left text-sm transition-colors ${tombol(opsi === o.label)}`}
            >
              <span className="font-medium">{o.label}.</span>
              <TeksKaya teks={o.teks} className="flex-1" sebaris />
            </button>
          ))}
        </div>
      ) : null}

      {tipe === "majemuk_kompleks" ? (
        <div className="flex flex-col gap-2">
          {daftar<{ id: string; teks: string }>(konten.pernyataan).map((p, i) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-[12px] border border-line bg-white px-3 py-2">
              <div className="flex items-start gap-2 text-sm">
                <span className="font-medium">{i + 1}.</span>
                <TeksKaya teks={p.teks} className="flex-1" />
              </div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Jawaban pernyataan ${i + 1}`}>
                {[0, 1].map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={perBaris[p.id] === k}
                    onClick={() => setPerBaris((prev) => ({ ...prev, [p.id]: k }))}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      perBaris[p.id] === k ? "border-primary bg-primary text-white" : "border-line-strong bg-white text-black"
                    }`}
                  >
                    {label[k] ?? `Kolom ${k + 1}`}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
