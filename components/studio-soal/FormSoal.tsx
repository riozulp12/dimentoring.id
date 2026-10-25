"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import SoalPratinjau from "@/components/studio-soal/SoalPratinjau";
import TextareaKaya, { ContekanRumus, PesanError } from "@/components/studio-soal/TextareaKaya";
import { LABEL_STATUS, errorDi, isBolehEdit, panggilApi, petaError } from "@/components/studio-soal/klien";
import {
  BATAS,
  KETERANGAN_TIPE,
  LABEL_KESULITAN,
  LABEL_TIPE,
  PILIHAN_KESULITAN,
  PRESET_LABEL_KOLOM,
  hapusRumpang,
  idBagianBaru,
  inputValidasiSoal,
  kontenAwal,
  penandaDiRedaksi,
  sisipRumpang,
  type FormSoal as DataFormSoal,
} from "@/lib/shared/studio-soal/formSoal";
import { parseAngka } from "@/lib/shared/studio-soal/angka";
import { validasiRumusSoal } from "@/lib/shared/studio-soal/rumus";
import { LABEL_OPSI, TIPE_SOAL, type BlokStimulus, type TipeSoal } from "@/lib/shared/studio-soal/tipe";
import { validasiSoal, type ErrorValidasi } from "@/lib/shared/studio-soal/validasi";

/**
 * Builder soal Studio Soal (Mentor) — PR 3b. Satu komponen untuk soal baru &
 * edit. Validasi memakai modul yang sama dengan API (validasiSoal +
 * validasiRumusSoal); server tetap memeriksa ulang. Simpan dobel aman: id soal
 * sudah ditentukan sebelum simpan pertama (PUT idempoten) dan tombol dikunci
 * selama permintaan berjalan.
 */

type Obj = Record<string, unknown>;
const objek = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const daftar = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export interface SubtesPilihan {
  id: string;
  nama: string;
  kategori: string;
}

export interface StimulusKonteks {
  id: string;
  judul: string;
  status: string;
  blok: BlokStimulus[];
}

const LABEL_LEVEL: Record<number, string> = {
  1: "L1 — Pengetahuan & pemahaman",
  2: "L2 — Aplikasi",
  3: "L3 — Penalaran",
};

const kartu = "flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-4 sm:p-5";
const inputKelas = (error?: string[]) =>
  [
    "w-full rounded-[12px] border bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-black disabled:bg-[#F6F6F6] disabled:text-[#7E7C7C]",
    error ? "border-[#E70A0A]" : "border-[#AFAFAF]",
  ].join(" ");
const tombolKecil =
  "rounded-[8px] border border-[#CAC9C9] bg-white px-2.5 py-1 text-xs font-medium text-black hover:border-[#081EEA] disabled:cursor-not-allowed disabled:opacity-50";

type Sibuk = null | "simpan" | "ajukan" | "tarik" | "versi" | "hapus";

export default function FormSoal({
  id,
  baru,
  awal,
  status: statusAwal,
  versi,
  alasanTolak,
  pernahDiajukan,
  subtesPilihan,
  stimulus,
  ditugaskan,
}: {
  id: string;
  baru: boolean;
  awal: DataFormSoal;
  status: string;
  versi: number;
  alasanTolak: string | null;
  pernahDiajukan: boolean;
  subtesPilihan: SubtesPilihan[];
  stimulus: StimulusKonteks | null;
  ditugaskan: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<DataFormSoal>(awal);
  const [status, setStatus] = useState(statusAwal);
  const [sudahDisimpan, setSudahDisimpan] = useState(!baru);
  const [jejakTersimpan, setJejakTersimpan] = useState<string | null>(baru ? null : JSON.stringify(awal));
  const [sibuk, setSibuk] = useState<Sibuk>(null);
  const sibukRef = useRef(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "gagal"; teks: string; tautan?: string } | null>(null);
  const [errorServer, setErrorServer] = useState<ErrorValidasi[]>([]);
  const [tampilSemua, setTampilSemua] = useState(false);
  const [tab, setTab] = useState<"tulis" | "pratinjau">("tulis");
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);
  // Pernah diajukan di sesi ini -> tidak bisa dihapus lagi (DB juga menolak).
  const [sudahPernahDiajukan, setSudahPernahDiajukan] = useState(pernahDiajukan);
  const redaksiRef = useRef<HTMLTextAreaElement | null>(null);

  const bolehEdit = isBolehEdit(status) && ditugaskan;
  const kategori = subtesPilihan.find((s) => s.id === form.subtes_id)?.kategori;
  const kotor = jejakTersimpan !== JSON.stringify(form);

  const errorsAjukan = useMemo(
    () => [...validasiSoal(inputValidasiSoal(form, kategori), "ajukan"), ...validasiRumusSoal(form)],
    [form, kategori],
  );
  const errorsBentuk = errorsAjukan.filter((e) => e.jenis === "bentuk");
  const peta = petaError([...(tampilSemua ? errorsAjukan : errorsBentuk), ...errorServer]);
  const jumlahBelumLengkap = errorsAjukan.length;

  useEffect(() => {
    if (!kotor || !bolehEdit) return;
    const cegah = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", cegah);
    return () => window.removeEventListener("beforeunload", cegah);
  }, [kotor, bolehEdit]);

  function ubah(patch: Partial<DataFormSoal>) {
    setForm((f) => ({ ...f, ...patch }));
    setErrorServer([]);
  }
  const ubahKonten = (patch: Obj) => setForm((f) => ({ ...f, konten: { ...f.konten, ...patch } }));
  const ubahKunci = (patch: Obj) => setForm((f) => ({ ...f, kunci: { ...f.kunci, ...patch } }));

  function gantiTipe(tipe: TipeSoal) {
    if (sudahDisimpan || tipe === form.tipe) return;
    setForm((f) => ({ ...f, tipe, ...kontenAwal(tipe) }));
  }

  // ---------------------------------------------------------------- aksi
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
    const r = await panggilApi(`/api/studio-soal/soal/${id}`, "PUT", form);
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
      window.history.replaceState(null, "", `/studio-soal/soal/${id}`);
    }
    setPesan({ jenis: "ok", teks: "Draf tersimpan." });
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
    if (errorsAjukan.length > 0) {
      setPesan({ jenis: "gagal", teks: `Masih ada ${errorsAjukan.length} hal yang perlu dilengkapi sebelum diajukan (ditandai merah).` });
      return;
    }
    if (kotor || !sudahDisimpan) {
      if (!(await simpan())) return;
    }
    const r = await jalankan("ajukan", `/api/studio-soal/soal/${id}/ajukan`, "POST");
    if (!r.ok) {
      setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Gagal mengajukan soal.") });
      setErrorServer(Array.isArray(r.json.errors) ? (r.json.errors as ErrorValidasi[]) : []);
      return;
    }
    setStatus("diajukan");
    setSudahPernahDiajukan(true);
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Soal diajukan untuk ditinjau.") });
  }

  async function tarik() {
    if (sibukRef.current) return;
    const r = await jalankan("tarik", `/api/studio-soal/soal/${id}/tarik`, "POST");
    if (!r.ok) return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Gagal menarik pengajuan.") });
    setStatus("draf");
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Pengajuan ditarik.") });
  }

  async function versiBaru() {
    if (sibukRef.current) return;
    const r = await jalankan("versi", `/api/studio-soal/soal/${id}/versi-baru`, "POST");
    if (!r.ok) {
      const terbuka = typeof r.json.idTerbuka === "string" ? `/studio-soal/soal/${r.json.idTerbuka}` : undefined;
      return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Gagal membuat versi baru."), tautan: terbuka });
    }
    router.push(`/studio-soal/soal/${String(r.json.id)}`);
  }

  async function hapus() {
    if (sibukRef.current) return;
    const r = await jalankan("hapus", `/api/studio-soal/soal/${id}`, "DELETE");
    setKonfirmasiHapus(false);
    if (!r.ok) return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Gagal menghapus draf.") });
    router.push(stimulus ? `/studio-soal/stimulus/${stimulus.id}` : "/studio-soal");
    router.refresh();
  }

  // ---------------------------------------------------------------- bagian per tipe
  const opsi = daftar<{ label: string; teks: string }>(form.konten.opsi);
  const labelKolom = daftar<string>(form.konten.label_kolom);
  const pernyataan = daftar<{ id: string; teks: string }>(form.konten.pernyataan);
  const perBaris = objek(form.kunci.per_baris);
  const rumpang = daftar<{ id: string; jenis: string }>(form.konten.rumpang);
  const kunciRumpang = objek(form.kunci.rumpang);
  const penanda = penandaDiRedaksi(form.redaksi);
  const presetCocok = PRESET_LABEL_KOLOM.findIndex(([a, b]) => labelKolom[0] === a && labelKolom[1] === b);
  const [labelSendiri, setLabelSendiri] = useState(presetCocok === -1 && form.tipe === "majemuk_kompleks");

  function sisipkanRumpang() {
    const el = redaksiRef.current;
    const posisi = el?.selectionStart ?? form.redaksi.length;
    const hasil = sisipRumpang(form, posisi);
    setForm(hasil.form);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(hasil.kursor, hasil.kursor);
    });
  }

  function ubahKunciRumpang(rid: string, patch: Obj) {
    const lama = objek(kunciRumpang[rid]);
    const baruK: Obj = { ...lama, ...patch };
    if (baruK.toleransi === "" || baruK.toleransi === undefined) delete baruK.toleransi;
    ubahKunci({ rumpang: { ...kunciRumpang, [rid]: baruK } });
  }

  const subtesNama = subtesPilihan.find((s) => s.id === form.subtes_id)?.nama;
  const judul = baru && !sudahDisimpan ? "Tulis soal baru" : "Soal";
  const bisaAjukanSendiri = !stimulus || stimulus.status === "terpublikasi";

  return (
    <div className="flex flex-col gap-4 pb-24 sm:gap-5">
      <div className="flex flex-col gap-2">
        <Link href={stimulus ? `/studio-soal/stimulus/${stimulus.id}` : "/studio-soal"} className="w-fit text-sm text-[#081EEA] hover:underline">
          ← {stimulus ? `Stimulus: ${stimulus.judul || "tanpa judul"}` : "Studio Soal"}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-medium text-black sm:text-2xl">{judul}</h1>
          <span className="rounded-full bg-[#F1F1F1] px-2.5 py-0.5 text-xs font-medium text-black">
            {LABEL_STATUS[status] ?? status}
          </span>
          {versi > 1 ? <span className="text-xs text-[#7E7C7C]">versi {versi}</span> : null}
          {sudahDisimpan && bolehEdit ? (
            <span className={["text-xs", kotor ? "text-amber-700" : "text-[#7E7C7C]"].join(" ")}>
              {kotor ? "Ada perubahan belum disimpan" : "Semua perubahan tersimpan"}
            </span>
          ) : null}
        </div>
      </div>

      {!ditugaskan ? (
        <Banner jenis="peringatan">
          Anda tidak lagi ditugaskan ke subtes ini. Soal tetap tersimpan, tetapi tidak bisa diubah atau diajukan sampai Admin
          menugaskan Anda lagi.
        </Banner>
      ) : null}
      {status === "ditolak" && alasanTolak ? (
        <Banner jenis="peringatan">
          <span className="font-medium">Ditolak peninjau:</span> {alasanTolak}
          <br />
          Perbaiki soal lalu ajukan lagi.
        </Banner>
      ) : null}
      {status === "diajukan" ? (
        <Banner jenis="info">
          Soal sedang menunggu tinjauan mentor lain, jadi isinya terkunci.{" "}
          {stimulus && stimulus.status === "diajukan"
            ? "Soal ini diajukan bersama stimulusnya — tarik dari halaman stimulus bila perlu mengubahnya."
            : "Tarik pengajuan bila perlu mengubahnya."}
        </Banner>
      ) : null}
      {status === "terpublikasi" ? (
        <Banner jenis="info">
          Soal sudah terbit dan isinya terkunci. Untuk mengubah, buat versi baru — versi ini tetap dipakai sampai versi baru lolos
          tinjauan.
        </Banner>
      ) : null}
      {status === "digantikan" || status === "diarsipkan" ? (
        <Banner jenis="info">Soal ini {LABEL_STATUS[status]?.toLowerCase()} dan hanya bisa dilihat.</Banner>
      ) : null}

      {pesan ? (
        <div
          role={pesan.jenis === "gagal" ? "alert" : "status"}
          className={[
            "rounded-[12px] px-4 py-2.5 text-sm",
            pesan.jenis === "ok" ? "bg-[#F2FAF4] text-[#0A7D2C]" : "bg-[#FDEEEE] text-[#E70A0A]",
          ].join(" ")}
        >
          {pesan.teks}
          {pesan.tautan ? (
            <>
              {" "}
              <Link href={pesan.tautan} className="font-medium underline">
                Buka versi itu
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Tab untuk layar kecil; di layar lebar form & pratinjau berdampingan. */}
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
            {t === "tulis" ? "Tulis" : "Pratinjau & uji kunci"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={["flex min-w-0 flex-col gap-4", tab === "tulis" ? "" : "hidden lg:flex"].join(" ")}>
          {/* ---- Identitas ---- */}
          <section className={kartu}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="subtes" className="text-sm font-medium text-black">
                Subtes <span className="text-[#E70A0A]">*</span>
              </label>
              {sudahDisimpan || stimulus ? (
                <p className="text-sm text-black">{subtesNama ?? "Subtes tidak dikenal"}</p>
              ) : (
                <select
                  id="subtes"
                  value={form.subtes_id}
                  onChange={(e) => ubah({ subtes_id: e.target.value })}
                  className={inputKelas(errorDi(peta, "subtes_id"))}
                >
                  <option value="">Pilih subtes yang ditugaskan</option>
                  {subtesPilihan.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nama}
                    </option>
                  ))}
                </select>
              )}
              <PesanError pesan={errorDi(peta, "subtes_id")} />
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium text-black">
                Tipe soal <span className="text-[#E70A0A]">*</span>
              </legend>
              {sudahDisimpan ? (
                <p className="text-sm text-black">{LABEL_TIPE[form.tipe]}</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {TIPE_SOAL.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={form.tipe === t}
                      onClick={() => gantiTipe(t)}
                      className={[
                        "flex flex-col items-start gap-0.5 rounded-[12px] border px-3 py-2 text-left text-sm transition-colors",
                        form.tipe === t ? "border-[#081EEA] bg-[#081EEA] text-white" : "border-[#CAC9C9] bg-white text-black hover:border-[#081EEA]",
                      ].join(" ")}
                    >
                      <span className="font-medium">{LABEL_TIPE[t]}</span>
                      <span className={["text-xs", form.tipe === t ? "text-white/80" : "text-[#7E7C7C]"].join(" ")}>
                        {KETERANGAN_TIPE[t]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!sudahDisimpan ? (
                <p className="text-xs text-[#7E7C7C]">Subtes dan tipe tidak bisa diganti setelah draf pertama disimpan.</p>
              ) : null}
            </fieldset>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium text-black">
                Tingkat kesulitan <span className="text-[#E70A0A]">*</span>
              </legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tingkat kesulitan">
                {PILIHAN_KESULITAN.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={form.tingkat_kesulitan === k}
                    disabled={!bolehEdit}
                    onClick={() => ubah({ tingkat_kesulitan: k })}
                    className={[
                      "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
                      form.tingkat_kesulitan === k ? "border-[#081EEA] bg-[#081EEA] text-white" : "border-[#CAC9C9] bg-white text-black",
                    ].join(" ")}
                  >
                    {LABEL_KESULITAN[k]}
                  </button>
                ))}
              </div>
              <PesanError pesan={errorDi(peta, "tingkat_kesulitan")} />
            </fieldset>
          </section>

          {/* ---- Redaksi ---- */}
          <section className={kartu}>
            <TextareaKaya
              id="redaksi"
              label="Redaksi soal"
              wajib
              value={form.redaksi}
              onChange={(v) => ubah({ redaksi: v })}
              maks={BATAS.redaksiMaks}
              rows={6}
              inputRef={redaksiRef}
              disabled={!bolehEdit}
              error={errorDi(peta, "redaksi")}
              petunjuk={
                form.tipe === "isian"
                  ? "Taruh kursor di tempat jawaban, lalu tekan \"Sisipkan rumpang\". Penanda {{r1}} menjadi kotak jawaban."
                  : undefined
              }
              tombolTambahan={
                form.tipe === "isian" ? (
                  <button
                    type="button"
                    onClick={sisipkanRumpang}
                    disabled={rumpang.length >= BATAS.rumpangMaks}
                    className={tombolKecil}
                    title={`Maksimal ${BATAS.rumpangMaks} rumpang`}
                  >
                    + Sisipkan rumpang
                  </button>
                ) : null
              }
            />
            <ContekanRumus />
          </section>

          {/* ---- Pilihan ganda ---- */}
          {form.tipe === "pilihan_ganda" ? (
            <section className={kartu}>
              <h2 className="text-base font-medium text-black">Opsi jawaban</h2>
              <PesanError pesan={errorDi(peta, "konten.opsi")} />
              {opsi.map((o, i) => (
                <TextareaKaya
                  key={o.label ?? i}
                  id={`opsi-${i}`}
                  label={`Opsi ${o.label ?? LABEL_OPSI[i]}`}
                  value={o.teks ?? ""}
                  onChange={(v) => ubahKonten({ opsi: opsi.map((x, j) => (j === i ? { ...x, teks: v } : x)) })}
                  maks={BATAS.opsiTeksMaks}
                  rows={2}
                  disabled={!bolehEdit}
                  error={errorDi(peta, `konten.opsi.${i}`, true)}
                />
              ))}
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-sm font-medium text-black">
                  Kunci jawaban <span className="text-[#E70A0A]">*</span>
                </legend>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kunci jawaban">
                  {LABEL_OPSI.map((l) => (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={form.kunci.opsi === l}
                      disabled={!bolehEdit}
                      onClick={() => ubahKunci({ opsi: l })}
                      className={[
                        "h-10 w-10 rounded-full border text-sm font-medium transition-colors disabled:cursor-not-allowed",
                        form.kunci.opsi === l ? "border-[#0A7D2C] bg-[#0A7D2C] text-white" : "border-[#CAC9C9] bg-white text-black",
                      ].join(" ")}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <PesanError pesan={errorDi(peta, "kunci.opsi")} />
              </fieldset>
            </section>
          ) : null}

          {/* ---- Majemuk kompleks ---- */}
          {form.tipe === "majemuk_kompleks" ? (
            <section className={kartu}>
              <h2 className="text-base font-medium text-black">Pernyataan</h2>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="preset-label" className="text-sm font-medium text-black">
                  Label kolom jawaban
                </label>
                <select
                  id="preset-label"
                  disabled={!bolehEdit}
                  value={labelSendiri ? "sendiri" : String(Math.max(presetCocok, 0))}
                  onChange={(e) => {
                    if (e.target.value === "sendiri") return setLabelSendiri(true);
                    setLabelSendiri(false);
                    ubahKonten({ label_kolom: [...PRESET_LABEL_KOLOM[Number(e.target.value)]] });
                  }}
                  className={inputKelas()}
                >
                  {PRESET_LABEL_KOLOM.map(([a, b], i) => (
                    <option key={a} value={i}>
                      {a} / {b}
                    </option>
                  ))}
                  <option value="sendiri">Tulis sendiri…</option>
                </select>
                {labelSendiri ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[0, 1].map((k) => (
                      <input
                        key={k}
                        value={labelKolom[k] ?? ""}
                        disabled={!bolehEdit}
                        maxLength={BATAS.labelKolomMaks + 10}
                        aria-label={`Label kolom ${k + 1}`}
                        placeholder={`Kolom ${k + 1}`}
                        onChange={(e) => {
                          const l = [labelKolom[0] ?? "", labelKolom[1] ?? ""];
                          l[k] = e.target.value;
                          ubahKonten({ label_kolom: l });
                        }}
                        className={inputKelas(errorDi(peta, `konten.label_kolom.${k}`))}
                      />
                    ))}
                  </div>
                ) : null}
                <PesanError pesan={errorDi(peta, "konten.label_kolom", true)} />
              </div>

              <PesanError pesan={errorDi(peta, "konten.pernyataan")} />
              {pernyataan.map((p, i) => (
                <div key={p.id} className="flex flex-col gap-2 rounded-[16px] border border-[#E3E3E3] p-3">
                  <TextareaKaya
                    id={`pernyataan-${p.id}`}
                    label={`Pernyataan ${i + 1}`}
                    value={p.teks ?? ""}
                    onChange={(v) => ubahKonten({ pernyataan: pernyataan.map((x) => (x.id === p.id ? { ...x, teks: v } : x)) })}
                    maks={BATAS.pernyataanTeksMaks}
                    rows={2}
                    disabled={!bolehEdit}
                    error={errorDi(peta, `konten.pernyataan.${i}`, true)}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[#7E7C7C]">Kunci:</span>
                    {[0, 1].map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={perBaris[p.id] === k}
                        disabled={!bolehEdit}
                        onClick={() => ubahKunci({ per_baris: { ...perBaris, [p.id]: k } })}
                        className={[
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                          perBaris[p.id] === k ? "border-[#0A7D2C] bg-[#0A7D2C] text-white" : "border-[#CAC9C9] bg-white text-black",
                        ].join(" ")}
                      >
                        {labelKolom[k] || `Kolom ${k + 1}`}
                      </button>
                    ))}
                    {pernyataan.length > BATAS.pernyataanMin && bolehEdit ? (
                      <button
                        type="button"
                        onClick={() => {
                          const kunciBaru = { ...perBaris };
                          delete kunciBaru[p.id];
                          setForm((f) => ({
                            ...f,
                            konten: { ...f.konten, pernyataan: pernyataan.filter((x) => x.id !== p.id) },
                            kunci: { ...f.kunci, per_baris: kunciBaru },
                          }));
                        }}
                        className="ml-auto text-xs text-[#E70A0A] hover:underline"
                      >
                        Hapus pernyataan
                      </button>
                    ) : null}
                  </div>
                  <PesanError pesan={errorDi(peta, `kunci.per_baris.${p.id}`)} />
                </div>
              ))}
              {bolehEdit ? (
                <button
                  type="button"
                  disabled={pernyataan.length >= BATAS.pernyataanMaks}
                  onClick={() =>
                    ubahKonten({ pernyataan: [...pernyataan, { id: idBagianBaru("p", pernyataan.map((x) => x.id)), teks: "" }] })
                  }
                  className={`${tombolKecil} w-fit`}
                >
                  + Tambah pernyataan ({pernyataan.length}/{BATAS.pernyataanMaks})
                </button>
              ) : null}
              <PesanError pesan={errorDi(peta, "kunci.per_baris")} />
            </section>
          ) : null}

          {/* ---- Isian ---- */}
          {form.tipe === "isian" ? (
            <section className={kartu}>
              <h2 className="text-base font-medium text-black">Rumpang & jawaban diterima</h2>
              <PesanError pesan={errorDi(peta, "konten.rumpang", true)} />
              {rumpang.length === 0 ? (
                <p className="text-sm text-[#7E7C7C]">Belum ada rumpang. Sisipkan dari kotak redaksi (1–5 rumpang).</p>
              ) : null}
              {rumpang.map((r) => {
                const k = objek(kunciRumpang[r.id]);
                const diterima = daftar<string>(k.diterima);
                const adaDiRedaksi = penanda.includes(r.id);
                return (
                  <div key={r.id} className="flex flex-col gap-2 rounded-[16px] border border-[#E3E3E3] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{`{{${r.id}}}`}</span>
                      <span className={["text-xs", adaDiRedaksi ? "text-[#0A7D2C]" : "text-[#E70A0A]"].join(" ")}>
                        {adaDiRedaksi ? "ada di redaksi" : "belum ada di redaksi"}
                      </span>
                      <select
                        aria-label={`Jenis jawaban ${r.id}`}
                        value={r.jenis}
                        disabled={!bolehEdit}
                        onChange={(e) => {
                          const jenis = e.target.value;
                          setForm((f) => {
                            const kr = { ...objek(f.kunci.rumpang) };
                            const ki = { ...objek(kr[r.id]) };
                            if (jenis !== "angka") delete ki.toleransi;
                            kr[r.id] = ki;
                            return {
                              ...f,
                              konten: { ...f.konten, rumpang: rumpang.map((x) => (x.id === r.id ? { ...x, jenis } : x)) },
                              kunci: { ...f.kunci, rumpang: kr },
                            };
                          });
                        }}
                        className="rounded-[8px] border border-[#AFAFAF] bg-white px-2 py-1 text-xs"
                      >
                        <option value="teks">Teks</option>
                        <option value="angka">Angka</option>
                      </select>
                      {bolehEdit ? (
                        <button type="button" onClick={() => setForm((f) => hapusRumpang(f, r.id))} className="ml-auto text-xs text-[#E70A0A] hover:underline">
                          Hapus rumpang
                        </button>
                      ) : null}
                    </div>
                    <p className="text-xs text-[#7E7C7C]">
                      {r.jenis === "angka"
                        ? "Jawaban dicocokkan sebagai nilai: 0,5 = 0.5 = 1/2. Tulis tanpa pemisah ribuan (1.000 dibaca satu)."
                        : "Huruf besar/kecil dan spasi berlebih diabaikan; tanda baca tidak. Tambahkan ejaan lain sebagai jawaban alternatif."}
                    </p>
                    {diterima.map((d, j) => {
                      const nilai = r.jenis === "angka" && d.trim() ? parseAngka(d) : null;
                      return (
                        <div key={j} className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <input
                              value={d}
                              disabled={!bolehEdit}
                              inputMode={r.jenis === "angka" ? "decimal" : "text"}
                              aria-label={`Jawaban diterima ${j + 1} untuk ${r.id}`}
                              placeholder={j === 0 ? "Jawaban benar" : "Jawaban alternatif"}
                              onChange={(e) => ubahKunciRumpang(r.id, { diterima: diterima.map((x, n) => (n === j ? e.target.value : x)) })}
                              className={inputKelas(errorDi(peta, `kunci.rumpang.${r.id}.diterima.${j}`))}
                            />
                            {diterima.length > 1 && bolehEdit ? (
                              <button
                                type="button"
                                aria-label="Hapus jawaban ini"
                                onClick={() => ubahKunciRumpang(r.id, { diterima: diterima.filter((_, n) => n !== j) })}
                                className="shrink-0 text-xs text-[#E70A0A] hover:underline"
                              >
                                Hapus
                              </button>
                            ) : null}
                          </div>
                          {r.jenis === "angka" && d.trim() ? (
                            <span className={["text-xs", nilai ? "text-[#7E7C7C]" : "text-[#E70A0A]"].join(" ")}>
                              {nilai ? `dibaca ${nilai.q === BigInt(1) ? nilai.p : `${nilai.p}/${nilai.q}`}` : "bukan angka yang dikenali"}
                            </span>
                          ) : null}
                          <PesanError pesan={errorDi(peta, `kunci.rumpang.${r.id}.diterima.${j}`)} />
                        </div>
                      );
                    })}
                    {bolehEdit ? (
                      <button
                        type="button"
                        disabled={diterima.length >= BATAS.jawabanDiterimaMaks}
                        onClick={() => ubahKunciRumpang(r.id, { diterima: [...diterima, ""] })}
                        className={`${tombolKecil} w-fit`}
                      >
                        + Jawaban alternatif
                      </button>
                    ) : null}
                    {r.jenis === "angka" ? (
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`toleransi-${r.id}`} className="text-xs font-medium text-black">
                          Toleransi (opsional, untuk jawaban hasil pembulatan)
                        </label>
                        <input
                          id={`toleransi-${r.id}`}
                          value={k.toleransi === undefined || k.toleransi === null ? "" : String(k.toleransi)}
                          disabled={!bolehEdit}
                          inputMode="decimal"
                          placeholder="mis. 0,01"
                          onChange={(e) => ubahKunciRumpang(r.id, { toleransi: e.target.value })}
                          className={`${inputKelas(errorDi(peta, `kunci.rumpang.${r.id}.toleransi`))} sm:w-40`}
                        />
                      </div>
                    ) : null}
                    <PesanError
                      pesan={[
                        ...(errorDi(peta, `kunci.rumpang.${r.id}`) ?? []),
                        ...(errorDi(peta, `kunci.rumpang.${r.id}.diterima`) ?? []),
                        ...(errorDi(peta, `kunci.rumpang.${r.id}.toleransi`) ?? []),
                      ]}
                    />
                  </div>
                );
              })}
              <PesanError pesan={errorDi(peta, "kunci.rumpang")} />
            </section>
          ) : null}

          {/* ---- Pembahasan & metadata ---- */}
          <section className={kartu}>
            <TextareaKaya
              id="pembahasan"
              label="Pembahasan"
              wajib
              value={form.pembahasan}
              onChange={(v) => ubah({ pembahasan: v })}
              maks={BATAS.pembahasanMaks}
              rows={5}
              disabled={!bolehEdit}
              error={errorDi(peta, "pembahasan")}
              petunjuk={`Minimal ${BATAS.pembahasanMin} karakter. Jelaskan langkah sampai jawaban.`}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sumber" className="text-sm font-medium text-black">
                Sumber rujukan <span className="font-normal text-[#7E7C7C]">(opsional)</span>
              </label>
              <input
                id="sumber"
                value={form.sumber_rujukan}
                disabled={!bolehEdit}
                placeholder="mis. Buatan sendiri, atau nama buku/situs yang diadaptasi"
                onChange={(e) => ubah({ sumber_rujukan: e.target.value })}
                className={inputKelas(errorDi(peta, "sumber_rujukan"))}
              />
              <PesanError pesan={errorDi(peta, "sumber_rujukan")} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="estimasi" className="text-sm font-medium text-black">
                  Estimasi waktu (detik) <span className="font-normal text-[#7E7C7C]">(opsional)</span>
                </label>
                <input
                  id="estimasi"
                  type="number"
                  inputMode="numeric"
                  min={BATAS.estimasiDetikMin}
                  max={BATAS.estimasiDetikMaks}
                  value={form.estimasi_waktu_detik ?? ""}
                  disabled={!bolehEdit}
                  placeholder={`${BATAS.estimasiDetikMin}–${BATAS.estimasiDetikMaks}`}
                  onChange={(e) => ubah({ estimasi_waktu_detik: e.target.value === "" ? null : Number(e.target.value) })}
                  className={inputKelas(errorDi(peta, "estimasi_waktu_detik"))}
                />
                <PesanError pesan={errorDi(peta, "estimasi_waktu_detik")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="level" className="text-sm font-medium text-black">
                  Level kognitif <span className="font-normal text-[#7E7C7C]">(opsional)</span>
                </label>
                <select
                  id="level"
                  value={form.level_kognitif ?? ""}
                  disabled={!bolehEdit}
                  onChange={(e) => ubah({ level_kognitif: e.target.value === "" ? null : Number(e.target.value) })}
                  className={inputKelas(errorDi(peta, "level_kognitif"))}
                >
                  <option value="">Tidak diisi</option>
                  {[1, 2, 3].map((l) => (
                    <option key={l} value={l}>
                      {LABEL_LEVEL[l]}
                    </option>
                  ))}
                </select>
                <PesanError pesan={errorDi(peta, "level_kognitif")} />
              </div>
            </div>
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

          {bolehEdit && !sudahPernahDiajukan && sudahDisimpan && status === "draf" ? (
            <div className="flex flex-wrap items-center gap-2">
              {konfirmasiHapus ? (
                <>
                  <span className="text-sm text-black">Hapus draf ini? Tidak bisa dibatalkan.</span>
                  <button type="button" onClick={hapus} disabled={sibuk !== null} className="rounded-full bg-[#E70A0A] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                    {sibuk === "hapus" ? "Menghapus…" : "Ya, hapus"}
                  </button>
                  <button type="button" onClick={() => setKonfirmasiHapus(false)} className="rounded-full border border-[#CAC9C9] px-4 py-1.5 text-sm">
                    Batal
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setKonfirmasiHapus(true)} className="text-sm text-[#E70A0A] hover:underline">
                  Hapus draf
                </button>
              )}
            </div>
          ) : null}
        </div>

        <aside className={["min-w-0", tab === "pratinjau" ? "" : "hidden lg:block"].join(" ")}>
          <div className={`${kartu} lg:sticky lg:top-4`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-medium text-black">Pratinjau</h2>
              <span className="text-xs text-[#7E7C7C]">Tampilan seperti yang dilihat siswa</span>
            </div>
            <SoalPratinjau soal={form} stimulus={stimulus?.blok ?? null} />
          </div>
        </aside>
      </div>

      {/* ---- Bilah aksi (menempel di bawah, nyaman di HP) ---- */}
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
            {bisaAjukanSendiri ? (
              <button
                type="button"
                onClick={ajukan}
                disabled={sibuk !== null}
                className="rounded-full bg-[#081EEA] px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sibuk === "ajukan" ? "Mengajukan…" : "Ajukan untuk ditinjau"}
              </button>
            ) : (
              <span className="text-xs text-[#7E7C7C]">Soal ini diajukan bersama stimulusnya dari halaman stimulus.</span>
            )}
            <span className="ml-auto text-xs text-[#7E7C7C]">
              {jumlahBelumLengkap === 0 ? "Siap diajukan" : `${jumlahBelumLengkap} hal belum lengkap`}
            </span>
          </>
        ) : null}
        {status === "diajukan" && ditugaskan && !(stimulus && stimulus.status === "diajukan") ? (
          <button
            type="button"
            onClick={tarik}
            disabled={sibuk !== null}
            className="rounded-full border border-black bg-white px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {sibuk === "tarik" ? "Menarik…" : "Tarik pengajuan"}
          </button>
        ) : null}
        {status === "terpublikasi" && ditugaskan ? (
          <button
            type="button"
            onClick={versiBaru}
            disabled={sibuk !== null}
            className="rounded-full bg-[#081EEA] px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {sibuk === "versi" ? "Membuat…" : "Buat versi baru"}
          </button>
        ) : null}
        {!bolehEdit && status !== "diajukan" && status !== "terpublikasi" ? (
          <span className="text-xs text-[#7E7C7C]">Soal ini hanya bisa dilihat.</span>
        ) : null}
      </div>
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
