"use client";

import { useId, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Toggle from "@/components/ui/Toggle";
import { CHIP, KARTU, pesanKelas } from "@/components/studio-soal/gaya";
import type { BarisPratinjau, GalatImpor, StatusBaris } from "@/lib/shared/studio-soal/impor";

/**
 * Unggah Soal "Buatan Sendiri" (Admin): unduh template → unggah Word (.docx,
 * jalur utama) atau CSV (Lanjutan) → pratinjau galat per soal → simpan sebagai
 * DRAF → terbitkan oleh Admin.
 *
 * Semua pemeriksaan dilakukan server (rute /api/admin/studio-soal/impor/*);
 * layar ini hanya menampilkan hasilnya. Kunci jawaban hanya muncul di layar
 * Admin ini. Hanya soal teks + rumus \( \): gambar, persamaan Word,
 * majemuk kompleks, XLSX, dan PDF belum didukung.
 */

interface BerkasCsv {
  nama: string;
  teks: string;
}
interface BerkasWord {
  nama: string;
  file: File;
}
interface Pratinjau {
  ringkasan: { jumlahBaris: number; jumlahOk: number; jumlahGalat: number; jumlahPeringatan: number; jumlahBacaan: number };
  pratinjau: BarisPratinjau[];
  galat: GalatImpor[];
  peringatan: GalatImpor[];
  galatTerpotong: boolean;
  bisaSimpan: boolean;
  bisaSimpanLewatiGalat: boolean;
  alasanTidakBisa: string | null;
}
interface HasilSimpan {
  batchId: string;
  jumlahSoal: number;
  jumlahBacaan: number;
  jumlahDilewati: number;
  namaBerkas: string;
}
interface HasilTerbit {
  diterbitkan: number;
  bacaanDiterbitkan: number;
  dilewati: { id: string; alasan: string }[];
  pesan?: string;
}
interface Pesan {
  jenis: "ok" | "gagal";
  teks: string;
}

type Saring = "semua" | "galat" | "peringatan";
type Format = "docx" | "csv";

/** Nama kolom CSV -> sebutan di template Word. */
const LABEL_KOLOM_DOCX: Record<string, string> = {
  subtes: "Subtes",
  topik: "Topik",
  tipe: "Jenis",
  redaksi: "Soal",
  opsi_a: "A.",
  opsi_b: "B.",
  opsi_c: "C.",
  opsi_d: "D.",
  opsi_e: "E.",
  kunci: "Kunci",
  pembahasan: "Pembahasan",
  kesulitan: "Kesulitan",
  level_kognitif: "Level",
  estimasi_detik: "Waktu",
  sumber_rujukan: "Sumber",
  kode_bacaan: "Bacaan",
  urutan_dalam_bacaan: "Urutan",
  teks: "Teks bacaan",
};
const namaKolom = (format: Format, kolom: string) => (format === "docx" ? (LABEL_KOLOM_DOCX[kolom] ?? kolom) : kolom);
/** Letak galat: Word = "soal ke-N" (baris data + judul = N+1), CSV = nomor baris berkas. */
function letak(format: Format, berkas: "soal" | "bacaan", baris: number): string {
  if (baris <= 0) return "";
  if (format === "docx") return berkas === "bacaan" ? `bacaan ke-${baris - 1}` : `soal ke-${baris - 1}`;
  return `${berkas === "bacaan" ? "bacaan.csv" : "soal.csv"} baris ${baris}`;
}

const LABEL_STATUS: Record<StatusBaris, string> = { ok: "OK", peringatan: "Peringatan", galat: "Galat" };
const WARNA_STATUS: Record<StatusBaris, string> = {
  ok: "bg-success-soft text-success",
  peringatan: "bg-chip text-black",
  galat: "bg-danger-soft text-danger",
};
const LABEL_ALASAN: Record<string, string> = {
  tidak_ditemukan: "tidak ditemukan",
  bukan_draf: "sudah bukan draf",
  bukan_buatan_sendiri: "bukan soal Buatan Sendiri",
  stimulus_tidak_valid: "bacaannya tidak bisa diterbitkan",
  data_tidak_valid: "isi belum memenuhi syarat terbit",
};

async function kirim<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      url,
      body instanceof FormData
        ? { method: "POST", body }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const json = (await res.json().catch(() => null)) as ({ success?: boolean; error?: string } & T) | null;
    if (!res.ok || !json || json.success === false) return { ok: false, error: json?.error ?? "Permintaan gagal. Coba lagi sebentar lagi." };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi." };
  }
}

function PilihBerkas<B extends { nama: string }>({
  label,
  berkas,
  wajib,
  terima,
  baca,
  onPilih,
  disabled,
}: {
  label: string;
  berkas: B | null;
  wajib?: boolean;
  terima: string;
  baca: (file: File) => Promise<B>;
  onPilih: (b: B | null) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-black">
        {label} {wajib ? <span className="text-danger">*</span> : <span className="text-muted">(opsional)</span>}
      </label>
      <input
        id={id}
        type="file"
        accept={terima}
        disabled={disabled}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return onPilih(null);
          onPilih(await baca(file));
        }}
        className="block w-full rounded-[12px] border border-subtle bg-white px-3 py-2 text-sm text-black file:mr-3 file:rounded-[8px] file:border-0 file:bg-chip file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      {berkas ? <p className="text-xs text-muted">{berkas.nama}</p> : null}
    </div>
  );
}

const FORMAT_WORD = `#BACAAN kode=B1
Subtes: Penalaran Umum
Sumber: Buatan Sendiri   (boleh dikosongkan)
Teks bacaan, boleh banyak paragraf.
#SOAL
Subtes: Penalaran Umum
Topik: ...                (opsional)
Jenis: PG                 (PG atau Isian)
Kesulitan: sedang         (opsional)  ·  Level: 1  ·  Waktu: 90  ·  Bacaan: B1
Soal: Teks soal, boleh banyak paragraf.
A. ...  (sampai E.)
Kunci: B                  (Isian: jawaban dipisah |)
Pembahasan: ...`;

const TOMBOL_UNDUH =
  "rounded-[12px] border border-line-strong bg-white px-4 py-2 text-sm font-medium text-black hover:border-primary";

export default function ImporSoalClient() {
  const [word, setWord] = useState<BerkasWord | null>(null);
  const [soal, setSoal] = useState<BerkasCsv | null>(null);
  const [bacaan, setBacaan] = useState<BerkasCsv | null>(null);
  const [format, setFormat] = useState<Format | null>(null);
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [lewatiGalat, setLewatiGalat] = useState(false);
  const [saring, setSaring] = useState<Saring>("semua");
  const [sibuk, setSibuk] = useState<"periksa" | "simpan" | "terbit" | null>(null);
  const [pesan, setPesan] = useState<Pesan | null>(null);
  const [tersimpan, setTersimpan] = useState<HasilSimpan | null>(null);
  const [terbit, setTerbit] = useState<HasilTerbit | null>(null);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const idJudulKonfirmasi = useId();

  function reset() {
    setPratinjau(null);
    setFormat(null);
    setTersimpan(null);
    setTerbit(null);
    setPesan(null);
    setLewatiGalat(false);
  }
  function ubahBerkas<B>(set: (b: B | null) => void, b: B | null) {
    set(b);
    reset();
  }

  const fmt: Format = format ?? "docx";
  const baris = useMemo(() => {
    if (!pratinjau) return [];
    return pratinjau.pratinjau.filter((b) => saring === "semua" || (saring === "galat" ? b.status === "galat" : b.status === "peringatan"));
  }, [pratinjau, saring]);
  const pesanPerBaris = useMemo(() => {
    const peta = new Map<number, GalatImpor[]>();
    if (!pratinjau) return peta;
    for (const g of [...pratinjau.galat, ...pratinjau.peringatan]) {
      if (g.berkas !== "soal") continue;
      peta.set(g.baris, [...(peta.get(g.baris) ?? []), g]);
    }
    return peta;
  }, [pratinjau]);
  const pesanBerkas = useMemo(() => {
    if (!pratinjau) return [];
    return [...pratinjau.galat, ...pratinjau.peringatan].filter((g) => g.berkas === "bacaan" || g.baris <= 1);
  }, [pratinjau]);

  /** Isi permintaan untuk format yang dipakai: Word = multipart, CSV = JSON. */
  function isiPermintaan(f: Format, tambahan?: Record<string, string>): { url: string; body: unknown } | null {
    if (f === "docx") {
      if (!word) return null;
      const form = new FormData();
      form.append("berkas", word.file);
      for (const [k, v] of Object.entries(tambahan ?? {})) form.append(k, v);
      return { url: "docx", body: form };
    }
    if (!soal) return null;
    return {
      url: "csv",
      body: { soalCsv: soal.teks, bacaanCsv: bacaan?.teks ?? null, namaBerkas: soal.nama, lewatiGalat: tambahan?.lewatiGalat === "true" },
    };
  }

  async function periksa(f: Format) {
    const req = isiPermintaan(f);
    if (!req) return;
    setSibuk("periksa");
    reset();
    const r = await kirim<Pratinjau>(`/api/admin/studio-soal/impor/pratinjau${f === "docx" ? "-docx" : ""}`, req.body);
    setSibuk(null);
    if (!r.ok) return setPesan({ jenis: "gagal", teks: r.error });
    setFormat(f);
    setPratinjau(r.data);
    setSaring("semua");
  }

  async function simpan() {
    if (!format || !pratinjau) return;
    const req = isiPermintaan(format, { lewatiGalat: String(lewatiGalat) });
    if (!req) return;
    setSibuk("simpan");
    setPesan(null);
    const r = await kirim<HasilSimpan>(`/api/admin/studio-soal/impor/simpan${format === "docx" ? "-docx" : ""}`, req.body);
    setSibuk(null);
    if (!r.ok) return setPesan({ jenis: "gagal", teks: r.error });
    setTersimpan(r.data);
    setPesan({ jenis: "ok", teks: `${r.data.jumlahSoal} soal tersimpan sebagai draf. Belum terlihat siswa sampai diterbitkan.` });
  }

  async function terbitkan() {
    if (!tersimpan) return;
    setSibuk("terbit");
    setPesan(null);
    const r = await kirim<HasilTerbit>("/api/admin/studio-soal/impor/terbitkan", { batchId: tersimpan.batchId });
    setSibuk(null);
    setKonfirmasi(false);
    if (!r.ok) return setPesan({ jenis: "gagal", teks: r.error });
    setTerbit(r.data);
    setPesan({
      jenis: r.data.dilewati.length > 0 ? "gagal" : "ok",
      teks: `${r.data.diterbitkan} soal diterbitkan${r.data.dilewati.length > 0 ? `, ${r.data.dilewati.length} dilewati (lihat rinciannya di bawah)` : ""}.`,
    });
  }

  const bolehSimpan = !!pratinjau && !tersimpan && (lewatiGalat ? pratinjau.bisaSimpanLewatiGalat : pratinjau.bisaSimpan);
  const adaDraf = tersimpan && !(terbit && terbit.dilewati.length === 0 && terbit.diterbitkan >= tersimpan.jumlahSoal);

  return (
    <div className="flex flex-col gap-6">
      <section className={KARTU}>
        <h2 className="text-lg font-medium text-black">1. Siapkan soal di Word</h2>
        <p className="text-sm text-muted">
          Unduh contoh, ganti isinya dengan soal Anda, lalu simpan sebagai .docx. Tiap soal diawali baris <code>#SOAL</code>, tiap bacaan
          diawali <code>#BACAAN kode=...</code>. Tulis rumus sebagai teks <code>{"\\( … \\)"}</code> — bukan objek Persamaan Word. Gambar,
          persamaan Word, soal majemuk kompleks, dan PDF belum didukung; berkas yang memuatnya ditolak. Maksimal 300 soal dan 5 MB per
          unggahan. Semua soal tercatat sebagai Buatan Sendiri.
        </p>
        <pre className="overflow-x-auto rounded-[12px] bg-surface-muted p-3 text-xs text-black">{FORMAT_WORD}</pre>
        <div>
          <a href="/api/admin/studio-soal/impor/template?berkas=docx" className={TOMBOL_UNDUH}>
            Unduh contoh Word (.docx)
          </a>
        </div>
      </section>

      <section className={KARTU}>
        <h2 className="text-lg font-medium text-black">2. Unggah dan periksa</h2>
        <PilihBerkas<BerkasWord>
          label="Berkas Word (.docx)"
          berkas={word}
          wajib
          terima=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          baca={async (file) => ({ nama: file.name, file })}
          onPilih={(b) => ubahBerkas(setWord, b)}
          disabled={sibuk !== null}
        />
        <div>
          <Button onClick={() => periksa("docx")} disabled={!word || sibuk !== null}>
            {sibuk === "periksa" && fmt === "docx" ? "Memeriksa…" : "Periksa berkas Word"}
          </Button>
        </div>

        <details className="rounded-[12px] border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium text-black">Lanjutan: unggah CSV</summary>
          <div className="mt-3 flex flex-col gap-4">
            <p className="text-sm text-muted">
              Pemisah koma atau titik koma sama-sama diterima; simpan sebagai CSV UTF-8. Isi bacaan.csv hanya bila ada soal berbacaan.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href="/api/admin/studio-soal/impor/template?berkas=soal" className={TOMBOL_UNDUH}>
                Unduh template soal.csv
              </a>
              <a href="/api/admin/studio-soal/impor/template?berkas=bacaan" className={TOMBOL_UNDUH}>
                Unduh template bacaan.csv
              </a>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <PilihBerkas<BerkasCsv>
                label="soal.csv"
                berkas={soal}
                wajib
                terima=".csv,text/csv"
                baca={async (file) => ({ nama: file.name, teks: await file.text() })}
                onPilih={(b) => ubahBerkas(setSoal, b)}
                disabled={sibuk !== null}
              />
              <PilihBerkas<BerkasCsv>
                label="bacaan.csv"
                berkas={bacaan}
                terima=".csv,text/csv"
                baca={async (file) => ({ nama: file.name, teks: await file.text() })}
                onPilih={(b) => ubahBerkas(setBacaan, b)}
                disabled={sibuk !== null}
              />
            </div>
            <div>
              <Button variant="secondary" onClick={() => periksa("csv")} disabled={!soal || sibuk !== null}>
                {sibuk === "periksa" && fmt === "csv" ? "Memeriksa…" : "Periksa berkas CSV"}
              </Button>
            </div>
          </div>
        </details>
      </section>

      {pesan ? (
        <p role="status" className={pesanKelas(pesan.jenis)}>
          {pesan.teks}
        </p>
      ) : null}

      {pratinjau ? (
        <section className={KARTU}>
          <h2 className="text-lg font-medium text-black">3. Hasil pemeriksaan</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className={CHIP}>{pratinjau.ringkasan.jumlahBaris} soal</span>
            <span className={`${CHIP} !bg-success-soft !text-success`}>{pratinjau.ringkasan.jumlahOk} lolos</span>
            <span className={`${CHIP} !bg-danger-soft !text-danger`}>{pratinjau.ringkasan.jumlahGalat} galat</span>
            <span className={CHIP}>{pratinjau.ringkasan.jumlahPeringatan} peringatan</span>
            <span className={CHIP}>{pratinjau.ringkasan.jumlahBacaan} bacaan</span>
          </div>

          {pesanBerkas.length > 0 ? (
            <ul className="flex flex-col gap-1 rounded-[12px] bg-surface-muted p-3 text-sm">
              {pesanBerkas.map((g, i) => (
                <li key={`${g.berkas}-${g.baris}-${g.kolom}-${i}`} className={g.tingkat === "galat" ? "text-danger" : "text-black"}>
                  <strong>{letak(fmt, g.berkas, g.baris) || (fmt === "docx" ? "Berkas Word" : "Berkas")}</strong>
                  {g.kolom ? ` · ${namaKolom(fmt, g.kolom)}` : ""}: {g.pesan}
                </li>
              ))}
            </ul>
          ) : null}
          {pratinjau.galatTerpotong ? <p className="text-xs text-muted">Daftar galat dipotong; perbaiki yang tampil lalu periksa ulang.</p> : null}

          <div className="flex flex-wrap gap-2" role="group" aria-label="Saring soal">
            {(["semua", "galat", "peringatan"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={saring === s}
                onClick={() => setSaring(s)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  saring === s ? "border-primary bg-primary text-white" : "border-line-strong bg-white text-black hover:border-primary",
                ].join(" ")}
              >
                {s === "semua" ? "Semua" : s === "galat" ? "Galat saja" : "Peringatan saja"}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">{fmt === "docx" ? "Soal ke-" : "Baris"}</th>
                  <th className="py-2 pr-3 font-medium">Subtes</th>
                  <th className="py-2 pr-3 font-medium">Jenis</th>
                  <th className="py-2 pr-3 font-medium">Soal</th>
                  <th className="py-2 pr-3 font-medium">Kunci</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {baris.map((b) => (
                  <tr key={b.baris} className="border-b border-line align-top">
                    <td className="py-2 pr-3">{fmt === "docx" ? b.baris - 1 : b.baris}</td>
                    <td className="py-2 pr-3">{b.subtes || "—"}</td>
                    <td className="py-2 pr-3">{b.tipe || "—"}</td>
                    <td className="py-2 pr-3">
                      <div className="text-black">{b.redaksi || "—"}</div>
                      {b.kodeBacaan ? <div className="text-xs text-muted">bacaan {b.kodeBacaan}</div> : null}
                      {(pesanPerBaris.get(b.baris) ?? []).map((g, i) => (
                        <div key={i} className={`text-xs ${g.tingkat === "galat" ? "text-danger" : "text-muted"}`}>
                          {g.kolom ? `${namaKolom(fmt, g.kolom)}: ` : ""}
                          {g.pesan}
                        </div>
                      ))}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{b.kunci || "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${WARNA_STATUS[b.status]}`}>{LABEL_STATUS[b.status]}</span>
                    </td>
                  </tr>
                ))}
                {baris.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted">
                      Tidak ada soal untuk disaring ini.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {pratinjau.ringkasan.jumlahGalat > 0 && pratinjau.bisaSimpanLewatiGalat && !tersimpan ? (
            <div className="flex items-center gap-3 rounded-[12px] bg-surface-muted p-3">
              <Toggle checked={lewatiGalat} onChange={() => setLewatiGalat((v) => !v)} disabled={sibuk !== null} label="Lewati soal galat" />
              <p className="text-sm text-black">
                Lewati {pratinjau.ringkasan.jumlahGalat} soal galat dan simpan {pratinjau.ringkasan.jumlahOk} soal yang lolos.
              </p>
            </div>
          ) : null}
          {!bolehSimpan && !tersimpan && pratinjau.alasanTidakBisa && !lewatiGalat ? (
            <p className="text-sm text-muted">{pratinjau.alasanTidakBisa}</p>
          ) : null}
          <div>
            <Button onClick={simpan} disabled={!bolehSimpan || sibuk !== null}>
              {sibuk === "simpan" ? "Menyimpan…" : "Simpan sebagai draf"}
            </Button>
          </div>
        </section>
      ) : null}

      {tersimpan ? (
        <section className={KARTU}>
          <h2 className="text-lg font-medium text-black">4. Terbitkan</h2>
          <p className="text-sm text-black">
            Batch <strong>{tersimpan.namaBerkas}</strong> (Buatan Sendiri): {tersimpan.jumlahSoal} soal draf
            {tersimpan.jumlahBacaan > 0 ? ` dan ${tersimpan.jumlahBacaan} bacaan` : ""}
            {tersimpan.jumlahDilewati > 0 ? ` (${tersimpan.jumlahDilewati} soal galat dilewati)` : ""}. Draf belum terlihat siswa.
          </p>
          {terbit && terbit.dilewati.length > 0 ? (
            <ul className="flex flex-col gap-1 rounded-[12px] bg-danger-soft p-3 text-sm text-danger">
              {terbit.dilewati.map((d) => (
                <li key={d.id}>
                  Soal {d.id.slice(0, 8)}…: {LABEL_ALASAN[d.alasan] ?? d.alasan}
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <Button onClick={() => setKonfirmasi(true)} disabled={!adaDraf || sibuk !== null}>
              {adaDraf ? "Terbitkan semua draf batch ini" : "Semua draf sudah diterbitkan"}
            </Button>
          </div>
        </section>
      ) : null}

      <Modal open={konfirmasi} onClose={() => (sibuk === null ? setKonfirmasi(false) : undefined)} labelledBy={idJudulKonfirmasi}>
        <div className="flex flex-col gap-4">
          <h2 id={idJudulKonfirmasi} className="pr-8 text-lg font-medium text-black">
            Terbitkan {tersimpan?.jumlahSoal ?? 0} soal?
          </h2>
          <p className="text-sm text-black">
            {tersimpan?.jumlahSoal ?? 0} soal
            {tersimpan && tersimpan.jumlahBacaan > 0 ? ` beserta ${tersimpan.jumlahBacaan} bacaannya` : ""} akan berstatus terbit dan akan terlihat siswa
            nanti. Isi soal terbit terkunci: perubahan hanya lewat versi baru. Penerbitan dicatat atas nama Anda.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setKonfirmasi(false)} disabled={sibuk !== null}>
              Batal
            </Button>
            <Button size="sm" onClick={terbitkan} disabled={sibuk !== null}>
              {sibuk === "terbit" ? "Menerbitkan…" : "Ya, terbitkan"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
