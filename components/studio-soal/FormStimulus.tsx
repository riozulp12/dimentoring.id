"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from "react";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import SelectField from "@/components/ui/SelectField";
import KartuSoalBacaan, { cekKartuUntukKirim } from "@/components/studio-soal/KartuSoalBacaan";
import StimulusPratinjau from "@/components/studio-soal/StimulusPratinjau";
import TombolHapusDraf from "@/components/studio-soal/TombolHapusDraf";
import { KARTU, CHIP, TOMBOL_KECIL, inputKecil, pesanKelas } from "@/components/studio-soal/gaya";
import TextareaKaya, { ContekanRumus, PesanError } from "@/components/studio-soal/TextareaKaya";
import { LABEL_STATUS, errorDi, isBolehEdit, panggilApi, petaError } from "@/components/studio-soal/klien";
import {
  bacaanBolehTambahSoal,
  bisaDiubah,
  jejak,
  keadaanKartu,
  ringkasSimpanSemua,
  simpanSemua,
  terapkanHasilSimpan,
  type KartuSoal,
} from "@/lib/shared/studio-soal/bacaanSoal";
import {
  BATAS,
  SUMBER_BUATAN_SENDIRI,
  blokTabelBaru,
  formAwal,
  inputValidasiStimulus,
  type FormSoal as DataFormSoal,
  type FormStimulus as DataFormStimulus,
} from "@/lib/shared/studio-soal/formSoal";
import { alasanTidakBisaHapus, tampilkanTombolHapus } from "@/lib/shared/studio-soal/hapusDraf";
import { validasiRumusStimulus } from "@/lib/shared/studio-soal/rumus";
import type { BlokStimulus, BlokTabel } from "@/lib/shared/studio-soal/tipe";
import { validasiStimulus, type ErrorValidasi } from "@/lib/shared/studio-soal/validasi";
import type { SubtesPilihan } from "@/components/studio-soal/FormSoal";

/**
 * Halaman "Soal dengan bacaan" Studio Soal — PR 3b, UX-1, UX-3. Dipakai
 * stimulus/baru DAN stimulus/[id] (di layar disebut "bacaan"; nama tabel/route
 * tetap stimulus). Bacaan di atas, kartu-kartu soal untuk bacaan itu di bawah,
 * satu tombol "Simpan semua":
 *   1. bacaan disimpan dulu (PUT idempoten per id, hanya bila berubah);
 *   2. lalu soal satu per satu berurutan lewat route soal yang sama;
 *      kartu kosong dilewati; id kartu tetap -> coba ulang tidak menggandakan.
 * Isian memakai komponen yang sama dengan form biasa (IsianStimulus di file
 * ini, IsianSoal dari FormSoal.tsx). Bacaan dan soal-soalnya diajukan &
 * ditinjau sebagai SATU kelompok. Hanya penulis bacaan yang boleh menambah
 * soal ke dalamnya (K7, dijaga juga di database). Atribusi sumber wajib saat
 * diajukan (K4). Gambar menyusul (K6).
 */

/** Soal yang sudah ada di bacaan ini (dari server). */
export interface SoalAwalBacaan {
  id: string;
  form: DataFormSoal;
  status: string;
  versi: number;
  alasanTolak: string | null;
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

/** UUID v4 di browser (id soal baru dibuat di browser, seperti id bacaan). */
function uuidBaru(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function kartuBaru(id: string, subtesId: string, stimulusId: string): KartuSoal {
  return {
    id,
    form: formAwal(subtesId, "pilihan_ganda", stimulusId),
    status: "draf",
    versi: 1,
    alasanTolak: null,
    pernahDiajukan: false,
    jejakTersimpan: null,
    terbuka: true,
    hasil: null,
  };
}

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
  idKartuBaru,
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
  soal: SoalAwalBacaan[];
  /** Bila diisi: buka satu kartu soal baru dengan id ini (bacaan baru, atau ?tambah=1). */
  idKartuBaru?: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<DataFormStimulus>(awal);
  const [status, setStatus] = useState(statusAwal);
  const [sudahDisimpan, setSudahDisimpan] = useState(!baru);
  const [jejakTersimpan, setJejakTersimpan] = useState<string | null>(baru ? null : JSON.stringify(awal));
  const [sibuk, setSibuk] = useState<Sibuk>(null);
  const sibukRef = useRef(false);
  const [proses, setProses] = useState<{ ke: number; dari: number } | null>(null);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "gagal"; teks: string } | null>(null);
  const [errorServer, setErrorServer] = useState<ErrorValidasi[]>([]);
  const [tampilSemua, setTampilSemua] = useState(false);
  const [tab, setTab] = useState<"tulis" | "pratinjau">("tulis");
  // Pernah diajukan di sesi ini -> tidak bisa dihapus lagi (DB juga menolak).
  const [sudahPernahDiajukan, setSudahPernahDiajukan] = useState(pernahDiajukan);
  const [kartuSoal, setKartuSoal] = useState<KartuSoal[]>(() => {
    const ada: KartuSoal[] = soal.map((s) => ({
      id: s.id,
      form: s.form,
      status: s.status,
      versi: s.versi,
      alasanTolak: s.alasanTolak,
      pernahDiajukan: false,
      jejakTersimpan: jejak(s.form),
      terbuka: false,
      hasil: null,
    }));
    return idKartuBaru ? [...ada, kartuBaru(idKartuBaru, awal.subtes_id, id)] : ada;
  });

  const bolehEdit = isBolehEdit(status) && ditugaskan;
  const soalBolehEdit = ditugaskan && bacaanBolehTambahSoal(status);
  const kategori = subtesPilihan.find((s) => s.id === form.subtes_id)?.kategori;
  const kotor = jejakTersimpan !== JSON.stringify(form);
  const kartuKotor = soalBolehEdit && kartuSoal.some((k) => keadaanKartu(k) === "belum");
  const blok = form.konten.blok;

  const errorsAjukan = useMemo(
    () => [...validasiStimulus(inputValidasiStimulus(form, kategori), "ajukan"), ...validasiRumusStimulus(form)],
    [form, kategori],
  );
  const errorsBentuk = errorsAjukan.filter((e) => e.jenis === "bentuk");
  const peta = petaError([...(tampilSemua ? errorsAjukan : errorsBentuk), ...errorServer]);

  useEffect(() => {
    if (!((kotor && bolehEdit) || kartuKotor)) return;
    const cegah = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", cegah);
    return () => window.removeEventListener("beforeunload", cegah);
  }, [kotor, bolehEdit, kartuKotor]);

  function ubah(patch: Partial<DataFormStimulus>) {
    setForm((f) => ({ ...f, ...patch }));
    setErrorServer([]);
    // Subtes bacaan baru berganti: kartu soal yang belum tersimpan ikut.
    if (patch.subtes_id !== undefined) {
      const subtes_id = patch.subtes_id;
      setKartuSoal((l) => l.map((k) => (k.jejakTersimpan === null ? { ...k, form: { ...k.form, subtes_id } } : k)));
    }
  }
  function ubahBlok(fn: (b: BlokStimulus[]) => BlokStimulus[]) {
    setForm((f) => ({ ...f, konten: { v: 1, blok: fn(f.konten.blok) } }));
    setErrorServer([]);
  }

  // ---------------------------------------------------------------- kartu soal
  const ubahKartu = (kid: string, fn: (k: KartuSoal) => KartuSoal) => setKartuSoal((l) => l.map((k) => (k.id === kid ? fn(k) : k)));
  const setFormKartu = (kid: string) => (aksi: SetStateAction<DataFormSoal>) =>
    ubahKartu(kid, (k) => ({ ...k, form: typeof aksi === "function" ? aksi(k.form) : aksi }));
  const tambahKartu = () =>
    setKartuSoal((l) => [...l.map((k) => ({ ...k, terbuka: false })), kartuBaru(uuidBaru(), form.subtes_id, id)]);

  // ---------------------------------------------------------------- aksi
  /** Simpan bacaan (bila berubah) lalu soal satu per satu. true = semua tersimpan. */
  async function simpan(): Promise<boolean> {
    if (sibukRef.current) return false;
    if (!form.subtes_id) {
      setPesan({ jenis: "gagal", teks: "Pilih subtes dulu sebelum menyimpan." });
      return false;
    }
    const perluBacaan = bolehEdit && (kotor || !sudahDisimpan);
    if (perluBacaan && errorsBentuk.length > 0) {
      setPesan({ jenis: "gagal", teks: "Ada isian bacaan yang ditandai merah. Betulkan dulu, lalu simpan." });
      return false;
    }
    sibukRef.current = true;
    setSibuk("simpan");
    const jejakBacaan = JSON.stringify(form);
    const h = await simpanSemua({
      bacaan: { id, form, perlu: perluBacaan },
      kartu: kartuSoal,
      soalBolehEdit,
      put: (url, body) => panggilApi(url, "PUT", body),
      saatProses: (ke, dari) => setProses({ ke, dari }),
    });
    sibukRef.current = false;
    setSibuk(null);
    setProses(null);

    if (typeof h.bacaan === "object") {
      setErrorServer(h.bacaan.errors);
    } else if (h.bacaan === "tersimpan") {
      setJejakTersimpan(jejakBacaan);
      if (!sudahDisimpan) {
        setSudahDisimpan(true);
        window.history.replaceState(null, "", `/studio-soal/stimulus/${id}`);
      }
    }
    setKartuSoal((l) => terapkanHasilSimpan(l, h, { id, subtes_id: form.subtes_id }));
    const ringkas = ringkasSimpanSemua(h);
    setPesan({ jenis: ringkas.ok ? "ok" : "gagal", teks: ringkas.teks });
    return ringkas.ok;
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
      setPesan({ jenis: "gagal", teks: `Masih ada ${errorsAjukan.length} hal di bacaan yang perlu dilengkapi (ditandai merah).` });
      return;
    }
    const belumLengkap = kartuSoal
      .map((k, i) => ({ k, nomor: i + 1 }))
      .filter(({ k }) => bisaDiubah(k.status) && keadaanKartu(k) !== "kosong" && cekKartuUntukKirim(k.form, kategori).length > 0);
    if (belumLengkap.length > 0) {
      const ids = new Set(belumLengkap.map((x) => x.k.id));
      setKartuSoal((l) => l.map((k) => (ids.has(k.id) ? { ...k, terbuka: true } : k)));
      setPesan({
        jenis: "gagal",
        teks: `Soal ${belumLengkap.map((x) => x.nomor).join(", ")} belum lengkap. Lengkapi yang ditandai merah, lalu kirim lagi.`,
      });
      return;
    }
    if (!(await simpan())) return;
    const r = await jalankan("ajukan", `/api/studio-soal/stimulus/${id}/ajukan`, "POST");
    if (!r.ok) {
      setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Bacaan belum terkirim. Coba lagi.") });
      setErrorServer(Array.isArray(r.json.errors) ? (r.json.errors as ErrorValidasi[]) : []);
      const perSoal = new Map(
        (Array.isArray(r.json.errorsSoal) ? (r.json.errorsSoal as ErrorSoalKelompok[]) : []).map((e) => [e.soalId, e.errors]),
      );
      setKartuSoal((l) =>
        l.map((k) => {
          const errors = perSoal.get(k.id);
          return errors
            ? { ...k, terbuka: true, hasil: { ok: false, alasan: `${errors.length} hal perlu diperbaiki sebelum dikirim.`, errors } }
            : k;
        }),
      );
      return;
    }
    setStatus("diajukan");
    setSudahPernahDiajukan(true);
    setKartuSoal((l) => l.map((k) => (k.jejakTersimpan !== null && bisaDiubah(k.status) ? { ...k, status: "diajukan" } : k)));
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Bacaan dan soalnya sudah dikirim untuk dicek.") });
    router.refresh();
  }

  async function tarik() {
    if (sibukRef.current) return;
    const r = await jalankan("tarik", `/api/studio-soal/stimulus/${id}/tarik`, "POST");
    if (!r.ok) return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Kiriman belum dibatalkan. Coba lagi.") });
    setStatus("draf");
    setKartuSoal((l) => l.map((k) => (k.status === "diajukan" ? { ...k, status: "draf" } : k)));
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Kiriman dibatalkan.") });
    router.refresh();
  }

  async function versiBaru() {
    if (sibukRef.current) return;
    const r = await jalankan("versi", `/api/studio-soal/stimulus/${id}/versi-baru`, "POST");
    if (!r.ok) return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Versi baru belum dibuat. Coba lagi.") });
    router.push(`/studio-soal/stimulus/${String(r.json.id)}`);
  }

  const soalTersimpan = kartuSoal.filter((k) => k.jejakTersimpan !== null).length;
  const soalAkanDikirim = kartuSoal.filter((k) => bisaDiubah(k.status) && keadaanKartu(k) !== "kosong").length;
  const adaYangBisaDisimpan = bolehEdit || soalBolehEdit;

  return (
    <div className="flex flex-col gap-4 pb-24 sm:gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/studio-soal" className="w-fit text-sm text-primary hover:underline">
          ← Studio Soal
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-medium text-black sm:text-2xl">
            {baru && !sudahDisimpan ? "Buat soal dengan bacaan" : "Soal dengan bacaan"}
          </h1>
          <span className={CHIP}>{LABEL_STATUS[status] ?? status}</span>
          {versi > 1 ? <span className="text-xs text-muted">versi {versi}</span> : null}
        </div>
        <p className="text-sm text-muted">
          Tulis bacaan atau tabelnya di atas, lalu soal-soalnya di bawah. Tekan “Simpan semua” untuk menyimpan bacaan dan semua
          soal sekaligus. Bacaan dan soal-soalnya dikirim dan dicek bersama.
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
          Bacaan sudah terbit. Anda masih bisa menambah soal baru ke dalamnya — soal baru dikirim satu per satu dari halaman
          soalnya. Untuk mengubah isi bacaannya, buat versi baru.
        </Banner>
      ) : null}

      {pesan ? (
        <div role={pesan.jenis === "gagal" ? "alert" : "status"} className={pesanKelas(pesan.jenis)}>
          {pesan.teks}
        </div>
      ) : null}

      {/* ---- Bacaan ---- */}
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
            {t === "tulis" ? "Tulis bacaan" : "Pratinjau bacaan"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={["flex min-w-0 flex-col gap-4", tab === "tulis" ? "" : "hidden lg:flex"].join(" ")}>
          <IsianStimulus
            form={form}
            ubah={ubah}
            ubahBlok={ubahBlok}
            bolehEdit={bolehEdit}
            sudahDisimpan={sudahDisimpan}
            subtesPilihan={subtesPilihan}
            peta={peta}
          />

          {tampilSemua && errorsAjukan.length > 0 ? (
            <section className="flex flex-col gap-2 rounded-[20px] border border-danger-line bg-danger-soft p-4">
              <p className="text-sm font-medium text-danger">Yang perlu dilengkapi di bacaan sebelum dikirim:</p>
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
            <h2 className="text-base font-medium text-black">Pratinjau bacaan</h2>
            <StimulusPratinjau blok={blok} />
            {form.sumber_rujukan.trim() ? <p className="text-xs text-muted">Sumber: {form.sumber_rujukan}</p> : null}
          </div>
        </aside>
      </div>

      {/* ---- Soal untuk bacaan ini ---- */}
      <section className="flex flex-col gap-3" aria-labelledby="judul-soal-bacaan">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="judul-soal-bacaan" className="text-lg font-medium text-black">
            Soal untuk bacaan ini
          </h2>
          <span className="text-xs text-muted">
            {kartuSoal.length} soal{soalTersimpan < kartuSoal.length ? ` · ${soalTersimpan} tersimpan` : ""}
          </span>
        </div>
        {kartuSoal.length === 0 ? (
          <p className="text-sm text-muted">Belum ada soal. Tambahkan minimal 1 soal sebelum dikirim.</p>
        ) : null}
        {kartuSoal.map((k, i) => (
          <KartuSoalBacaan
            key={k.id}
            nomor={i + 1}
            kartu={k}
            setForm={setFormKartu(k.id)}
            onUbah={() => ubahKartu(k.id, (x) => (x.hasil ? { ...x, hasil: null } : x))}
            onBukaTutup={() => ubahKartu(k.id, (x) => ({ ...x, terbuka: !x.terbuka }))}
            onHapus={k.jejakTersimpan === null ? () => setKartuSoal((l) => l.filter((x) => x.id !== k.id)) : undefined}
            bolehEdit={soalBolehEdit && bisaDiubah(k.status) && sibuk === null}
            tampilSemua={tampilSemua}
            subtesPilihan={subtesPilihan}
            kategori={kategori}
            bacaanBlok={blok}
          />
        ))}
        {soalBolehEdit ? (
          <Button variant="secondary" size="sm" className="w-fit" onClick={tambahKartu} disabled={sibuk !== null}>
            + Tambah soal
          </Button>
        ) : null}
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-[16px] lg:border">
        {adaYangBisaDisimpan ? (
          <Button variant="secondary" size="sm" onClick={simpan} disabled={sibuk !== null}>
            {sibuk === "simpan" ? (proses ? `Menyimpan ${proses.ke} dari ${proses.dari}…` : "Menyimpan…") : "Simpan semua"}
          </Button>
        ) : null}
        {bolehEdit ? (
          <Button
            size="sm"
            onClick={ajukan}
            disabled={sibuk !== null || soalAkanDikirim === 0}
            title={soalAkanDikirim === 0 ? "Tambahkan minimal 1 soal dulu" : undefined}
          >
            {sibuk === "ajukan" ? "Mengirim…" : `Kirim bacaan + ${soalAkanDikirim} soal untuk dicek`}
          </Button>
        ) : null}
        {adaYangBisaDisimpan ? (
          <span className={["text-xs", (kotor && bolehEdit) || kartuKotor ? "text-amber-700" : "text-muted"].join(" ")}>
            {(kotor && bolehEdit) || kartuKotor ? "Ada perubahan belum disimpan" : "Semua perubahan tersimpan"}
          </span>
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
              jumlahSoal: soalTersimpan,
            })}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Isian bacaan (subtes, judul, sumber, blok teks/tabel) TANPA bilah simpan.
 * `idAwalan` membuat id elemen unik bila dipakai lebih dari sekali per halaman.
 */
export function IsianStimulus({
  form,
  ubah,
  ubahBlok,
  bolehEdit,
  sudahDisimpan,
  subtesPilihan,
  peta,
  idAwalan = "",
}: {
  form: DataFormStimulus;
  ubah: (patch: Partial<DataFormStimulus>) => void;
  ubahBlok: (fn: (b: BlokStimulus[]) => BlokStimulus[]) => void;
  bolehEdit: boolean;
  sudahDisimpan: boolean;
  subtesPilihan: SubtesPilihan[];
  peta: Map<string, string[]>;
  idAwalan?: string;
}) {
  const blok = form.konten.blok;
  const subtesNama = subtesPilihan.find((s) => s.id === form.subtes_id)?.nama;
  const gantiBlok = (i: number, b: BlokStimulus) => ubahBlok((l) => l.map((x, j) => (j === i ? b : x)));
  const geser = (i: number, arah: -1 | 1) =>
    ubahBlok((l) => {
      const j = i + arah;
      if (j < 0 || j >= l.length) return l;
      const salin = [...l];
      [salin[i], salin[j]] = [salin[j], salin[i]];
      return salin;
    });

  return (
    <>
      <section className={kartu}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idAwalan}subtes`} className="text-sm font-medium text-black">
            Subtes <span className="text-danger">*</span>
          </label>
          {sudahDisimpan ? (
            <p className="text-sm text-black">{subtesNama ?? "Subtes tidak dikenal"}</p>
          ) : (
            <SelectField
              id={`${idAwalan}subtes`}
              size="md"
              value={form.subtes_id}
              onChange={(e) => ubah({ subtes_id: e.target.value })}
              placeholder="Pilih subtes yang ditugaskan"
              options={subtesPilihan.map((s) => ({ value: s.id, label: s.nama }))}
            />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idAwalan}judul`} className="text-sm font-medium text-black">
            Judul bacaan <span className="text-danger">*</span>
          </label>
          <InputField
            type="text"
            size="md"
            id={`${idAwalan}judul`}
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
          <label htmlFor={`${idAwalan}sumber`} className="text-sm font-medium text-black">
            Sumber bacaan <span className="text-danger">*</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <InputField
              type="text"
              size="md"
              id={`${idAwalan}sumber`}
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
                id={`${idAwalan}blok-${i}`}
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
    </>
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
