"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import SelectField from "@/components/ui/SelectField";
import SoalPratinjau from "@/components/studio-soal/SoalPratinjau";
import TabTulisPratinjau, { type TabForm } from "@/components/studio-soal/TabTulisPratinjau";
import TombolHapusDraf from "@/components/studio-soal/TombolHapusDraf";
import BilahAksi, { KELAS_TOMBOL_BILAH } from "@/components/studio-soal/BilahAksi";
import { IkonTongSampah } from "@/components/studio-soal/Ikon";
import PenjagaKeluar from "@/components/studio-soal/PenjagaKeluar";
import { KARTU, CHIP, KOLOM_PRATINJAU, TOMBOL_KECIL, inputKecil, pesanKelas, pilihan, tombolIkon } from "@/components/studio-soal/gaya";
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
  kontenAwal,
  penandaDiRedaksi,
  sisipRumpang,
  type FormSoal as DataFormSoal,
} from "@/lib/shared/studio-soal/formSoal";
import { parseAngka } from "@/lib/shared/studio-soal/angka";
import { alasanTidakBisaHapus, tampilkanTombolHapus } from "@/lib/shared/studio-soal/hapusDraf";
import { cekSoalLengkap, pesanUnik } from "@/lib/shared/studio-soal/kelengkapan";
import { formBerubah } from "@/lib/shared/studio-soal/peringatanKeluar";
import { LABEL_OPSI, TIPE_SOAL, type BlokStimulus, type TipeSoal } from "@/lib/shared/studio-soal/tipe";
import type { ErrorValidasi } from "@/lib/shared/studio-soal/validasi";

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

const kartu = KARTU;
const inputKelas = inputKecil;
const tombolKecil = TOMBOL_KECIL;

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
  type Pesan = { jenis: "ok" | "gagal"; teks: string; tautan?: string; daftar?: string[] };
  const [pesan, setPesanState] = useState<Pesan | null>(null);
  const pesanRef = useRef<HTMLDivElement | null>(null);
  /** Tampilkan pesan dan gulir ke sana (tombol ada di bilah bawah, pesannya di atas). */
  const setPesan = (p: Pesan | null) => {
    setPesanState(p);
    if (p) requestAnimationFrame(() => pesanRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const [errorServer, setErrorServer] = useState<ErrorValidasi[]>([]);
  const [tampilSemua, setTampilSemua] = useState(false);
  const [tab, setTab] = useState<TabForm>("tulis");
  // Pernah diajukan di sesi ini -> tidak bisa dihapus lagi (DB juga menolak).
  const [sudahPernahDiajukan, setSudahPernahDiajukan] = useState(pernahDiajukan);

  const bolehEdit = isBolehEdit(status) && ditugaskan;
  const kategori = subtesPilihan.find((s) => s.id === form.subtes_id)?.kategori;
  const jejakForm = JSON.stringify(form);
  const jejakAwal = useMemo(() => JSON.stringify(awal), [awal]);
  const kotor = jejakTersimpan !== jejakForm;
  // Peringatan keluar: soal baru yang belum disentuh tidak dihitung berubah.
  const adaPerubahan = bolehEdit && formBerubah({ jejakTersimpan, jejakAwal, jejakSekarang: jejakForm });

  const errorsAjukan = useMemo(() => cekSoalLengkap(form, kategori), [form, kategori]);
  const errorsBentuk = errorsAjukan.filter((e) => e.jenis === "bentuk");
  const peta = petaError([...(tampilSemua ? errorsAjukan : errorsBentuk), ...errorServer]);
  const jumlahBelumLengkap = errorsAjukan.length;

  // ---------------------------------------------------------------- aksi
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
    const r = await panggilApi(`/api/studio-soal/soal/${id}`, "PUT", form);
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
      setPesan({ jenis: "gagal", teks: "Belum bisa dikirim. Lengkapi dulu yang ditandai merah:", daftar: pesanUnik(errorsAjukan) });
      return;
    }
    if (kotor || !sudahDisimpan) {
      if (!(await simpan())) return;
    }
    const r = await jalankan("ajukan", `/api/studio-soal/soal/${id}/ajukan`, "POST");
    if (!r.ok) {
      const errors = Array.isArray(r.json.errors) ? (r.json.errors as ErrorValidasi[]) : [];
      setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Soal belum terkirim. Coba lagi."), daftar: pesanUnik(errors) });
      setErrorServer(errors);
      return;
    }
    setStatus("diajukan");
    setSudahPernahDiajukan(true);
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Soal sudah dikirim untuk dicek.") });
  }

  async function tarik() {
    if (sibukRef.current) return;
    const r = await jalankan("tarik", `/api/studio-soal/soal/${id}/tarik`, "POST");
    if (!r.ok) return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Kiriman belum dibatalkan. Coba lagi.") });
    setStatus("draf");
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Kiriman dibatalkan.") });
  }

  async function versiBaru() {
    if (sibukRef.current) return;
    const r = await jalankan("versi", `/api/studio-soal/soal/${id}/versi-baru`, "POST");
    if (!r.ok) {
      const terbuka = typeof r.json.idTerbuka === "string" ? `/studio-soal/soal/${r.json.idTerbuka}` : undefined;
      return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Versi baru belum dibuat. Coba lagi."), tautan: terbuka });
    }
    router.push(`/studio-soal/soal/${String(r.json.id)}`);
  }

  const judul = baru && !sudahDisimpan ? "Tulis soal baru" : "Soal";
  const bisaAjukanSendiri = !stimulus || stimulus.status === "terpublikasi";

  return (
    <div className="flex flex-col gap-4 pb-24 sm:gap-5">
      <PenjagaKeluar adaPerubahan={adaPerubahan} />
      {/* Dua kolom di layar besar: kiri judul + form, kanan pratinjau yang menempel
          (mulai sejajar judul). Di HP satu kolom, pratinjau lewat tab. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <div className="flex flex-col gap-2">
            <Link href={stimulus ? `/studio-soal/stimulus/${stimulus.id}` : "/studio-soal"} className="w-fit text-sm text-primary hover:underline">
              ← {stimulus ? `Bacaan: ${stimulus.judul || "tanpa judul"}` : "Studio Soal"}
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-medium text-black sm:text-2xl">{judul}</h1>
              <span className={CHIP}>{LABEL_STATUS[status] ?? status}</span>
              {versi > 1 ? <span className="text-xs text-muted">versi {versi}</span> : null}
            </div>
          </div>

          {!ditugaskan ? (
            <Banner jenis="peringatan">
              Anda tidak lagi ditugaskan ke subtes ini. Soal tetap tersimpan, tapi tidak bisa diubah atau dikirim sampai Admin
              menugaskan Anda lagi.
            </Banner>
          ) : null}
          {status === "ditolak" && alasanTolak ? (
            <Banner jenis="peringatan">
              <span className="font-medium">Catatan dari pengecek:</span> {alasanTolak}
              <br />
              Perbaiki soalnya, lalu kirim lagi.
            </Banner>
          ) : null}
          {status === "diajukan" ? (
            <Banner jenis="info">
              Soal sedang dicek mentor lain, jadi isinya dikunci dulu.{" "}
              {stimulus && stimulus.status === "diajukan"
                ? "Soal ini dikirim bersama bacaannya — batalkan kirim dari halaman bacaan kalau mau mengubahnya."
                : "Tekan “Batalkan kirim” kalau mau mengubahnya."}
            </Banner>
          ) : null}
          {status === "terpublikasi" ? (
            <Banner jenis="info">
              Soal sudah terbit, jadi isinya dikunci. Untuk mengubah, buat versi baru — versi ini tetap dipakai sampai versi baru lolos
              dicek.
            </Banner>
          ) : null}
          {status === "digantikan" || status === "diarsipkan" ? (
            <Banner jenis="info">Soal ini {LABEL_STATUS[status]?.toLowerCase()} dan hanya bisa dilihat.</Banner>
          ) : null}

          {pesan ? (
            <div ref={pesanRef} role={pesan.jenis === "gagal" ? "alert" : "status"} className={pesanKelas(pesan.jenis)}>
              {pesan.teks}
              {pesan.daftar && pesan.daftar.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {pesan.daftar.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}
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
          <TabTulisPratinjau tab={tab} setTab={setTab} label={{ tulis: "Tulis", pratinjau: "Pratinjau & uji kunci" }} />

          <div className={["flex min-w-0 flex-col gap-4", tab === "tulis" ? "" : "hidden lg:flex"].join(" ")}>
            <IsianSoal
              form={form}
              setForm={setForm}
              onUbah={() => setErrorServer([])}
              bolehEdit={bolehEdit}
              sudahDisimpan={sudahDisimpan}
              subtesTerkunci={sudahDisimpan || stimulus !== null}
              subtesPilihan={subtesPilihan}
              peta={peta}
            />

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
        </div>

        <aside className={["min-w-0", KOLOM_PRATINJAU, tab === "pratinjau" ? "" : "hidden lg:block"].join(" ")}>
          <div className={kartu}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-medium text-black">Pratinjau</h2>
              <span className="text-xs text-muted">Tampilan seperti yang dilihat siswa</span>
            </div>
            <SoalPratinjau soal={form} stimulus={stimulus?.blok ?? null} />
          </div>
        </aside>
      </div>

      {/* ---- Bilah aksi (menempel di bawah, nyaman di HP) ---- */}
      <BilahAksi
        keterangan={
          bolehEdit ? (
            <>
              {sudahDisimpan ? (
                <span className={kotor ? "text-amber-700" : undefined}>
                  {kotor ? "Ada perubahan belum disimpan" : "Semua perubahan tersimpan"}
                </span>
              ) : (
                <span>Belum disimpan</span>
              )}
              <span>
                {" · "}
                {bisaAjukanSendiri
                  ? jumlahBelumLengkap === 0
                    ? "Siap dikirim"
                    : `${jumlahBelumLengkap} hal belum lengkap`
                  : "Dikirim bersama bacaannya dari halaman bacaan"}
              </span>
            </>
          ) : status !== "diajukan" && status !== "terpublikasi" ? (
            "Soal ini hanya bisa dilihat."
          ) : null
        }
        hapus={
          sudahDisimpan && tampilkanTombolHapus(status) ? (
            <TombolHapusDraf
              objek="soal"
              id={id}
              versi={versi}
              sesudahHapus={stimulus ? `/studio-soal/stimulus/${stimulus.id}` : "/studio-soal"}
              alasan={alasanTidakBisaHapus("soal", { status, pernahDiajukan: sudahPernahDiajukan, ditugaskan })}
            />
          ) : null
        }
      >
        {bolehEdit ? (
          <Button variant="secondary" size="sm" className={KELAS_TOMBOL_BILAH} onClick={simpan} disabled={sibuk !== null}>
            {sibuk === "simpan" ? "Menyimpan…" : "Simpan"}
          </Button>
        ) : null}
        {bolehEdit && bisaAjukanSendiri ? (
          <Button size="sm" className={KELAS_TOMBOL_BILAH} onClick={ajukan} disabled={sibuk !== null}>
            {sibuk === "ajukan" ? "Mengirim…" : "Kirim untuk dicek"}
          </Button>
        ) : null}
        {status === "diajukan" && ditugaskan && !(stimulus && stimulus.status === "diajukan") ? (
          <Button variant="secondary" size="sm" className={KELAS_TOMBOL_BILAH} onClick={tarik} disabled={sibuk !== null}>
            {sibuk === "tarik" ? "Membatalkan…" : "Batalkan kirim"}
          </Button>
        ) : null}
        {status === "terpublikasi" && ditugaskan ? (
          <Button size="sm" className={KELAS_TOMBOL_BILAH} onClick={versiBaru} disabled={sibuk !== null}>
            {sibuk === "versi" ? "Membuat…" : "Buat versi baru"}
          </Button>
        ) : null}
      </BilahAksi>
    </div>
  );
}

/**
 * Isian soal (identitas, teks soal, bagian per tipe, pembahasan & metadata)
 * TANPA bilah simpan — dipakai FormSoal (halaman soal) dan kartu soal di
 * halaman bacaan (UX-3). `idAwalan` membuat id elemen unik bila ada beberapa
 * kartu soal di satu halaman.
 */
export function IsianSoal({
  form,
  setForm,
  onUbah,
  bolehEdit,
  sudahDisimpan,
  subtesTerkunci,
  subtesPilihan,
  peta,
  idAwalan = "",
}: {
  form: DataFormSoal;
  setForm: Dispatch<SetStateAction<DataFormSoal>>;
  /** Dipanggil setiap isian umum berubah (mis. untuk membersihkan error server). */
  onUbah?: () => void;
  bolehEdit: boolean;
  /** Sudah pernah disimpan: tipe tidak bisa diganti. */
  sudahDisimpan: boolean;
  /** Subtes tampil sebagai teks (sudah disimpan, atau soal di dalam bacaan). */
  subtesTerkunci: boolean;
  subtesPilihan: SubtesPilihan[];
  peta: Map<string, string[]>;
  idAwalan?: string;
}) {
  const redaksiRef = useRef<HTMLTextAreaElement | null>(null);

  function ubah(patch: Partial<DataFormSoal>) {
    setForm((f) => ({ ...f, ...patch }));
    onUbah?.();
  }
  const ubahKonten = (patch: Obj) => setForm((f) => ({ ...f, konten: { ...f.konten, ...patch } }));
  const ubahKunci = (patch: Obj) => setForm((f) => ({ ...f, kunci: { ...f.kunci, ...patch } }));

  function gantiTipe(tipe: TipeSoal) {
    if (sudahDisimpan || tipe === form.tipe) return;
    setForm((f) => ({ ...f, tipe, ...kontenAwal(tipe) }));
  }

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

  return (
    <>
      {/* ---- Identitas ---- */}
      <section className={kartu}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idAwalan}subtes`} className="text-sm font-medium text-black">
            Subtes <span className="text-danger">*</span>
          </label>
          {subtesTerkunci ? (
            <p className="text-sm text-black">{subtesNama ?? "Subtes tidak dikenal"}</p>
          ) : (
            <SelectField
              id={`${idAwalan}subtes`}
              size="md"
              value={form.subtes_id}
              onChange={(e) => ubah({ subtes_id: e.target.value })}
              status={errorDi(peta, "subtes_id") ? "error" : "default"}
              placeholder="Pilih subtes yang ditugaskan"
              options={subtesPilihan.map((s) => ({ value: s.id, label: s.nama }))}
            />
          )}
          <PesanError pesan={errorDi(peta, "subtes_id")} />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-black">
            Tipe soal <span className="text-danger">*</span>
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
                  className={`flex flex-col items-start gap-0.5 rounded-[12px] px-3 py-2 text-left ${pilihan(form.tipe === t)}`}
                >
                  <span className="font-medium">{LABEL_TIPE[t]}</span>
                  <span className={["text-xs", form.tipe === t ? "text-white/80" : "text-muted"].join(" ")}>
                    {KETERANGAN_TIPE[t]}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!sudahDisimpan ? (
            <p className="text-xs text-muted">Subtes dan tipe soal tidak bisa diganti setelah draf pertama disimpan.</p>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-black">
            Tingkat kesulitan <span className="text-danger">*</span>
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
                className={`rounded-full px-4 py-1.5 ${pilihan(form.tingkat_kesulitan === k)}`}
              >
                {LABEL_KESULITAN[k]}
              </button>
            ))}
          </div>
          <PesanError pesan={errorDi(peta, "tingkat_kesulitan")} />
        </fieldset>
      </section>

      {/* ---- Teks soal (redaksi) ---- */}
      <section className={kartu}>
        <TextareaKaya
          id={`${idAwalan}redaksi`}
          label="Teks soal"
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
              ? "Taruh kursor di tempat jawaban, lalu tekan “Sisipkan kotak jawaban”. Tanda {{r1}} nanti tampil sebagai kotak isian untuk siswa."
              : undefined
          }
          tombolTambahan={
            form.tipe === "isian" ? (
              <button
                type="button"
                onClick={sisipkanRumpang}
                disabled={rumpang.length >= BATAS.rumpangMaks}
                className={tombolKecil}
                title={`Maksimal ${BATAS.rumpangMaks} kotak jawaban`}
              >
                + Sisipkan kotak jawaban
              </button>
            ) : null
          }
        />
        <ContekanRumus />
      </section>

      {/* ---- Pilihan ganda ---- */}
      {form.tipe === "pilihan_ganda" ? (
        <section className={kartu}>
          <h2 className="text-base font-medium text-black">Pilihan jawaban</h2>
          <PesanError pesan={errorDi(peta, "konten.opsi")} />
          {opsi.map((o, i) => (
            <TextareaKaya
              key={o.label ?? i}
              id={`${idAwalan}opsi-${i}`}
              label={`Pilihan ${o.label ?? LABEL_OPSI[i]}`}
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
              Jawaban benar <span className="text-danger">*</span>
            </legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Jawaban benar">
              {LABEL_OPSI.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={form.kunci.opsi === l}
                  disabled={!bolehEdit}
                  onClick={() => ubahKunci({ opsi: l })}
                  className={`h-10 w-10 rounded-full ${pilihan(form.kunci.opsi === l, "success")}`}
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
            <label htmlFor={`${idAwalan}preset-label`} className="text-sm font-medium text-black">
              Label kolom jawaban
            </label>
            <SelectField
              id={`${idAwalan}preset-label`}
              size="md"
              disabled={!bolehEdit}
              value={labelSendiri ? "sendiri" : String(Math.max(presetCocok, 0))}
              onChange={(e) => {
                if (e.target.value === "sendiri") return setLabelSendiri(true);
                setLabelSendiri(false);
                ubahKonten({ label_kolom: [...PRESET_LABEL_KOLOM[Number(e.target.value)]] });
              }}
              options={[
                ...PRESET_LABEL_KOLOM.map(([a, b], i) => ({ value: String(i), label: `${a} / ${b}` })),
                { value: "sendiri", label: "Tulis sendiri…" },
              ]}
            />
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
            <div key={p.id} className="flex flex-col gap-2 rounded-[16px] border border-line p-3">
              <TextareaKaya
                id={`${idAwalan}pernyataan-${p.id}`}
                label={`Pernyataan ${i + 1}`}
                value={p.teks ?? ""}
                onChange={(v) => ubahKonten({ pernyataan: pernyataan.map((x) => (x.id === p.id ? { ...x, teks: v } : x)) })}
                maks={BATAS.pernyataanTeksMaks}
                rows={2}
                disabled={!bolehEdit}
                error={errorDi(peta, `konten.pernyataan.${i}`, true)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Jawaban benar:</span>
                {[0, 1].map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={perBaris[p.id] === k}
                    disabled={!bolehEdit}
                    onClick={() => ubahKunci({ per_baris: { ...perBaris, [p.id]: k } })}
                    className={`rounded-full px-3 py-1 ${pilihan(perBaris[p.id] === k, "success", "text-xs")}`}
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
                    aria-label={`Hapus pernyataan ${i + 1}`}
                    title="Hapus pernyataan ini"
                    className={`ml-auto ${tombolIkon(true)}`}
                  >
                    <IkonTongSampah />
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
          <h2 className="text-base font-medium text-black">Kotak jawaban & jawaban yang diterima</h2>
          <PesanError pesan={errorDi(peta, "konten.rumpang", true)} />
          {rumpang.length === 0 ? (
            <p className="text-sm text-muted">Belum ada kotak jawaban. Sisipkan dari kotak teks soal (1–5 kotak).</p>
          ) : null}
          {rumpang.map((r) => {
            const k = objek(kunciRumpang[r.id]);
            const diterima = daftar<string>(k.diterima);
            const adaDiRedaksi = penanda.includes(r.id);
            return (
              <div key={r.id} className="flex flex-col gap-2 rounded-[16px] border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium">{`{{${r.id}}}`}</span>
                  <span className={["text-xs", adaDiRedaksi ? "text-success" : "text-danger"].join(" ")}>
                    {adaDiRedaksi ? "sudah ada di teks soal" : "belum ada di teks soal"}
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
                    className="rounded-[8px] border border-subtle bg-white px-2 py-1 text-xs hover:border-primary"
                  >
                    <option value="teks">Teks</option>
                    <option value="angka">Angka</option>
                  </select>
                  {bolehEdit ? (
                    <button
                      type="button"
                      onClick={() => setForm((f) => hapusRumpang(f, r.id))}
                      aria-label={`Hapus kotak jawaban ${r.id}`}
                      title="Hapus kotak jawaban ini"
                      className={`ml-auto ${tombolIkon(true)}`}
                    >
                      <IkonTongSampah />
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-muted">
                  {r.jenis === "angka"
                    ? "Jawaban dicocokkan sebagai nilai: 0,5 = 0.5 = 1/2. Tulis tanpa pemisah ribuan (1.000 dibaca satu)."
                    : "Huruf besar/kecil dan spasi berlebih tidak dihitung, tapi tanda baca dihitung. Kalau ada ejaan lain yang benar, tambahkan sebagai jawaban lain."}
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
                          placeholder={j === 0 ? "Jawaban benar" : "Jawaban lain yang juga benar"}
                          onChange={(e) => ubahKunciRumpang(r.id, { diterima: diterima.map((x, n) => (n === j ? e.target.value : x)) })}
                          className={inputKelas(errorDi(peta, `kunci.rumpang.${r.id}.diterima.${j}`))}
                        />
                        {diterima.length > 1 && bolehEdit ? (
                          <button
                            type="button"
                            aria-label={`Hapus jawaban ${j + 1} untuk ${r.id}`}
                            title="Hapus jawaban ini"
                            onClick={() => ubahKunciRumpang(r.id, { diterima: diterima.filter((_, n) => n !== j) })}
                            className={tombolIkon(true)}
                          >
                            <IkonTongSampah />
                          </button>
                        ) : null}
                      </div>
                      {r.jenis === "angka" && d.trim() ? (
                        <span className={["text-xs", nilai ? "text-muted" : "text-danger"].join(" ")}>
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
                    + Jawaban lain yang juga benar
                  </button>
                ) : null}
                {r.jenis === "angka" ? (
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${idAwalan}toleransi-${r.id}`} className="text-xs font-medium text-black">
                      Batas selisih (opsional, untuk jawaban hasil pembulatan)
                    </label>
                    <input
                      id={`${idAwalan}toleransi-${r.id}`}
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
          id={`${idAwalan}pembahasan`}
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
          <label htmlFor={`${idAwalan}sumber`} className="text-sm font-medium text-black">
            Sumber soal <span className="font-normal text-muted">(opsional)</span>
          </label>
          <InputField
            type="text"
            size="md"
            id={`${idAwalan}sumber`}
            value={form.sumber_rujukan}
            disabled={!bolehEdit}
            status={errorDi(peta, "sumber_rujukan") ? "error" : "default"}
            placeholder="mis. Buatan sendiri, atau nama buku/situs yang diadaptasi"
            onChange={(e) => ubah({ sumber_rujukan: e.target.value })}
          />
          <PesanError pesan={errorDi(peta, "sumber_rujukan")} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idAwalan}estimasi`} className="text-sm font-medium text-black">
              Perkiraan waktu mengerjakan (detik) <span className="font-normal text-muted">(opsional)</span>
            </label>
            <InputField
              type="text"
              size="md"
              id={`${idAwalan}estimasi`}
              inputMode="numeric"
              value={form.estimasi_waktu_detik ?? ""}
              disabled={!bolehEdit}
              status={errorDi(peta, "estimasi_waktu_detik") ? "error" : "default"}
              placeholder={`${BATAS.estimasiDetikMin}–${BATAS.estimasiDetikMaks}`}
              onChange={(e) => {
                const angka = e.target.value.replace(/\D/g, "");
                ubah({ estimasi_waktu_detik: angka === "" ? null : Number(angka) });
              }}
            />
            <PesanError pesan={errorDi(peta, "estimasi_waktu_detik")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idAwalan}level`} className="text-sm font-medium text-black">
              Level berpikir <span className="font-normal text-muted">(opsional)</span>
            </label>
            <SelectField
              id={`${idAwalan}level`}
              size="md"
              value={form.level_kognitif ? String(form.level_kognitif) : ""}
              disabled={!bolehEdit}
              status={errorDi(peta, "level_kognitif") ? "error" : "default"}
              onChange={(e) => ubah({ level_kognitif: e.target.value === "" ? null : Number(e.target.value) })}
              options={[{ value: "", label: "Tidak diisi" }, ...[1, 2, 3].map((l) => ({ value: String(l), label: LABEL_LEVEL[l] }))]}
            />
            <PesanError pesan={errorDi(peta, "level_kognitif")} />
          </div>
        </div>
      </section>
    </>
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
