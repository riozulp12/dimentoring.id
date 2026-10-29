"use client";

import { useId, useMemo, useState, type SetStateAction } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { IsianSoal, type SubtesPilihan } from "@/components/studio-soal/FormSoal";
import { IkonChevron, IkonTongSampah } from "@/components/studio-soal/Ikon";
import SoalPratinjau from "@/components/studio-soal/SoalPratinjau";
import TombolHapusDraf from "@/components/studio-soal/TombolHapusDraf";
import { CHIP, KARTU, tombolIkon } from "@/components/studio-soal/gaya";
import { LABEL_STATUS, petaError } from "@/components/studio-soal/klien";
import { LABEL_KEADAAN, keadaanKartu, type KartuSoal } from "@/lib/shared/studio-soal/bacaanSoal";
import { LABEL_TIPE, type FormSoal as DataFormSoal } from "@/lib/shared/studio-soal/formSoal";
import { cekSoalLengkap } from "@/lib/shared/studio-soal/kelengkapan";
import { cuplikRedaksi } from "@/lib/shared/studio-soal/studioMentor";
import type { BlokStimulus } from "@/lib/shared/studio-soal/tipe";

/**
 * Satu kartu soal di halaman "Soal dengan bacaan" (Studio Soal UX-3). Isian
 * memakai IsianSoal yang sama dengan form soal biasa; pratinjau & "uji kunci
 * jawaban" memakai SoalPratinjau dengan bacaan yang sedang ditulis.
 * Penyimpanan diatur halaman induk (FormStimulus, "Simpan semua").
 *
 * Revisi UX-3: seluruh kepala kartu bisa diketuk untuk buka/tutup (ikon
 * panah), hapus berupa ikon tong sampah. Mentor mengedit langsung di kartu,
 * jadi aksi yang dulu hanya ada di halaman soal (kirim sendiri, batalkan
 * kirim, versi baru, hapus draf) ada di kartu ini.
 */

/** Validasi lengkap (sama dengan API Ajukan) untuk satu soal. */
export function cekKartuUntukKirim(form: DataFormSoal, kategori: string | undefined) {
  return cekSoalLengkap(form, kategori);
}

const WARNA_KEADAAN = {
  kosong: "text-muted",
  tersimpan: "text-success",
  belum: "text-amber-700",
  terkunci: "text-muted",
} as const;

export type JenisAksiKartu = "kirim" | "tarik" | "versi";

/** Tombol aksi di bawah isi kartu (kirim sendiri, batalkan kirim, versi baru). */
export interface AksiKartu {
  jenis: JenisAksiKartu;
  label: string;
  labelSibuk: string;
  sibuk: boolean;
  utama?: boolean;
}

export default function KartuSoalBacaan({
  nomor,
  kartu,
  setForm,
  onUbah,
  onBukaTutup,
  onBuang,
  hapusDraf,
  aksi = [],
  onAksi,
  terkunci = false,
  catatan,
  bolehEdit,
  tampilSemua,
  subtesPilihan,
  kategori,
  bacaanBlok,
  onAktif,
}: {
  nomor: number;
  kartu: KartuSoal;
  setForm: (aksi: SetStateAction<DataFormSoal>) => void;
  onUbah: () => void;
  onBukaTutup: () => void;
  /** Ada = kartu belum tersimpan, boleh dibuang dari halaman (tanpa server). */
  onBuang?: () => void;
  /** Ada = soal tersimpan yang tombol hapus drafnya tampil. */
  hapusDraf?: { alasan: string | null; onTerhapus: () => void };
  aksi?: AksiKartu[];
  onAksi?: (jenis: JenisAksiKartu) => void;
  /** Semua tombol aksi dikunci (halaman sedang menyimpan/mengirim). */
  terkunci?: boolean;
  /** Keterangan kecil di bawah isi (mis. kenapa hanya bisa dilihat). */
  catatan?: string;
  bolehEdit: boolean;
  tampilSemua: boolean;
  subtesPilihan: SubtesPilihan[];
  kategori: string | undefined;
  bacaanBlok: BlokStimulus[];
  /** Kartu ini sedang dikerjakan (fokus/dibuka) -> pratinjau di kolom kanan. */
  onAktif?: () => void;
}) {
  const [tab, setTab] = useState<"tulis" | "pratinjau">("tulis");
  const [yakinBuang, setYakinBuang] = useState(false);
  const idJudulBuang = useId();
  const { form, hasil } = kartu;
  const keadaan = keadaanKartu(kartu);
  const tersimpan = kartu.jejakTersimpan !== null;
  const idIsi = `kartu-soal-${kartu.id}`;
  const idJudul = `judul-kartu-soal-${kartu.id}`;
  const awalan = `s${nomor}-`;

  const errorsAjukan = useMemo(() => cekKartuUntukKirim(form, kategori), [form, kategori]);
  const errorsBentuk = errorsAjukan.filter((e) => e.jenis === "bentuk");
  // Kartu kosong tidak dinilai lengkap/tidak (akan dilewati).
  const tampilLengkap = tampilSemua && keadaan !== "kosong";
  const peta = petaError([...(tampilLengkap ? errorsAjukan : errorsBentuk), ...(hasil && !hasil.ok ? hasil.errors : [])]);

  function buang() {
    if (!onBuang) return;
    if (keadaan === "kosong") return onBuang();
    setYakinBuang(true);
  }

  const labelBukaTutup = `${kartu.terbuka ? "Tutup" : "Buka"} soal ${nomor}`;

  return (
    <article
      className={`${KARTU} ${hasil && !hasil.ok ? "border-danger-line" : ""}`}
      aria-labelledby={idJudul}
      onFocusCapture={onAktif}
    >
      <div className="flex items-start gap-1">
        {/* Seluruh kepala kartu bisa diketuk; untuk keyboard dipakai tombol panah di kanan. */}
        <div className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 py-1.5" onClick={onBukaTutup}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={idJudul} className="text-base font-medium text-black">
              Soal {nomor}
            </h3>
            <span className="text-xs text-muted">{LABEL_TIPE[form.tipe] ?? form.tipe}</span>
            {tersimpan ? <span className={CHIP}>{LABEL_STATUS[kartu.status] ?? kartu.status}</span> : null}
            <span className={["text-xs", WARNA_KEADAAN[keadaan]].join(" ")}>{LABEL_KEADAAN[keadaan]}</span>
          </div>
          {!kartu.terbuka ? (
            <p className="break-words text-sm text-muted">{form.redaksi.trim() ? cuplikRedaksi(form.redaksi, 120) : "(belum ada teks soal)"}</p>
          ) : null}
        </div>
        {onBuang ? (
          <button
            type="button"
            onClick={buang}
            aria-label={`Buang kartu soal ${nomor}`}
            title="Buang kartu (belum tersimpan)"
            className={tombolIkon(true)}
          >
            <IkonTongSampah />
          </button>
        ) : hapusDraf ? (
          <TombolHapusDraf
            objek="soal"
            id={kartu.id}
            versi={kartu.versi}
            label={`Hapus draf soal ${nomor}`}
            alasan={hapusDraf.alasan}
            onTerhapus={hapusDraf.onTerhapus}
          />
        ) : null}
        <button
          type="button"
          onClick={onBukaTutup}
          aria-expanded={kartu.terbuka}
          aria-controls={kartu.terbuka ? idIsi : undefined}
          aria-label={labelBukaTutup}
          title={labelBukaTutup}
          className={tombolIkon()}
        >
          <IkonChevron className={["size-5 transition-transform duration-150", kartu.terbuka ? "rotate-180" : ""].join(" ")} />
        </button>
      </div>

      {kartu.status === "ditolak" && kartu.alasanTolak ? (
        <p className="text-sm text-amber-900">
          <span className="font-medium">Catatan dari pengecek:</span> {kartu.alasanTolak}
        </p>
      ) : null}
      {hasil && !hasil.ok ? (
        <p role="alert" className="text-sm text-danger">
          {hasil.alasan}
        </p>
      ) : null}

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
          {/* Layar besar: pratinjau soal ini tampil di kolom kanan halaman (FormStimulus). */}
          <div className="flex flex-col gap-5">
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
            <aside className={["min-w-0 lg:hidden", tab === "pratinjau" ? "" : "hidden"].join(" ")}>
              <div className={KARTU}>
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-base font-medium text-black">Pratinjau soal {nomor}</h4>
                  <span className="text-xs text-muted">Tampilan seperti yang dilihat siswa</span>
                </div>
                <SoalPratinjau soal={form} stimulus={bacaanBlok} />
              </div>
            </aside>
          </div>

          {catatan || aksi.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:flex-wrap sm:items-center">
              {catatan ? <p className="text-xs text-muted sm:mr-auto">{catatan}</p> : null}
              {aksi.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {aksi.map((a) => (
                    <Button
                      key={a.jenis}
                      size="sm"
                      variant={a.utama ? "primary" : "secondary"}
                      onClick={() => onAksi?.(a.jenis)}
                      disabled={terkunci}
                    >
                      {a.sibuk ? a.labelSibuk : a.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <Modal open={yakinBuang} onClose={() => setYakinBuang(false)} labelledBy={idJudulBuang}>
        <div className="flex flex-col gap-4">
          <h2 id={idJudulBuang} className="pr-8 text-lg font-medium text-black">
            Buang kartu soal {nomor}?
          </h2>
          <p className="text-sm text-black">Isinya belum tersimpan dan akan hilang.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setYakinBuang(false)}>
              Batal
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setYakinBuang(false);
                onBuang?.();
              }}
            >
              Ya, buang
            </Button>
          </div>
        </div>
      </Modal>
    </article>
  );
}
