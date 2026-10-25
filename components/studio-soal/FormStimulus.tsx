"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import StimulusPratinjau from "@/components/studio-soal/StimulusPratinjau";
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
import { validasiRumusStimulus } from "@/lib/shared/studio-soal/rumus";
import { cuplikRedaksi } from "@/lib/shared/studio-soal/studioMentor";
import type { BlokStimulus, BlokTabel, TipeSoal } from "@/lib/shared/studio-soal/tipe";
import { validasiStimulus, type ErrorValidasi } from "@/lib/shared/studio-soal/validasi";
import type { SubtesPilihan } from "@/components/studio-soal/FormSoal";

/**
 * Editor stimulus (bacaan + tabel) Studio Soal — PR 3b. Stimulus dan soal-
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

const kartu = "flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-4 sm:p-5";
const inputKelas = (error?: string[]) =>
  [
    "w-full rounded-[12px] border bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-black disabled:bg-[#F6F6F6] disabled:text-[#7E7C7C]",
    error ? "border-[#E70A0A]" : "border-[#AFAFAF]",
  ].join(" ");
const tombolKecil =
  "rounded-[8px] border border-[#CAC9C9] bg-white px-2.5 py-1 text-xs font-medium text-black hover:border-[#081EEA] disabled:cursor-not-allowed disabled:opacity-50";

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
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);
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
      setPesan({ jenis: "gagal", teks: "Pilih subtes dulu." });
      return false;
    }
    if (errorsBentuk.length > 0) {
      setPesan({ jenis: "gagal", teks: "Perbaiki isian yang ditandai merah sebelum menyimpan." });
      return false;
    }
    sibukRef.current = true;
    setSibuk("simpan");
    const jejak = JSON.stringify(form);
    const r = await panggilApi(`/api/studio-soal/stimulus/${id}`, "PUT", form);
    sibukRef.current = false;
    setSibuk(null);
    if (!r.ok) {
      setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Gagal menyimpan draf.") });
      setErrorServer(Array.isArray(r.json.errors) ? (r.json.errors as ErrorValidasi[]) : []);
      return false;
    }
    setJejakTersimpan(jejak);
    if (!sudahDisimpan) {
      setSudahDisimpan(true);
      window.history.replaceState(null, "", `/studio-soal/stimulus/${id}`);
    }
    setPesan({ jenis: "ok", teks: "Draf stimulus tersimpan." });
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
      setPesan({ jenis: "gagal", teks: `Masih ada ${errorsAjukan.length} hal di stimulus yang perlu dilengkapi (ditandai merah).` });
      return;
    }
    if (kotor || !sudahDisimpan) {
      if (!(await simpan())) return;
    }
    const r = await jalankan("ajukan", `/api/studio-soal/stimulus/${id}/ajukan`, "POST");
    if (!r.ok) {
      setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Gagal mengajukan stimulus.") });
      setErrorServer(Array.isArray(r.json.errors) ? (r.json.errors as ErrorValidasi[]) : []);
      setErrorSoal(Array.isArray(r.json.errorsSoal) ? (r.json.errorsSoal as ErrorSoalKelompok[]) : []);
      return;
    }
    setStatus("diajukan");
    setSudahPernahDiajukan(true);
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Stimulus diajukan.") });
    router.refresh();
  }

  async function tarik() {
    if (sibukRef.current) return;
    const r = await jalankan("tarik", `/api/studio-soal/stimulus/${id}/tarik`, "POST");
    if (!r.ok) return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Gagal menarik pengajuan.") });
    setStatus("draf");
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Pengajuan ditarik.") });
    router.refresh();
  }

  async function versiBaru() {
    if (sibukRef.current) return;
    const r = await jalankan("versi", `/api/studio-soal/stimulus/${id}/versi-baru`, "POST");
    if (!r.ok) return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Gagal membuat versi baru.") });
    router.push(`/studio-soal/stimulus/${String(r.json.id)}`);
  }

  async function hapus() {
    if (sibukRef.current) return;
    const r = await jalankan("hapus", `/api/studio-soal/stimulus/${id}`, "DELETE");
    setKonfirmasiHapus(false);
    if (!r.ok) return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Gagal menghapus draf.") });
    router.push("/studio-soal");
    router.refresh();
  }

  const subtesNama = subtesPilihan.find((s) => s.id === form.subtes_id)?.nama;
  const bolehTambahSoal = sudahDisimpan && ditugaskan && (status === "draf" || status === "ditolak" || status === "terpublikasi");
  const soalDraf = soal.filter((s) => s.status === "draf" || s.status === "ditolak");

  return (
    <div className="flex flex-col gap-4 pb-24 sm:gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/studio-soal" className="w-fit text-sm text-[#081EEA] hover:underline">
          ← Studio Soal
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-medium text-black sm:text-2xl">{baru && !sudahDisimpan ? "Buat stimulus baru" : "Stimulus"}</h1>
          <span className="rounded-full bg-[#F1F1F1] px-2.5 py-0.5 text-xs font-medium text-black">{LABEL_STATUS[status] ?? status}</span>
          {versi > 1 ? <span className="text-xs text-[#7E7C7C]">versi {versi}</span> : null}
          {sudahDisimpan && bolehEdit ? (
            <span className={["text-xs", kotor ? "text-amber-700" : "text-[#7E7C7C]"].join(" ")}>
              {kotor ? "Ada perubahan belum disimpan" : "Semua perubahan tersimpan"}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-[#7E7C7C]">
          Stimulus adalah bacaan atau tabel yang dipakai beberapa soal. Stimulus dan soal-soalnya diajukan dan ditinjau bersama.
        </p>
      </div>

      {!ditugaskan ? (
        <Banner jenis="peringatan">
          Anda tidak lagi ditugaskan ke subtes ini. Stimulus tetap tersimpan, tetapi tidak bisa diubah atau diajukan.
        </Banner>
      ) : null}
      {status === "ditolak" && alasanTolak ? (
        <Banner jenis="peringatan">
          <span className="font-medium">Ditolak peninjau:</span> {alasanTolak}
        </Banner>
      ) : null}
      {status === "diajukan" ? (
        <Banner jenis="info">Stimulus dan soalnya sedang ditinjau, jadi isinya terkunci. Tarik pengajuan bila perlu mengubahnya.</Banner>
      ) : null}
      {status === "terpublikasi" ? (
        <Banner jenis="info">
          Stimulus sudah terbit. Anda masih bisa menambah soal baru ke dalamnya (ditinjau per soal). Untuk mengubah bacaannya, buat
          versi baru.
        </Banner>
      ) : null}

      {pesan ? (
        <div
          role={pesan.jenis === "gagal" ? "alert" : "status"}
          className={["rounded-[12px] px-4 py-2.5 text-sm", pesan.jenis === "ok" ? "bg-[#F2FAF4] text-[#0A7D2C]" : "bg-[#FDEEEE] text-[#E70A0A]"].join(" ")}
        >
          {pesan.teks}
        </div>
      ) : null}
      {errorSoal.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-[12px] bg-[#FDEEEE] px-4 py-2.5 text-sm text-[#E70A0A]">
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
              tab === t ? "border-black bg-black text-white" : "border-[#CAC9C9] bg-white text-black",
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
                Subtes <span className="text-[#E70A0A]">*</span>
              </label>
              {sudahDisimpan ? (
                <p className="text-sm text-black">{subtesNama ?? "Subtes tidak dikenal"}</p>
              ) : (
                <select id="subtes" value={form.subtes_id} onChange={(e) => ubah({ subtes_id: e.target.value })} className={inputKelas()}>
                  <option value="">Pilih subtes yang ditugaskan</option>
                  {subtesPilihan.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nama}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="judul" className="text-sm font-medium text-black">
                Judul internal <span className="text-[#E70A0A]">*</span>
              </label>
              <input
                id="judul"
                value={form.judul_internal}
                disabled={!bolehEdit}
                placeholder="mis. Bacaan: Perubahan iklim di pesisir"
                onChange={(e) => ubah({ judul_internal: e.target.value })}
                className={inputKelas(errorDi(peta, "judul_internal"))}
              />
              <p className="text-xs text-[#7E7C7C]">Hanya terlihat oleh mentor, tidak ditampilkan ke siswa.</p>
              <PesanError pesan={errorDi(peta, "judul_internal")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sumber" className="text-sm font-medium text-black">
                Sumber rujukan <span className="text-[#E70A0A]">*</span>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="sumber"
                  value={form.sumber_rujukan}
                  disabled={!bolehEdit}
                  placeholder={`"${SUMBER_BUATAN_SENDIRI}" atau nama sumber (buku, situs, artikel)`}
                  onChange={(e) => ubah({ sumber_rujukan: e.target.value })}
                  className={inputKelas(errorDi(peta, "sumber_rujukan"))}
                />
                {bolehEdit ? (
                  <button type="button" onClick={() => ubah({ sumber_rujukan: SUMBER_BUATAN_SENDIRI })} className={`${tombolKecil} shrink-0`}>
                    {SUMBER_BUATAN_SENDIRI}
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-[#7E7C7C]">Wajib diisi sebelum diajukan. Bacaan hasil adaptasi tetap sebutkan sumber aslinya.</p>
              <PesanError pesan={errorDi(peta, "sumber_rujukan")} />
            </div>
          </section>

          <section className={kartu}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-medium text-black">Isi stimulus</h2>
              <span className="text-xs text-[#7E7C7C]">
                {blok.length}/{BATAS.stimulusBlokMaks} blok
              </span>
            </div>
            <PesanError pesan={errorDi(peta, "konten.blok")} />
            {blok.map((b, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-[16px] border border-[#E3E3E3] p-3">
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
                      <button type="button" onClick={() => ubahBlok((l) => l.filter((_, j) => j !== i))} className={`${tombolKecil} text-[#E70A0A]`}>
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
              <h2 className="text-base font-medium text-black">Soal dalam stimulus ini</h2>
              <span className="text-xs text-[#7E7C7C]">{soal.length} soal</span>
            </div>
            {soal.length === 0 ? (
              <p className="text-sm text-[#7E7C7C]">Belum ada soal. Stimulus minimal punya 1 soal saat diajukan.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[#E3E3E3]">
                {soal.map((s) => (
                  <li key={s.id}>
                    <Link href={`/studio-soal/soal/${s.id}`} className="flex flex-col gap-0.5 py-2.5 hover:bg-[#FAFAFA] sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span className="min-w-0 break-words text-sm text-black">
                        {s.urutan ?? "?"}. {cuplikRedaksi(s.redaksi, 90)}
                      </span>
                      <span className="shrink-0 text-xs text-[#7E7C7C]">
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
                className="w-fit rounded-full border border-black px-4 py-1.5 text-sm font-medium text-black hover:bg-black hover:text-white"
              >
                + Tambah soal ke stimulus
              </Link>
            ) : !sudahDisimpan ? (
              <p className="text-xs text-[#7E7C7C]">Simpan stimulus dulu untuk menambah soal.</p>
            ) : null}
          </section>

          {tampilSemua && errorsAjukan.length > 0 ? (
            <section className="flex flex-col gap-2 rounded-[20px] border border-[#F5C2C2] bg-[#FDEEEE] p-4">
              <p className="text-sm font-medium text-[#E70A0A]">Yang perlu dilengkapi sebelum diajukan:</p>
              <ul className="list-disc pl-5 text-sm text-[#E70A0A]">
                {[...new Set(errorsAjukan.map((e) => e.pesan))].map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {bolehEdit && !sudahPernahDiajukan && sudahDisimpan && status === "draf" && soal.length === 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {konfirmasiHapus ? (
                <>
                  <span className="text-sm text-black">Hapus stimulus ini? Tidak bisa dibatalkan.</span>
                  <button type="button" onClick={hapus} disabled={sibuk !== null} className="rounded-full bg-[#E70A0A] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                    {sibuk === "hapus" ? "Menghapus…" : "Ya, hapus"}
                  </button>
                  <button type="button" onClick={() => setKonfirmasiHapus(false)} className="rounded-full border border-[#CAC9C9] px-4 py-1.5 text-sm">
                    Batal
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setKonfirmasiHapus(true)} className="text-sm text-[#E70A0A] hover:underline">
                  Hapus draf stimulus
                </button>
              )}
            </div>
          ) : null}
        </div>

        <aside className={["min-w-0", tab === "pratinjau" ? "" : "hidden lg:block"].join(" ")}>
          <div className={`${kartu} lg:sticky lg:top-4`}>
            <h2 className="text-base font-medium text-black">Pratinjau</h2>
            <StimulusPratinjau blok={blok} />
            {form.sumber_rujukan.trim() ? <p className="text-xs text-[#7E7C7C]">Sumber: {form.sumber_rujukan}</p> : null}
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-[#E3E3E3] bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-[16px] lg:border">
        {bolehEdit ? (
          <>
            <button
              type="button"
              onClick={simpan}
              disabled={sibuk !== null}
              className="rounded-full border border-black bg-white px-5 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sibuk === "simpan" ? "Menyimpan…" : "Simpan draf"}
            </button>
            <button
              type="button"
              onClick={ajukan}
              disabled={sibuk !== null || soalDraf.length === 0}
              title={soalDraf.length === 0 ? "Tambahkan minimal 1 soal dulu" : undefined}
              className="rounded-full bg-[#081EEA] px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sibuk === "ajukan" ? "Mengajukan…" : `Ajukan stimulus + ${soalDraf.length} soal`}
            </button>
          </>
        ) : null}
        {status === "diajukan" && ditugaskan ? (
          <button type="button" onClick={tarik} disabled={sibuk !== null} className="rounded-full border border-black bg-white px-5 py-2 text-sm font-medium text-black disabled:opacity-50">
            {sibuk === "tarik" ? "Menarik…" : "Tarik pengajuan"}
          </button>
        ) : null}
        {status === "terpublikasi" && ditugaskan ? (
          <button type="button" onClick={versiBaru} disabled={sibuk !== null} className="rounded-full bg-[#081EEA] px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
            {sibuk === "versi" ? "Membuat…" : "Buat versi baru stimulus"}
          </button>
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
  const sel = "min-w-[8rem] rounded-[8px] border bg-white px-2 py-1.5 text-sm outline-none focus:border-black disabled:bg-[#F6F6F6]";
  const kelasSel = (f: string) => `${sel} ${peta.get(f) ? "border-[#E70A0A]" : "border-[#AFAFAF]"}`;
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
          <span className="self-center text-xs text-[#7E7C7C]">
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
        jenis === "info" ? "border-[#D6DBFD] bg-[#EEF0FE] text-black" : "border-amber-200 bg-amber-50 text-amber-900",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
