"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import SelectField from "@/components/ui/SelectField";
import { buttonClassName } from "@/components/ui/buttonClassName";
import StimulusPratinjau from "@/components/studio-soal/StimulusPratinjau";
import TombolHapusDraf from "@/components/studio-soal/TombolHapusDraf";
import { KARTU, CHIP, TOMBOL_KECIL, inputKecil, pesanKelas } from "@/components/studio-soal/gaya";
import TextareaKaya, { ContekanRumus, PesanError } from "@/components/studio-soal/TextareaKaya";
import { LABEL_STATUS, errorDi, isBolehEdit, panggilApi, petaError } from "@/components/studio-soal/klien";
import {
  BATAS,
  LABEL_TIPE,
  SUMBER_BUATAN_SENDIRI,
  blokTabelBaru,
  inputValidasiStimulus,
  type FormStimulus as DataFormStimulus,
} from "@/lib/shared/studio-soal/formSoal";
import { alasanTidakBisaHapus, tampilkanTombolHapus } from "@/lib/shared/studio-soal/hapusDraf";
import { validasiRumusStimulus } from "@/lib/shared/studio-soal/rumus";
import { cuplikRedaksi } from "@/lib/shared/studio-soal/studioMentor";
import type { BlokStimulus, BlokTabel, TipeSoal } from "@/lib/shared/studio-soal/tipe";
import { validasiStimulus, type ErrorValidasi } from "@/lib/shared/studio-soal/validasi";
import type { SubtesPilihan } from "@/components/studio-soal/FormSoal";

/**
 * Editor bacaan / teks pendukung (stimulus: teks + tabel) Studio Soal — PR 3b,
 * UX-1 (di layar disebut "bacaan"; nama tabel/route tetap stimulus). Stimulus dan soal-
 * soalnya diajukan & ditinjau sebagai SATU kelompok. Hanya penulis stimulus
 * yang boleh menambah soal ke dalamnya (K7, dijaga juga di database).
 * Atribusi sumber wajib saat diajukan (K4). Gambar menyusul (K6).
 */

export interface SoalDalamStimulus {
  id: string;
  tipe: string;
  status: string;
  urutan: number | null;
  redaksi: string;
}

interface ErrorSoalKelompok {
  soalId: string;
  urutan: number | null;
  errors: ErrorValidasi[];
}

const kartu = KARTU;
const inputKelas = inputKecil;
const tombolKecil = TOMBOL_KECIL;

type Sibuk = null | "simpan" | "ajukan" | "tarik" | "versi" | "hapus";

export default function FormStimulus({
  id,
  baru,
  awal,
  status: statusAwal,
  versi,
  alasanTolak,
  pernahDiajukan,
  subtesPilihan,
  ditugaskan,
  soal,
}: {
  id: string;
  baru: boolean;
  awal: DataFormStimulus;
  status: string;
  versi: number;
  alasanTolak: string | null;
  pernahDiajukan: boolean;
  subtesPilihan: SubtesPilihan[];
  ditugaskan: boolean;
  soal: SoalDalamStimulus[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<DataFormStimulus>(awal);
  const [status, setStatus] = useState(statusAwal);
  const [sudahDisimpan, setSudahDisimpan] = useState(!baru);
  const [jejakTersimpan, setJejakTersimpan] = useState<string | null>(baru ? null : JSON.stringify(awal));
  const [sibuk, setSibuk] = useState<Sibuk>(null);
  const sibukRef = useRef(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "gagal"; teks: string } | null>(null);
  const [errorServer, setErrorServer] = useState<ErrorValidasi[]>([]);
  const [errorSoal, setErrorSoal] = useState<ErrorSoalKelompok[]>([]);
  const [tampilSemua, setTampilSemua] = useState(false);
  const [tab, setTab] = useState<"tulis" | "pratinjau">("tulis");
  // Pernah diajukan di sesi ini -> tidak bisa dihapus lagi (DB juga menolak).
  const [sudahPernahDiajukan, setSudahPernahDiajukan] = useState(pernahDiajukan);

  const bolehEdit = isBolehEdit(status) && ditugaskan;
  const kategori = subtesPilihan.find((s) => s.id === form.subtes_id)?.kategori;
  const kotor = jejakTersimpan !== JSON.stringify(form);
  const blok = form.konten.blok;

  const errorsAjukan = useMemo(
    () => [...validasiStimulus(inputValidasiStimulus(form, kategori), "ajukan"), ...validasiRumusStimulus(form)],
    [form, kategori],
  );
  const errorsBentuk = errorsAjukan.filter((e) => e.jenis === "bentuk");
  const peta = petaError([...(tampilSemua ? errorsAjukan : errorsBentuk), ...errorServer]);

  useEffect(() => {
    if (!kotor || !bolehEdit) return;
    const cegah = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", cegah);
    return () => window.removeEventListener("beforeunload", cegah);
  }, [kotor, bolehEdit]);

  function ubah(patch: Partial<DataFormStimulus>) {
    setForm((f) => ({ ...f, ...patch }));
    setErrorServer([]);
  }
  function ubahBlok(fn: (b: BlokStimulus[]) => BlokStimulus[]) {
    setForm((f) => ({ ...f, konten: { v: 1, blok: fn(f.konten.blok) } }));
    setErrorServer([]);
  }
  const gantiBlok = (i: number, b: BlokStimulus) => ubahBlok((l) => l.map((x, j) => (j === i ? b : x)));
  const geser = (i: number, arah: -1 | 1) =>
    ubahBlok((l) => {
      const j = i + arah;
      if (j < 0 || j >= l.length) return l;
      const salin = [...l];
      [salin[i], salin[j]] = [salin[j], salin[i]];
      return salin;
    });

  async function simpan(): Promise<boolean> {
    if (sibukRef.current) return false;
    if (!form.subtes_id) {
      setPesan({ jenis: "gagal", teks: "Pilih subtes dulu sebelum menyimpan." });
      return false;
    }
    if (errorsBentuk.length > 0) {
      setPesan({ jenis: "gagal", teks: "Ada isian yang ditandai merah. Betulkan dulu, lalu simpan." });
      return false;
    }
    sibukRef.current = true;
    setSibuk("simpan");
    const jejak = JSON.stringify(form);
    const r = await panggilApi(`/api/studio-soal/stimulus/${id}`, "PUT", form);
    sibukRef.current = false;
    setSibuk(null);
    if (!r.ok) {
      setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Draf belum tersimpan. Coba lagi.") });
      setErrorServer(Array.isArray(r.json.errors) ? (r.json.errors as ErrorValidasi[]) : []);
      return false;
    }
    setJejakTersimpan(jejak);
    if (!sudahDisimpan) {
      setSudahDisimpan(true);
      window.history.replaceState(null, "", `/studio-soal/stimulus/${id}`);
    }
    setPesan({ jenis: "ok", teks: "Draf bacaan tersimpan." });
    return true;
  }

  async function jalankan(jenis: Exclude<Sibuk, null | "simpan">, url: string, method: "POST" | "DELETE") {
    sibukRef.current = true;
    setSibuk(jenis);
    const r = await panggilApi(url, method);
    sibukRef.current = false;
    setSibuk(null);
    return r;
  }

  async function ajukan() {
    if (sibukRef.current) return;
    setTampilSemua(true);
    setErrorSoal([]);
    if (errorsAjukan.length > 0) {
      setPesan({ jenis: "gagal", teks: `Masih ada ${errorsAjukan.length} hal di bacaan yang perlu dilengkapi (ditandai merah).` });
      return;
    }
    if (kotor || !sudahDisimpan) {
      if (!(await simpan())) return;
    }
    const r = await jalankan("ajukan", `/api/studio-soal/stimulus/${id}/ajukan`, "POST");
    if (!r.ok) {
      setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Bacaan belum terkirim. Coba lagi.") });
      setErrorServer(Array.isArray(r.json.errors) ? (r.json.errors as ErrorValidasi[]) : []);
      setErrorSoal(Array.isArray(r.json.errorsSoal) ? (r.json.errorsSoal as ErrorSoalKelompok[]) : []);
      return;
    }
    setStatus("diajukan");
    setSudahPernahDiajukan(true);
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Bacaan dan soalnya sudah dikirim untuk dicek.") });
    router.refresh();
  }

  async function tarik() {
    if (sibukRef.current) return;
    const r = await jalankan("tarik", `/api/studio-soal/stimulus/${id}/tarik`, "POST");
    if (!r.ok) return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Kiriman belum dibatalkan. Coba lagi.") });
    setStatus("draf");
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Kiriman dibatalkan.") });
    router.refresh();
  }

  async function versiBaru() {
    if (sibukRef.current) return;
    const r = await jalankan("versi", `/api/studio-soal/stimulus/${id}/versi-baru`, "POST");
    if (!r.ok) return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Versi baru belum dibuat. Coba lagi.") });
    router.push(`/studio-soal/stimulus/${String(r.json.id)}`);
  }

  const subtesNama = subtesPilihan.find((s) => s.id === form.subtes_id)?.nama;
  const bolehTambahSoal = sudahDisimpan && ditugaskan && (status === "draf" || status === "ditolak" || status === "terpublikasi");
  const soalDraf = soal.filter((s) => s.status === "draf" || s.status === "ditolak");

  return (
    <div className="flex flex-col gap-4 pb-24 sm:gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/studio-soal" className="w-fit text-sm text-primary hover:underline">
          ← Studio Soal
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-medium text-black sm:text-2xl">{baru && !sudahDisimpan ? "Buat bacaan baru" : "Bacaan / teks pendukung"}</h1>
          <span className={CHIP}>{LABEL_STATUS[status] ?? status}</span>
          {versi > 1 ? <span className="text-xs text-muted">versi {versi}</span> : null}
          {sudahDisimpan && bolehEdit ? (
            <span className={["text-xs", kotor ? "text-amber-700" : "text-muted"].join(" ")}>
              {kotor ? "Ada perubahan belum disimpan" : "Semua perubahan tersimpan"}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted">
          Bacaan atau tabel yang dipakai beberapa soal sekaligus. Bacaan dan soal-soalnya dikirim dan dicek bersama.
        </p>
      </div>

      {!ditugaskan ? (
        <Banner jenis="peringatan">
          Anda tidak lagi ditugaskan ke subtes ini. Bacaan tetap tersimpan, tapi tidak bisa diubah atau dikirim.
        </Banner>
      ) : null}
      {status === "ditolak" && alasanTolak ? (
        <Banner jenis="peringatan">
          <span className="font-medium">Catatan dari pengecek:</span> {alasanTolak}
        </Banner>
      ) : null}
      {status === "diajukan" ? (
        <Banner jenis="info">Bacaan dan soalnya sedang dicek, jadi isinya dikunci dulu. Tekan “Batalkan kirim” kalau mau mengubahnya.</Banner>
      ) : null}
      {status === "terpublikasi" ? (
        <Banner jenis="info">
          Bacaan sudah terbit. Anda masih bisa menambah soal baru ke dalamnya (dicek per soal). Untuk mengubah isi bacaannya, buat
          versi baru.
        </Banner>
      ) : null}

      {/* UX-2: ajakan menambah soal, selalu di atas supaya tidak perlu menggulir. */}
      {bolehTambahSoal ? (
        <div className="flex flex-col gap-3 rounded-[16px] border border-primary-line bg-primary-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-black">
            {soal.length === 0
              ? "Bacaan tersimpan. Langkah berikutnya: tambah soal yang merujuk ke bacaan ini."
              : `Bacaan ini dipakai ${soal.length} soal. Tambah lagi kalau perlu.`}
          </p>
          <Link
            href={`/studio-soal/soal/baru?stimulus=${id}`}
            className={buttonClassName({ size: "sm", className: "w-fit shrink-0" })}
          >
            + Tambah soal untuk bacaan ini
          </Link>
        </div>
      ) : !sudahDisimpan ? (
        <p className="text-sm text-muted">Simpan bacaan dulu, lalu tambahkan soal-soalnya.</p>
      ) : null}

      {pesan ? (
        <div
          role={pesan.jenis === "gagal" ? "alert" : "status"}
          className={pesanKelas(pesan.jenis)}
        >
          {pesan.teks}
        </div>
      ) : null}
      {errorSoal.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-[12px] bg-danger-soft px-4 py-2.5 text-sm text-danger">
          <p className="font-medium">Soal yang belum lengkap:</p>
          {errorSoal.map((e) => (
            <Link key={e.soalId} href={`/studio-soal/soal/${e.soalId}`} className="underline">
              Soal {e.urutan ?? "?"}: {e.errors.length} hal perlu diperbaiki
            </Link>
          ))}
        </div>
      ) : null}

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
            {t === "tulis" ? "Tulis" : "Pratinjau"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={["flex min-w-0 flex-col gap-4", tab === "tulis" ? "" : "hidden lg:flex"].join(" ")}>
          <section className={kartu}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="subtes" className="text-sm font-medium text-black">
                Subtes <span className="text-danger">*</span>
              </label>
              {sudahDisimpan ? (
                <p className="text-sm text-black">{subtesNama ?? "Subtes tidak dikenal"}</p>
              ) : (
                <SelectField
                  id="subtes"
                  size="md"
                  value={form.subtes_id}
                  onChange={(e) => ubah({ subtes_id: e.target.value })}
                  placeholder="Pilih subtes yang ditugaskan"
                  options={subtesPilihan.map((s) => ({ value: s.id, label: s.nama }))}
                />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="judul" className="text-sm font-medium text-black">
                Judul bacaan <span className="text-danger">*</span>
              </label>
              <InputField
                type="text"
                size="md"
                id="judul"
                value={form.judul_internal}
                disabled={!bolehEdit}
                status={errorDi(peta, "judul_internal") ? "error" : "default"}
                placeholder="mis. Perubahan iklim di pesisir"
                onChange={(e) => ubah({ judul_internal: e.target.value })}
              />
              <p className="text-xs text-muted">Cuma untuk mentor, tidak ditampilkan ke siswa.</p>
              <PesanError pesan={errorDi(peta, "judul_internal")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sumber" className="text-sm font-medium text-black">
                Sumber bacaan <span className="text-danger">*</span>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <InputField
                  type="text"
                  size="md"
                  id="sumber"
                  value={form.sumber_rujukan}
                  disabled={!bolehEdit}
                  status={errorDi(peta, "sumber_rujukan") ? "error" : "default"}
                  placeholder={`"${SUMBER_BUATAN_SENDIRI}" atau nama sumber (buku, situs, artikel)`}
                  onChange={(e) => ubah({ sumber_rujukan: e.target.value })}
                />
                {bolehEdit ? (
                  <button type="button" onClick={() => ubah({ sumber_rujukan: SUMBER_BUATAN_SENDIRI })} className={`${tombolKecil} shrink-0`}>
                    {SUMBER_BUATAN_SENDIRI}
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-muted">Wajib diisi sebelum dikirim. Kalau bacaan diambil atau diubah dari tulisan lain, sebutkan sumber aslinya.</p>
              <PesanError pesan={errorDi(peta, "sumber_rujukan")} />
            </div>
          </section>

          <section className={kartu}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-medium text-black">Isi bacaan</h2>
              <span className="text-xs text-muted">
                {blok.length}/{BATAS.stimulusBlokMaks} bagian
              </span>
            </div>
            <PesanError pesan={errorDi(peta, "konten.blok")} />
            {blok.map((b, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-[16px] border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-black">
                    {i + 1}. {b.jenis === "teks" ? "Teks" : "Tabel"}
                  </span>
                  {bolehEdit ? (
                    <div className="ml-auto flex gap-1.5">
                      <button type="button" aria-label="Geser ke atas" disabled={i === 0} onClick={() => geser(i, -1)} className={tombolKecil}>
                        ↑
                      </button>
                      <button type="button" aria-label="Geser ke bawah" disabled={i === blok.length - 1} onClick={() => geser(i, 1)} className={tombolKecil}>
                        ↓
                      </button>
                      <button type="button" onClick={() => ubahBlok((l) => l.filter((_, j) => j !== i))} className={`${tombolKecil} text-danger`}>
                        Hapus
                      </button>
                    </div>
                  ) : null}
                </div>
                {b.jenis === "teks" ? (
                  <TextareaKaya
                    id={`blok-${i}`}
                    label="Teks bacaan"
                    value={b.teks}
                    onChange={(v) => gantiBlok(i, { jenis: "teks", teks: v })}
                    maks={BATAS.stimulusTeksMaks}
                    rows={8}
                    disabled={!bolehEdit}
                    error={errorDi(peta, `konten.blok.${i}`, true)}
                  />
                ) : (
                  <EditorTabel
                    blok={b}
                    awalan={`konten.blok.${i}`}
                    peta={peta}
                    disabled={!bolehEdit}
                    onChange={(t) => gantiBlok(i, t)}
                  />
                )}
              </div>
            ))}
            {bolehEdit ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={blok.length >= BATAS.stimulusBlokMaks}
                  onClick={() => ubahBlok((l) => [...l, { jenis: "teks", teks: "" }])}
                  className={tombolKecil}
                >
                  + Blok teks
                </button>
                <button
                  type="button"
                  disabled={blok.length >= BATAS.stimulusBlokMaks}
                  onClick={() => ubahBlok((l) => [...l, blokTabelBaru()])}
                  className={tombolKecil}
                >
                  + Tabel
                </button>
              </div>
            ) : null}
            <ContekanRumus />
          </section>

          <section className={kartu}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-medium text-black">Soal yang memakai bacaan ini</h2>
              <span className="text-xs text-muted">{soal.length} soal</span>
            </div>
            {soal.length === 0 ? (
              <p className="text-sm text-muted">Belum ada soal. Tambahkan minimal 1 soal sebelum dikirim.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {soal.map((s) => (
                  <li key={s.id}>
                    <Link href={`/studio-soal/soal/${s.id}`} className="flex flex-col gap-0.5 py-2.5 hover:bg-surface sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span className="min-w-0 break-words text-sm text-black">
                        {s.urutan ?? "?"}. {cuplikRedaksi(s.redaksi, 90)}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {LABEL_TIPE[s.tipe as TipeSoal] ?? s.tipe} · {LABEL_STATUS[s.status] ?? s.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {bolehTambahSoal ? (
              <Link
                href={`/studio-soal/soal/baru?stimulus=${id}`}
                className={buttonClassName({ variant: "secondary", size: "sm", className: "w-fit" })}
              >
                + Tambah soal untuk bacaan ini
              </Link>
            ) : !sudahDisimpan ? (
              <p className="text-xs text-muted">Simpan bacaan dulu, baru bisa menambah soal.</p>
            ) : null}
          </section>

          {tampilSemua && errorsAjukan.length > 0 ? (
            <section className="flex flex-col gap-2 rounded-[20px] border border-danger-line bg-danger-soft p-4">
              <p className="text-sm font-medium text-danger">Yang perlu dilengkapi sebelum dikirim:</p>
              <ul className="list-disc pl-5 text-sm text-danger">
                {[...new Set(errorsAjukan.map((e) => e.pesan))].map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          ) : null}

        </div>

        <aside className={["min-w-0", tab === "pratinjau" ? "" : "hidden lg:block"].join(" ")}>
          <div className={`${kartu} lg:sticky lg:top-4`}>
            <h2 className="text-base font-medium text-black">Pratinjau</h2>
            <StimulusPratinjau blok={blok} />
            {form.sumber_rujukan.trim() ? <p className="text-xs text-muted">Sumber: {form.sumber_rujukan}</p> : null}
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-[16px] lg:border">
        {bolehEdit ? (
          <>
            <Button variant="secondary" size="sm" onClick={simpan} disabled={sibuk !== null}>
              {sibuk === "simpan" ? "Menyimpan…" : "Simpan draf"}
            </Button>
            <Button
              size="sm"
              onClick={ajukan}
              disabled={sibuk !== null || soalDraf.length === 0}
              title={soalDraf.length === 0 ? "Tambahkan minimal 1 soal dulu" : undefined}
            >
              {sibuk === "ajukan" ? "Mengirim…" : `Kirim bacaan + ${soalDraf.length} soal untuk dicek`}
            </Button>
          </>
        ) : null}
        {status === "diajukan" && ditugaskan ? (
          <Button variant="secondary" size="sm" onClick={tarik} disabled={sibuk !== null}>
            {sibuk === "tarik" ? "Membatalkan…" : "Batalkan kirim"}
          </Button>
        ) : null}
        {status === "terpublikasi" && ditugaskan ? (
          <Button size="sm" onClick={versiBaru} disabled={sibuk !== null}>
            {sibuk === "versi" ? "Membuat…" : "Buat versi baru bacaan"}
          </Button>
        ) : null}
        {sudahDisimpan && tampilkanTombolHapus(status) ? (
          <TombolHapusDraf
            objek="stimulus"
            id={id}
            versi={versi}
            className="ml-auto"
            sesudahHapus="/studio-soal"
            alasan={alasanTidakBisaHapus("stimulus", {
              status,
              pernahDiajukan: sudahPernahDiajukan,
              ditugaskan,
              jumlahSoal: soal.length,
            })}
          />
        ) : null}
      </div>
    </div>
  );
}

function EditorTabel({
  blok,
  awalan,
  peta,
  disabled,
  onChange,
}: {
  blok: BlokTabel;
  awalan: string;
  peta: Map<string, string[]>;
  disabled: boolean;
  onChange: (b: BlokTabel) => void;
}) {
  const kolom = blok.kepala.length;
  const sel = "min-w-[8rem] rounded-[8px] border bg-white px-2 py-1.5 text-sm outline-none focus:border-black disabled:bg-surface-muted";
  const kelasSel = (f: string) => `${sel} ${peta.get(f) ? "border-danger" : "border-subtle"}`;
  return (
    <div className="flex flex-col gap-2">
      <input
        value={blok.judul ?? ""}
        disabled={disabled}
        aria-label="Judul tabel"
        placeholder="Judul tabel (opsional), mis. Tabel 1 Produksi padi"
        onChange={(e) => onChange({ ...blok, judul: e.target.value })}
        className={inputKelas(errorDi(peta, `${awalan}.judul`))}
      />
      <div className="max-w-full overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              {blok.kepala.map((k, c) => (
                <th key={c} className="p-0">
                  <input
                    value={k}
                    disabled={disabled}
                    aria-label={`Judul kolom ${c + 1}`}
                    placeholder={`Kolom ${c + 1}`}
                    onChange={(e) => onChange({ ...blok, kepala: blok.kepala.map((x, j) => (j === c ? e.target.value : x)) })}
                    className={`${kelasSel(`${awalan}.kepala.${c}`)} font-medium`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {blok.baris.map((row, r) => (
              <tr key={r}>
                {row.map((isi, c) => (
                  <td key={c} className="p-0">
                    <input
                      value={isi}
                      disabled={disabled}
                      aria-label={`Baris ${r + 1} kolom ${c + 1}`}
                      onChange={(e) =>
                        onChange({
                          ...blok,
                          baris: blok.baris.map((x, i) => (i === r ? x.map((y, j) => (j === c ? e.target.value : y)) : x)),
                        })
                      }
                      className={kelasSel(`${awalan}.baris.${r}.${c}`)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled ? (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={kolom >= BATAS.tabelKolomMaks}
            onClick={() => onChange({ ...blok, kepala: [...blok.kepala, ""], baris: blok.baris.map((x) => [...x, ""]) })}
            className={tombolKecil}
          >
            + Kolom
          </button>
          <button
            type="button"
            disabled={kolom <= 1}
            onClick={() => onChange({ ...blok, kepala: blok.kepala.slice(0, -1), baris: blok.baris.map((x) => x.slice(0, -1)) })}
            className={tombolKecil}
          >
            − Kolom
          </button>
          <button
            type="button"
            disabled={blok.baris.length >= BATAS.tabelBarisMaks}
            onClick={() => onChange({ ...blok, baris: [...blok.baris, Array.from({ length: kolom }, () => "")] })}
            className={tombolKecil}
          >
            + Baris
          </button>
          <button
            type="button"
            disabled={blok.baris.length <= 1}
            onClick={() => onChange({ ...blok, baris: blok.baris.slice(0, -1) })}
            className={tombolKecil}
          >
            − Baris
          </button>
          <span className="self-center text-xs text-muted">
            {kolom}/{BATAS.tabelKolomMaks} kolom · {blok.baris.length}/{BATAS.tabelBarisMaks} baris · sel boleh berisi rumus
          </span>
        </div>
      ) : null}
      <PesanError pesan={errorDi(peta, awalan, true)} />
    </div>
  );
}

function Banner({ jenis, children }: { jenis: "info" | "peringatan"; children: ReactNode }) {
  return (
    <div
      className={[
        "rounded-[12px] border px-4 py-3 text-sm",
        jenis === "info" ? "border-primary-line bg-primary-soft text-black" : "border-amber-200 bg-amber-50 text-amber-900",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
