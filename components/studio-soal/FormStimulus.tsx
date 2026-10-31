"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode, type SetStateAction } from "react";
import Button from "@/components/ui/Button";
import MaskotLoading from "@/components/ui/MaskotLoading";
import TeksSibuk from "@/components/ui/TeksSibuk";
import InputField from "@/components/ui/InputField";
import SelectField from "@/components/ui/SelectField";
import KartuSoalBacaan, { cekKartuUntukKirim, type AksiKartu, type JenisAksiKartu } from "@/components/studio-soal/KartuSoalBacaan";
import BilahAksi, { KELAS_TOMBOL_BILAH } from "@/components/studio-soal/BilahAksi";
import { IkonChevron, IkonTongSampah } from "@/components/studio-soal/Ikon";
import SoalPratinjau from "@/components/studio-soal/SoalPratinjau";
import TabTulisPratinjau, { type TabForm } from "@/components/studio-soal/TabTulisPratinjau";
import PenjagaKeluar from "@/components/studio-soal/PenjagaKeluar";
import { useNavigasiSibuk } from "@/components/studio-soal/useNavigasiSibuk";
import StimulusPratinjau from "@/components/studio-soal/StimulusPratinjau";
import TombolHapusDraf from "@/components/studio-soal/TombolHapusDraf";
import { KARTU, CHIP, KOLOM_PRATINJAU, TOMBOL_KECIL, inputKecil, pesanKelas, tombolIkon } from "@/components/studio-soal/gaya";
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
  type FormSoal as DataFormSoal,
  type FormStimulus as DataFormStimulus,
} from "@/lib/shared/studio-soal/formSoal";
import { alasanTidakBisaHapus, tampilkanTombolHapus } from "@/lib/shared/studio-soal/hapusDraf";
import { cekBacaanLengkap, daftarBelumLengkap, type SoalKurang } from "@/lib/shared/studio-soal/kelengkapan";
import { formBerubah } from "@/lib/shared/studio-soal/peringatanKeluar";
import type { BlokStimulus, BlokTabel } from "@/lib/shared/studio-soal/tipe";
import type { ErrorValidasi } from "@/lib/shared/studio-soal/validasi";
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
  /** Pernah dikirim untuk dicek -> draf tidak bisa dihapus. */
  pernahDiajukan?: boolean;
}

interface ErrorSoalKelompok {
  soalId: string;
  urutan: number | null;
  errors: ErrorValidasi[];
}

const kartu = KARTU;
const inputKelas = inputKecil;
const tombolKecil = TOMBOL_KECIL;

/** Aksi halaman, atau aksi satu kartu soal ("soal-kirim:<id>", dst.). */
type Sibuk = null | "simpan" | "ajukan" | "tarik" | "versi" | "hapus" | `soal-${"kirim" | "tarik" | "versi"}:${string}`;

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
  const { jenisPindah, pindah } = useNavigasiSibuk<Exclude<Sibuk, null>>();
  const [form, setForm] = useState<DataFormStimulus>(awal);
  const [status, setStatus] = useState(statusAwal);
  const [sudahDisimpan, setSudahDisimpan] = useState(!baru);
  const [jejakTersimpan, setJejakTersimpan] = useState<string | null>(baru ? null : JSON.stringify(awal));
  const [sibukAksi, setSibuk] = useState<Sibuk>(null);
  // Sibuk = aksi sedang berjalan ATAU halaman berikutnya masih dimuat (UX-4).
  const sibuk: Sibuk = jenisPindah ?? sibukAksi;
  const sibukRef = useRef(false);
  const [proses, setProses] = useState<{ ke: number; dari: number } | null>(null);
  /** Pesan hasil aksi; `daftar` = rincian (mis. per soal yang belum lengkap). */
  const [pesan, setPesanState] = useState<{ jenis: "ok" | "gagal"; teks: string; daftar?: string[] } | null>(null);
  const pesanRef = useRef<HTMLDivElement | null>(null);
  /** Tampilkan pesan dan gulir ke sana (tombol ada di bilah bawah, pesannya di atas). */
  const setPesan = (p: { jenis: "ok" | "gagal"; teks: string; daftar?: string[] } | null) => {
    setPesanState(p);
    if (p) requestAnimationFrame(() => pesanRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const [errorServer, setErrorServer] = useState<ErrorValidasi[]>([]);
  const [tampilSemua, setTampilSemua] = useState(false);
  const [tab, setTab] = useState<TabForm>("tulis");
  /** Kartu soal yang terakhir dibuka/difokus — pratinjaunya tampil di kolom kanan. */
  const [idAktif, setIdAktif] = useState<string | null>(idKartuBaru ?? null);
  // Pernah diajukan di sesi ini -> tidak bisa dihapus lagi (DB juga menolak).
  const [sudahPernahDiajukan, setSudahPernahDiajukan] = useState(pernahDiajukan);
  const [kartuSoal, setKartuSoal] = useState<KartuSoal[]>(() => {
    const ada: KartuSoal[] = soal.map((s) => ({
      id: s.id,
      form: s.form,
      status: s.status,
      versi: s.versi,
      alasanTolak: s.alasanTolak,
      pernahDiajukan: s.pernahDiajukan ?? false,
      jejakTersimpan: jejak(s.form),
      terbuka: false,
      hasil: null,
    }));
    return idKartuBaru ? [...ada, kartuBaru(idKartuBaru, awal.subtes_id, id)] : ada;
  });

  const bolehEdit = isBolehEdit(status) && ditugaskan;
  const soalBolehEdit = ditugaskan && bacaanBolehTambahSoal(status);
  const kategori = subtesPilihan.find((s) => s.id === form.subtes_id)?.kategori;
  const jejakForm = JSON.stringify(form);
  const jejakAwal = useMemo(() => JSON.stringify(awal), [awal]);
  /** Bacaan belum sama dengan yang tersimpan di server (bacaan baru: selalu perlu disimpan). */
  const kotor = jejakTersimpan !== jejakForm;
  // Kartu soal: setiap kartu yang sudah diisi tapi belum tersimpan (isi soal, tabel, rumus — semua lewat form kartu).
  const kartuKotor = soalBolehEdit && kartuSoal.some((k) => keadaanKartu(k) === "belum");
  // Untuk peringatan & status: bacaan baru yang belum disentuh tidak dihitung berubah.
  const adaPerubahan = (bolehEdit && formBerubah({ jejakTersimpan, jejakAwal, jejakSekarang: jejakForm })) || kartuKotor;
  const blok = form.konten.blok;

  const errorsAjukan = useMemo(() => cekBacaanLengkap(form, kategori), [form, kategori]);
  const errorsBentuk = errorsAjukan.filter((e) => e.jenis === "bentuk");
  const peta = petaError([...(tampilSemua ? errorsAjukan : errorsBentuk), ...errorServer]);

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
  const tambahKartu = () => {
    const idBaru = uuidBaru();
    setKartuSoal((l) => [...l.map((k) => ({ ...k, terbuka: false })), kartuBaru(idBaru, form.subtes_id, id)]);
    setIdAktif(idBaru);
  };

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
    if (soalAkanDikirim === 0) {
      setPesan({ jenis: "gagal", teks: "Belum ada soal untuk dikirim. Tambahkan minimal 1 soal dulu." });
      return;
    }
    // Validasi lengkap di browser lebih dulu (aturan sama dengan API Ajukan):
    // bacaan + SEMUA kartu soal yang ikut terkirim. Kartu kosong juga dihitung
    // supaya tidak ada kartu yang diam-diam tertinggal.
    const kurangSoal: (SoalKurang & { id: string })[] = kartuSoal
      .map((k, i) => ({ k, nomor: i + 1 }))
      .filter(({ k }) => bisaDiubah(k.status))
      .map(({ k, nomor }) =>
        keadaanKartu(k) === "kosong"
          ? { id: k.id, nomor, errors: [], kosong: true }
          : { id: k.id, nomor, errors: cekKartuUntukKirim(k.form, kategori) },
      )
      .filter((x) => x.kosong || x.errors.length > 0);
    const daftar = daftarBelumLengkap({ bacaan: errorsAjukan, soal: kurangSoal });
    if (daftar.length > 0) {
      const ids = new Set(kurangSoal.map((x) => x.id));
      setKartuSoal((l) => l.map((k) => (ids.has(k.id) ? { ...k, terbuka: true } : k)));
      setPesan({ jenis: "gagal", teks: "Belum bisa dikirim. Lengkapi dulu yang ditandai merah:", daftar });
      return;
    }
    if (!(await simpan())) return;
    const r = await jalankan("ajukan", `/api/studio-soal/stimulus/${id}/ajukan`, "POST");
    if (!r.ok) {
      const errorsBacaan = Array.isArray(r.json.errors) ? (r.json.errors as ErrorValidasi[]) : [];
      setErrorServer(errorsBacaan);
      const perSoal = new Map(
        (Array.isArray(r.json.errorsSoal) ? (r.json.errorsSoal as ErrorSoalKelompok[]) : []).map((e) => [e.soalId, e.errors]),
      );
      // Server tetap pemutus akhir (mis. isi berubah di tab lain): sebut soal & masalahnya.
      const daftarServer = daftarBelumLengkap({
        bacaan: errorsBacaan,
        soal: kartuSoal.flatMap((k, i) => (perSoal.has(k.id) ? [{ nomor: i + 1, errors: perSoal.get(k.id) ?? [] }] : [])),
      });
      setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Bacaan belum terkirim. Coba lagi."), daftar: daftarServer });
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
    pindah("ajukan", (rt) => rt.refresh());
  }

  async function tarik() {
    if (sibukRef.current) return;
    const r = await jalankan("tarik", `/api/studio-soal/stimulus/${id}/tarik`, "POST");
    if (!r.ok) return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Kiriman belum dibatalkan. Coba lagi.") });
    setStatus("draf");
    setKartuSoal((l) => l.map((k) => (k.status === "diajukan" ? { ...k, status: "draf" } : k)));
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Kiriman dibatalkan.") });
    pindah("tarik", (rt) => rt.refresh());
  }

  async function versiBaru() {
    if (sibukRef.current) return;
    const r = await jalankan("versi", `/api/studio-soal/stimulus/${id}/versi-baru`, "POST");
    if (!r.ok) return setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Versi baru belum dibuat. Coba lagi.") });
    pindah("versi", (rt) => rt.push(`/studio-soal/stimulus/${String(r.json.id)}`));
  }

  // ---------------------------------------------------------------- aksi per soal
  // Dulu hanya ada di halaman soal; sekarang langsung di kartu (revisi UX-3).

  /** Kirim satu soal sendiri — hanya untuk soal di bacaan yang sudah terbit. */
  async function kirimSoal(kid: string) {
    if (sibukRef.current) return;
    const nomor = kartuSoal.findIndex((k) => k.id === kid) + 1;
    const k = kartuSoal[nomor - 1];
    if (!k) return;
    setTampilSemua(true);
    const daftar = daftarBelumLengkap({ soal: [{ nomor, errors: cekKartuUntukKirim(k.form, kategori) }] });
    if (daftar.length > 0) {
      ubahKartu(kid, (x) => ({ ...x, terbuka: true }));
      setPesan({ jenis: "gagal", teks: "Belum bisa dikirim. Lengkapi dulu yang ditandai merah:", daftar });
      return;
    }
    if (keadaanKartu(k) === "belum" && !(await simpan())) return;
    const r = await jalankan(`soal-kirim:${kid}`, `/api/studio-soal/soal/${kid}/ajukan`, "POST");
    if (!r.ok) {
      const errorsServer = Array.isArray(r.json.errors) ? (r.json.errors as ErrorValidasi[]) : [];
      const alasan = String(r.json.error ?? "Soal belum terkirim. Coba lagi.");
      ubahKartu(kid, (x) => ({ ...x, terbuka: true, hasil: { ok: false, alasan, errors: errorsServer } }));
      setPesan({ jenis: "gagal", teks: `Soal ${nomor}: ${alasan}` });
      return;
    }
    ubahKartu(kid, (x) => ({ ...x, status: "diajukan", pernahDiajukan: true, hasil: null }));
    setPesan({ jenis: "ok", teks: `Soal ${nomor} sudah dikirim untuk dicek.` });
  }

  /** Batalkan kirim satu soal (yang dikirim sendiri, bukan bersama bacaannya). */
  async function tarikSoal(kid: string) {
    if (sibukRef.current) return;
    const nomor = kartuSoal.findIndex((k) => k.id === kid) + 1;
    const r = await jalankan(`soal-tarik:${kid}`, `/api/studio-soal/soal/${kid}/tarik`, "POST");
    if (!r.ok) {
      setPesan({ jenis: "gagal", teks: `Soal ${nomor}: ${String(r.json.error ?? "Kiriman belum dibatalkan. Coba lagi.")}` });
      return;
    }
    ubahKartu(kid, (x) => ({ ...x, status: "draf" }));
    setPesan({ jenis: "ok", teks: `Kiriman soal ${nomor} dibatalkan. Soalnya bisa diubah lagi.` });
  }

  /** Versi baru dari soal yang sudah terbit: salinan draf muncul sebagai kartu baru tepat di bawahnya. */
  async function versiBaruSoal(kid: string) {
    if (sibukRef.current) return;
    const nomor = kartuSoal.findIndex((k) => k.id === kid) + 1;
    const r = await jalankan(`soal-versi:${kid}`, `/api/studio-soal/soal/${kid}/versi-baru`, "POST");
    if (!r.ok || typeof r.json.id !== "string") {
      setPesan({ jenis: "gagal", teks: `Soal ${nomor}: ${String(r.json.error ?? "Versi baru belum dibuat. Coba lagi.")}` });
      return;
    }
    const idBaru = r.json.id;
    setKartuSoal((l) =>
      l.flatMap((k) =>
        k.id !== kid
          ? [k]
          : [
              { ...k, terbuka: false },
              {
                id: idBaru,
                form: k.form,
                status: "draf",
                versi: k.versi + 1,
                alasanTolak: null,
                pernahDiajukan: false,
                jejakTersimpan: jejak(k.form),
                terbuka: true,
                hasil: null,
              },
            ],
      ),
    );
    setPesan({
      jenis: "ok",
      teks: `Versi baru soal ${nomor} dibuat sebagai draf tepat di bawahnya. Versi yang terbit tetap dipakai sampai versi baru lolos dicek.`,
    });
  }

  /** Tombol aksi & keterangan untuk satu kartu yang sudah tersimpan. */
  function aksiKartu(k: KartuSoal): { aksi: AksiKartu[]; catatan?: string } {
    if (k.jejakTersimpan === null || !ditugaskan) return { aksi: [] };
    const aksi: AksiKartu[] = [];
    if (status === "terpublikasi" && bisaDiubah(k.status)) {
      aksi.push({ jenis: "kirim", label: "Kirim soal ini untuk dicek", labelSibuk: "Mengirim…", sibuk: sibuk === `soal-kirim:${k.id}`, utama: true });
    }
    if (k.status === "diajukan" && status !== "diajukan") {
      aksi.push({ jenis: "tarik", label: "Batalkan kirim", labelSibuk: "Membatalkan…", sibuk: sibuk === `soal-tarik:${k.id}` });
    }
    if (k.status === "terpublikasi" && status === "terpublikasi") {
      aksi.push({ jenis: "versi", label: "Buat versi baru", labelSibuk: "Membuat…", sibuk: sibuk === `soal-versi:${k.id}` });
    }
    let catatan: string | undefined;
    if (k.status === "diajukan") {
      catatan = status === "diajukan" ? "Sedang dicek bersama bacaannya, jadi hanya bisa dilihat." : "Sedang dicek, jadi hanya bisa dilihat.";
    } else if (k.status === "terpublikasi") {
      catatan = status === "terpublikasi" ? "Sudah terbit, jadi hanya bisa dilihat. Buat versi baru untuk mengubahnya." : "Sudah terbit, jadi hanya bisa dilihat.";
    }
    return { aksi, catatan };
  }

  function aksiSoal(kid: string, jenis: JenisAksiKartu) {
    if (jenis === "kirim") return kirimSoal(kid);
    if (jenis === "tarik") return tarikSoal(kid);
    return versiBaruSoal(kid);
  }

  const soalTersimpan = kartuSoal.filter((k) => k.jejakTersimpan !== null).length;
  const soalAkanDikirim = kartuSoal.filter((k) => bisaDiubah(k.status) && keadaanKartu(k) !== "kosong").length;
  const adaYangBisaDisimpan = bolehEdit || soalBolehEdit;

  // Pratinjau di kolom kanan (layar besar): bacaan + soal yang sedang dikerjakan.
  const kartuAktif = kartuSoal.find((k) => k.id === idAktif && k.terbuka) ?? kartuSoal.find((k) => k.terbuka) ?? null;
  const nomorAktif = kartuAktif ? kartuSoal.indexOf(kartuAktif) + 1 : 0;
  const pratinjauBacaan = (
    <>
      <StimulusPratinjau blok={blok} />
      {form.sumber_rujukan.trim() ? <p className="text-xs text-muted">Sumber: {form.sumber_rujukan}</p> : null}
    </>
  );

  return (
    <div className="flex flex-col gap-4 pb-24 sm:gap-5">
      <PenjagaKeluar adaPerubahan={adaPerubahan} />
      {/* Dua kolom di layar besar: kiri judul + bacaan + kartu soal, kanan pratinjau
          yang menempel (mulai sejajar judul). Di HP satu kolom, pratinjau lewat tab. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
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
              Tulis bacaan atau tabelnya di atas, lalu soal-soalnya di bawah. Tekan “Simpan” untuk menyimpan bacaan dan semua soal
              sekaligus (boleh belum lengkap). Bacaan dan soal-soalnya dikirim dan dicek bersama.
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
              Bacaan sudah terbit. Anda masih bisa menambah soal baru ke dalamnya — soal baru dikirim satu per satu lewat tombol
              “Kirim soal ini untuk dicek” di kartunya. Untuk mengubah isi bacaannya, buat versi baru.
            </Banner>
          ) : null}

          {pesan ? (
            <div ref={pesanRef} role={pesan.jenis === "gagal" ? "alert" : "status"} className={pesanKelas(pesan.jenis)}>
              <p>{pesan.teks}</p>
              {pesan.daftar && pesan.daftar.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {pesan.daftar.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* ---- Bacaan ---- */}
          <TabTulisPratinjau tab={tab} setTab={setTab} label={{ tulis: "Tulis bacaan", pratinjau: "Pratinjau bacaan" }} />

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

          {tab === "pratinjau" ? (
            <section className={`${kartu} lg:hidden`}>
              <h2 className="text-base font-medium text-black">Pratinjau bacaan</h2>
              {pratinjauBacaan}
            </section>
          ) : null}

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
                onBukaTutup={() => {
                  if (!k.terbuka) setIdAktif(k.id);
                  ubahKartu(k.id, (x) => ({ ...x, terbuka: !x.terbuka }));
                }}
                onAktif={() => setIdAktif(k.id)}
                onBuang={k.jejakTersimpan === null ? () => setKartuSoal((l) => l.filter((x) => x.id !== k.id)) : undefined}
                hapusDraf={
                  k.jejakTersimpan !== null && tampilkanTombolHapus(k.status)
                    ? {
                        alasan: alasanTidakBisaHapus("soal", { status: k.status, pernahDiajukan: k.pernahDiajukan, ditugaskan }),
                        onTerhapus: () => setKartuSoal((l) => l.filter((x) => x.id !== k.id)),
                      }
                    : undefined
                }
                {...aksiKartu(k)}
                onAksi={(jenis) => aksiSoal(k.id, jenis)}
                terkunci={sibuk !== null}
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
        </div>

        <aside className={["hidden min-w-0 flex-col gap-4 lg:flex", KOLOM_PRATINJAU].join(" ")} aria-label="Pratinjau">
          <details open className={`${kartu} group`}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
              <h2 className="text-base font-medium text-black">Pratinjau bacaan</h2>
              <IkonChevron className="size-5 shrink-0 transition-transform duration-150 group-open:rotate-180" />
            </summary>
            <div className="mt-4 flex flex-col gap-4">{pratinjauBacaan}</div>
          </details>
          {kartuAktif ? (
            <section className={kartu} aria-label={`Pratinjau soal ${nomorAktif}`}>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-medium text-black">Pratinjau soal {nomorAktif}</h2>
                <span className="text-xs text-muted">Tampilan seperti yang dilihat siswa</span>
              </div>
              {/* key: hasil "uji kunci jawaban" tidak terbawa ke soal lain. */}
              <SoalPratinjau key={kartuAktif.id} soal={kartuAktif.form} stimulus={null} />
            </section>
          ) : kartuSoal.length > 0 ? (
            <p className="rounded-[20px] border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
              Buka salah satu soal untuk melihat pratinjau dan menguji kunci jawabannya di sini.
            </p>
          ) : null}
        </aside>
      </div>

      <BilahAksi
        keterangan={
          sibuk === "simpan" && proses ? (
            <span className="inline-flex items-center gap-1.5 text-black">
              <MaskotLoading size="xs" />
              Menyimpan {proses.ke} dari {proses.dari}…
            </span>
          ) : adaYangBisaDisimpan || bolehEdit ? (
            <>
              {bolehEdit ? <span>Bacaan + {soalAkanDikirim} soal · </span> : null}
              {adaYangBisaDisimpan ? (
                <span className={adaPerubahan ? "text-amber-700" : undefined}>
                  {adaPerubahan ? "Ada perubahan belum disimpan" : sudahDisimpan ? "Semua perubahan tersimpan" : "Belum disimpan"}
                </span>
              ) : null}
            </>
          ) : null
        }
        hapus={
          sudahDisimpan && tampilkanTombolHapus(status) ? (
            <TombolHapusDraf
              objek="stimulus"
              id={id}
              versi={versi}
              sesudahHapus="/studio-soal"
              alasan={alasanTidakBisaHapus("stimulus", {
                status,
                pernahDiajukan: sudahPernahDiajukan,
                ditugaskan,
                jumlahSoal: soalTersimpan,
              })}
            />
          ) : null
        }
      >
        {adaYangBisaDisimpan ? (
          <Button variant="secondary" size="sm" className={KELAS_TOMBOL_BILAH} onClick={simpan} disabled={sibuk !== null}
            aria-busy={sibuk === "simpan"}>
            <TeksSibuk sibuk={sibuk === "simpan"} teks="Menyimpan…">
              Simpan
            </TeksSibuk>
          </Button>
        ) : null}
        {bolehEdit ? (
          <Button
            size="sm"
            className={KELAS_TOMBOL_BILAH}
            onClick={ajukan}
            disabled={sibuk !== null}
            aria-busy={sibuk === "ajukan"}
            title={`Kirim bacaan dan ${soalAkanDikirim} soalnya untuk dicek`}
          >
            <TeksSibuk sibuk={sibuk === "ajukan"} teks="Mengirim…">
              Kirim untuk dicek
            </TeksSibuk>
          </Button>
        ) : null}
        {status === "diajukan" && ditugaskan ? (
          <Button variant="secondary" size="sm" className={KELAS_TOMBOL_BILAH} onClick={tarik} disabled={sibuk !== null}
            aria-busy={sibuk === "tarik"}>
            <TeksSibuk sibuk={sibuk === "tarik"} teks="Membatalkan…">
              Batalkan kirim
            </TeksSibuk>
          </Button>
        ) : null}
        {status === "terpublikasi" && ditugaskan ? (
          <Button size="sm" className={KELAS_TOMBOL_BILAH} onClick={versiBaru} disabled={sibuk !== null}
            aria-busy={sibuk === "versi"}>
            <TeksSibuk sibuk={sibuk === "versi"} teks="Membuat…">
              Versi baru bacaan
            </TeksSibuk>
          </Button>
        ) : null}
      </BilahAksi>
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
                <div className="ml-auto flex gap-0.5">
                  <button
                    type="button"
                    aria-label={`Geser bagian ${i + 1} ke atas`}
                    title="Geser ke atas"
                    disabled={i === 0}
                    onClick={() => geser(i, -1)}
                    className={tombolIkon()}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Geser bagian ${i + 1} ke bawah`}
                    title="Geser ke bawah"
                    disabled={i === blok.length - 1}
                    onClick={() => geser(i, 1)}
                    className={tombolIkon()}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Hapus bagian ${i + 1} (${b.jenis === "teks" ? "teks" : "tabel"})`}
                    title="Hapus bagian ini"
                    onClick={() => ubahBlok((l) => l.filter((_, j) => j !== i))}
                    className={tombolIkon(true)}
                  >
                    <IkonTongSampah />
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
