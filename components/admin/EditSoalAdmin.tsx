"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import TeksSibuk from "@/components/ui/TeksSibuk";
import BilahAksi, { KELAS_TOMBOL_BILAH } from "@/components/studio-soal/BilahAksi";
import { IsianSoal, type SubtesPilihan } from "@/components/studio-soal/FormSoal";
import PenjagaKeluar from "@/components/studio-soal/PenjagaKeluar";
import SoalPratinjau from "@/components/studio-soal/SoalPratinjau";
import TabTulisPratinjau, { type TabForm } from "@/components/studio-soal/TabTulisPratinjau";
import { KARTU, KOLOM_PRATINJAU, pesanKelas } from "@/components/studio-soal/gaya";
import { panggilApi, petaError } from "@/components/studio-soal/klien";
import { useNavigasiSibuk } from "@/components/studio-soal/useNavigasiSibuk";
import type { FormSoal } from "@/lib/shared/studio-soal/formSoal";
import { daftarGambar, masalahPenandaGambar, type MediaTampil } from "@/lib/shared/studio-soal/gambar";
import { cekSoalLengkap, pesanUnik } from "@/lib/shared/studio-soal/kelengkapan";
import type { BlokStimulus } from "@/lib/shared/studio-soal/tipe";
import type { ErrorValidasi } from "@/lib/shared/studio-soal/validasi";

type Sibuk = "simpan" | "terbit";
type Pesan = { jenis: "ok" | "gagal"; teks: string; daftar?: string[]; muatUlang?: boolean; draf?: string };

/**
 * Sunting soal Buatan Sendiri (Admin). Isian, pratinjau, validasi, dan
 * peringatan keluar sama dengan form mentor; yang berbeda jalur simpannya.
 * `updatedAt` = versi yang dibaca layar: server menolak bila soal sudah berubah.
 * `terbitUlang`: soal sedang terbit, jadi satu-satunya aksi membuat versi baru
 * yang langsung terbit (tanpa tombol simpan draf).
 */
export default function EditSoalAdmin({
  id,
  awal,
  updatedAt: updatedAtAwal,
  versi,
  versiBaru,
  terbitUlang,
  subtes,
  bacaan,
  media,
}: {
  id: string;
  /** Gambar soal & bacaan (alamat dari server). */
  media: Record<string, MediaTampil>;
  awal: FormSoal;
  updatedAt: string;
  versi: number;
  /** Draf versi baru dari soal terbit: bisa langsung diterbitkan. */
  versiBaru: boolean;
  /** Soal terbit: simpan = terbit sebagai versi baru. */
  terbitUlang: boolean;
  subtes: SubtesPilihan;
  bacaan: { judul: string; blok: BlokStimulus[] } | null;
}) {
  const { jenisPindah, pindah } = useNavigasiSibuk<Sibuk>();
  const [form, setForm] = useState<FormSoal>(awal);
  const [updatedAt, setUpdatedAt] = useState(updatedAtAwal);
  const [jejakTersimpan, setJejakTersimpan] = useState(() => JSON.stringify(awal));
  const [sedang, setSedang] = useState<Sibuk | null>(null);
  const sibukRef = useRef(false);
  const [pesan, setPesanState] = useState<Pesan | null>(null);
  const pesanRef = useRef<HTMLDivElement | null>(null);
  const [errorServer, setErrorServer] = useState<ErrorValidasi[]>([]);
  const [tampilSemua, setTampilSemua] = useState(false);
  const [tab, setTab] = useState<TabForm>("tulis");
  const [konfirmasi, setKonfirmasi] = useState(false);
  const idJudul = useId();

  const sibuk = jenisPindah ?? sedang;
  const kotor = jejakTersimpan !== JSON.stringify(form);
  const errorsLengkap = useMemo(() => cekSoalLengkap(form, subtes.kategori), [form, subtes.kategori]);
  const errorsBentuk = errorsLengkap.filter((e) => e.jenis === "bentuk");
  const peta = petaError([...(tampilSemua ? errorsLengkap : errorsBentuk), ...errorServer]);
  const jumlahGambar = daftarGambar(form.konten).length;
  const gambarBermasalah = masalahPenandaGambar(errorsBentuk);

  const setPesan = (p: Pesan | null) => {
    setPesanState(p);
    if (p) requestAnimationFrame(() => pesanRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  /** Berhasil = id soal yang sekarang berisi isian ini; gagal = null. */
  async function kirim(jenis: Sibuk): Promise<string | null> {
    if (sibukRef.current) return null;
    sibukRef.current = true;
    setSedang(jenis);
    setPesan(null);
    const jejak = JSON.stringify(form);
    const r =
      jenis === "simpan"
        ? await panggilApi(`/api/admin/studio-soal/bank/${id}`, "PUT", { ...form, updated_at: updatedAt })
        : await panggilApi(`/api/admin/studio-soal/bank/${id}/${terbitUlang ? "terbit-ulang" : "terbitkan-versi"}`, "POST", {
            ...form,
            updated_at: updatedAt,
          });
    sibukRef.current = false;
    setSedang(null);
    setKonfirmasi(false);
    if (!r.ok) {
      const errors = Array.isArray(r.json.errors) ? (r.json.errors as ErrorValidasi[]) : [];
      setErrorServer(errors);
      setPesan({
        jenis: "gagal",
        teks: String(r.json.error ?? "Belum tersimpan. Coba lagi."),
        daftar: pesanUnik(errors),
        // Ada draf: arahkan ke sana, jangan muat ulang (isian di layar akan hilang).
        draf: typeof r.json.soalId === "string" ? r.json.soalId : undefined,
        muatUlang: r.status === 409 && typeof r.json.soalId !== "string",
      });
      return null;
    }
    setJejakTersimpan(jejak);
    if (typeof r.json.updatedAt === "string") setUpdatedAt(r.json.updatedAt);
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Tersimpan.") });
    return typeof r.json.soalId === "string" ? r.json.soalId : id;
  }

  function simpan() {
    if (errorsBentuk.length > 0) {
      setPesan({ jenis: "gagal", teks: "Ada isian yang ditandai merah. Betulkan dulu, lalu simpan." });
      return;
    }
    void kirim("simpan");
  }

  function mintaTerbit() {
    setTampilSemua(true);
    if (errorsLengkap.length > 0) {
      setPesan({ jenis: "gagal", teks: "Belum bisa diterbitkan. Lengkapi dulu:", daftar: pesanUnik(errorsLengkap) });
      return;
    }
    setKonfirmasi(true);
  }

  async function terbitkan() {
    const tujuan = await kirim("terbit");
    if (tujuan) pindah("terbit", (r) => r.push(`/bank-soal/${tujuan}`));
  }

  return (
    <div className="flex flex-col gap-4 pb-24 sm:gap-5">
      <PenjagaKeluar adaPerubahan={kotor} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <div className="flex flex-col gap-2">
            <Link href={`/bank-soal/${id}`} className="w-fit text-sm text-primary hover:underline">
              ← Pratinjau soal
            </Link>
            <h1 className="text-xl font-medium text-black sm:text-2xl">
              {terbitUlang ? "Edit soal terbit" : "Edit soal"}{" "}
              {versi > 1 ? <span className="text-sm text-muted">versi {versi}</span> : null}
            </h1>
            {terbitUlang ? (
              <p className="text-sm text-muted">
                Perubahan terbit sebagai versi baru saat Anda menekan tombol terbitkan ulang. Sebelum itu siswa tetap melihat versi sekarang.
              </p>
            ) : null}
            {bacaan ? (
              <p className="text-sm text-muted">
                Soal ini memakai bacaan <strong>{bacaan.judul || "tanpa judul"}</strong>. Bacaan hanya bisa dilihat di pratinjau.
              </p>
            ) : null}
          </div>

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
              {pesan.draf ? (
                <>
                  {" "}
                  <Link href={`/bank-soal/${pesan.draf}`} className="font-medium underline">
                    Buka draf itu
                  </Link>
                </>
              ) : null}
              {pesan.muatUlang ? (
                <>
                  {" "}
                  <button type="button" className="font-medium underline" onClick={() => window.location.reload()}>
                    Muat ulang
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {jumlahGambar > 0 ? (
            <p className="text-sm text-muted">
              Soal ini memuat {jumlahGambar} gambar. Tanda seperti <code>{"{{g1}}"}</code> menentukan letaknya: boleh dipindah, jangan
              dihapus atau digandakan. Gambar baru belum bisa ditambah di sini.
            </p>
          ) : null}
          {gambarBermasalah.length > 0 ? (
            <div role="alert" className={pesanKelas("gagal")}>
              Tanda gambar bermasalah, jadi soal belum bisa disimpan:
              <ul className="mt-1 list-disc pl-5">
                {gambarBermasalah.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <TabTulisPratinjau tab={tab} setTab={setTab} label={{ tulis: "Tulis", pratinjau: "Pratinjau & uji kunci" }} />
          <div className={["flex min-w-0 flex-col gap-4", tab === "tulis" ? "" : "hidden lg:flex"].join(" ")}>
            <IsianSoal
              form={form}
              setForm={setForm}
              onUbah={() => setErrorServer([])}
              bolehEdit
              sudahDisimpan
              subtesTerkunci
              subtesPilihan={[subtes]}
              peta={peta}
            />
          </div>
        </div>

        <aside className={["min-w-0", KOLOM_PRATINJAU, tab === "pratinjau" ? "" : "hidden lg:block"].join(" ")}>
          <div className={KARTU}>
            <h2 className="text-base font-medium text-black">Pratinjau</h2>
            <SoalPratinjau soal={form} stimulus={bacaan?.blok ?? null} media={media} />
          </div>
        </aside>
      </div>

      <BilahAksi
        keterangan={
          <span className={kotor ? "text-amber-700" : undefined}>
            {kotor
              ? terbitUlang ? "Ada perubahan belum diterbitkan" : "Ada perubahan belum disimpan"
              : terbitUlang ? "Belum ada perubahan" : "Semua perubahan tersimpan"}
          </span>
        }
      >
        {terbitUlang ? null : (
          <Button variant="secondary" size="sm" className={KELAS_TOMBOL_BILAH} onClick={simpan} disabled={sibuk !== null}
            aria-busy={sibuk === "simpan"}>
            <TeksSibuk sibuk={sibuk === "simpan"} teks="Menyimpan…">
              Simpan
            </TeksSibuk>
          </Button>
        )}
        {versiBaru || terbitUlang ? (
          <Button size="sm" className={KELAS_TOMBOL_BILAH} onClick={mintaTerbit} disabled={sibuk !== null}
            aria-busy={sibuk === "terbit"}>
            <TeksSibuk sibuk={sibuk === "terbit"} teks="Menerbitkan…">
              {terbitUlang ? "Simpan dan terbitkan ulang" : "Simpan dan terbitkan versi baru"}
            </TeksSibuk>
          </Button>
        ) : null}
      </BilahAksi>

      <Modal open={konfirmasi} onClose={() => (sibuk ? undefined : setKonfirmasi(false))} labelledBy={idJudul}>
        <div className="flex flex-col gap-4">
          <h2 id={idJudul} className="pr-8 text-lg font-medium text-black">
            Terbitkan versi {terbitUlang ? versi + 1 : versi}?
          </h2>
          <p className="text-sm text-black">
            Versi baru langsung terbit dan versi lama ditandai digantikan. Isi soal terbit terkunci. Penerbitan dicatat atas nama Anda.
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
