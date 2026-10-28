"use client";

import Link from "next/link";
import { useMemo, useState, type SetStateAction } from "react";
import { IsianSoal, type SubtesPilihan } from "@/components/studio-soal/FormSoal";
import SoalPratinjau from "@/components/studio-soal/SoalPratinjau";
import { CHIP, KARTU, TOMBOL_KECIL } from "@/components/studio-soal/gaya";
import { LABEL_STATUS, petaError } from "@/components/studio-soal/klien";
import { LABEL_KEADAAN, keadaanKartu, type KartuSoal } from "@/lib/shared/studio-soal/bacaanSoal";
import { LABEL_TIPE, inputValidasiSoal, type FormSoal as DataFormSoal } from "@/lib/shared/studio-soal/formSoal";
import { validasiRumusSoal } from "@/lib/shared/studio-soal/rumus";
import { cuplikRedaksi } from "@/lib/shared/studio-soal/studioMentor";
import type { BlokStimulus } from "@/lib/shared/studio-soal/tipe";
import { validasiSoal } from "@/lib/shared/studio-soal/validasi";

/**
 * Satu kartu soal di halaman "Soal dengan bacaan" (Studio Soal UX-3). Isian
 * memakai IsianSoal yang sama dengan form soal biasa; pratinjau & "uji kunci
 * jawaban" memakai SoalPratinjau dengan bacaan yang sedang ditulis.
 * Penyimpanan diatur halaman induk (FormStimulus, "Simpan semua").
 */

/** Validasi lengkap (sama dengan API Ajukan) untuk satu soal. */
export function cekKartuUntukKirim(form: DataFormSoal, kategori: string | undefined) {
  return [...validasiSoal(inputValidasiSoal(form, kategori), "ajukan"), ...validasiRumusSoal(form)];
}

const WARNA_KEADAAN = {
  kosong: "text-muted",
  tersimpan: "text-success",
  belum: "text-amber-700",
  terkunci: "text-muted",
} as const;

export default function KartuSoalBacaan({
  nomor,
  kartu,
  setForm,
  onUbah,
  onBukaTutup,
  onHapus,
  bolehEdit,
  tampilSemua,
  subtesPilihan,
  kategori,
  bacaanBlok,
}: {
  nomor: number;
  kartu: KartuSoal;
  setForm: (aksi: SetStateAction<DataFormSoal>) => void;
  onUbah: () => void;
  onBukaTutup: () => void;
  /** Ada = kartu belum tersimpan, boleh dibuang. */
  onHapus?: () => void;
  bolehEdit: boolean;
  tampilSemua: boolean;
  subtesPilihan: SubtesPilihan[];
  kategori: string | undefined;
  bacaanBlok: BlokStimulus[];
}) {
  const [tab, setTab] = useState<"tulis" | "pratinjau">("tulis");
  const [yakinHapus, setYakinHapus] = useState(false);
  const { form, hasil } = kartu;
  const keadaan = keadaanKartu(kartu);
  const tersimpan = kartu.jejakTersimpan !== null;
  const idIsi = `kartu-soal-${kartu.id}`;
  const awalan = `s${nomor}-`;

  const errorsAjukan = useMemo(() => cekKartuUntukKirim(form, kategori), [form, kategori]);
  const errorsBentuk = errorsAjukan.filter((e) => e.jenis === "bentuk");
  // Kartu kosong tidak dinilai lengkap/tidak (akan dilewati).
  const tampilLengkap = tampilSemua && keadaan !== "kosong";
  const peta = petaError([...(tampilLengkap ? errorsAjukan : errorsBentuk), ...(hasil && !hasil.ok ? hasil.errors : [])]);

  function hapus() {
    if (!onHapus) return;
    if (keadaan === "kosong" || yakinHapus) return onHapus();
    setYakinHapus(true);
  }

  return (
    <article
      className={`${KARTU} ${hasil && !hasil.ok ? "border-danger-line" : ""}`}
      aria-label={`Soal ${nomor}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium text-black">Soal {nomor}</h3>
            <span className="text-xs text-muted">{LABEL_TIPE[form.tipe] ?? form.tipe}</span>
            {tersimpan ? <span className={CHIP}>{LABEL_STATUS[kartu.status] ?? kartu.status}</span> : null}
            <span className={["text-xs", WARNA_KEADAAN[keadaan]].join(" ")}>{LABEL_KEADAAN[keadaan]}</span>
          </div>
          {!kartu.terbuka ? (
            <p className="break-words text-sm text-muted">{form.redaksi.trim() ? cuplikRedaksi(form.redaksi, 120) : "(belum ada teks soal)"}</p>
          ) : null}
          {kartu.status === "ditolak" && kartu.alasanTolak ? (
            <p className="text-sm text-amber-900">
              <span className="font-medium">Catatan dari pengecek:</span> {kartu.alasanTolak}
            </p>
          ) : null}
          {hasil && !hasil.ok ? (
            <p role="alert" className="text-sm text-danger">
              Belum tersimpan: {hasil.alasan}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button type="button" onClick={onBukaTutup} aria-expanded={kartu.terbuka} aria-controls={idIsi} className={TOMBOL_KECIL}>
            {kartu.terbuka ? "Tutup" : bolehEdit ? "Buka & ubah" : "Buka"}
          </button>
          {tersimpan ? (
            <Link href={`/studio-soal/soal/${kartu.id}`} className={TOMBOL_KECIL}>
              Halaman soal →
            </Link>
          ) : null}
          {onHapus ? (
            <button type="button" onClick={hapus} onBlur={() => setYakinHapus(false)} className={`${TOMBOL_KECIL} text-danger`}>
              {yakinHapus ? "Yakin buang?" : "Buang kartu"}
            </button>
          ) : null}
        </div>
      </div>

      {kartu.terbuka ? (
        <div id={idIsi} className="flex flex-col gap-4">
          <div className="flex gap-2 lg:hidden" role="tablist">
            {(["tulis", "pratinjau"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={[
                  "flex-1 rounded-full border px-4 py-2 text-sm font-medium",
                  tab === t ? "border-black bg-black text-white" : "border-line-strong bg-white text-black",
                ].join(" ")}
              >
                {t === "tulis" ? "Tulis" : "Pratinjau & uji kunci"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className={["flex min-w-0 flex-col gap-4", tab === "tulis" ? "" : "hidden lg:flex"].join(" ")}>
              <IsianSoal
                form={form}
                setForm={setForm}
                onUbah={onUbah}
                bolehEdit={bolehEdit}
                sudahDisimpan={tersimpan}
                subtesTerkunci
                subtesPilihan={subtesPilihan}
                peta={peta}
                idAwalan={awalan}
              />
              {tampilLengkap && errorsAjukan.length > 0 ? (
                <section className="flex flex-col gap-2 rounded-[20px] border border-danger-line bg-danger-soft p-4">
                  <p className="text-sm font-medium text-danger">Yang perlu dilengkapi di soal {nomor} sebelum dikirim:</p>
                  <ul className="list-disc pl-5 text-sm text-danger">
                    {[...new Set(errorsAjukan.map((e) => e.pesan))].map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
            <aside className={["min-w-0", tab === "pratinjau" ? "" : "hidden lg:block"].join(" ")}>
              <div className={`${KARTU} lg:sticky lg:top-4`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-base font-medium text-black">Pratinjau soal {nomor}</h4>
                  <span className="text-xs text-muted">Tampilan seperti yang dilihat siswa</span>
                </div>
                <SoalPratinjau soal={form} stimulus={bacaanBlok} />
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </article>
  );
}
