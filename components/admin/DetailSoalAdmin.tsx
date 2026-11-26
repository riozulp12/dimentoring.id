"use client";

import Link from "next/link";
import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import { buttonClassName } from "@/components/ui/buttonClassName";
import Modal from "@/components/ui/Modal";
import TampilanSoal, { type MetadataSoal, type SoalAdminTampil } from "@/components/studio-soal/TampilanSoal";
import { KARTU, pesanKelas } from "@/components/studio-soal/gaya";
import { panggilApi } from "@/components/studio-soal/klien";
import { useNavigasiSibuk } from "@/components/studio-soal/useNavigasiSibuk";
import { izinSoal, teksDilewati, type SoalDilewati } from "@/lib/shared/studio-soal/bankSoal";
import type { BlokStimulus } from "@/lib/shared/studio-soal/tipe";

type Sibuk = "terbit" | "versi" | "arsip" | "hapus";
type Konfirmasi = "terbit" | "arsip" | "hapus" | null;

/** Pratinjau satu soal di Bank Soal + aksi Admin sesuai sumber & status. */
export default function DetailSoalAdmin({
  id,
  sumber,
  soal,
  metadata,
  bacaan,
  versiTerbuka,
  updatedAt,
  versiBaru,
}: {
  id: string;
  sumber: string;
  /** Versi yang sedang dilihat: terbit ditolak bila soal sudah berubah. */
  updatedAt: string;
  /** Draf versi baru dari soal terbit. */
  versiBaru: boolean;
  soal: SoalAdminTampil;
  metadata: MetadataSoal;
  bacaan: BlokStimulus[] | null;
  versiTerbuka: string | null;
}) {
  const { router, jenisPindah, pindah } = useNavigasiSibuk<Sibuk>();
  const [sedang, setSedang] = useState<Sibuk | null>(null);
  const [konfirmasi, setKonfirmasi] = useState<Konfirmasi>(null);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "gagal"; teks: string } | null>(null);
  const idJudul = useId();
  const sibuk = jenisPindah ?? sedang;
  const izin = izinSoal({ sumber, status: metadata.status });

  async function kirim(jenis: Sibuk, url: string, method: "POST" | "DELETE", body?: unknown) {
    setSedang(jenis);
    setPesan(null);
    const r = await panggilApi(url, method, body);
    setSedang(null);
    setKonfirmasi(null);
    return r;
  }
  const gagal = (r: { json: Record<string, unknown> }) =>
    setPesan({ jenis: "gagal", teks: String(r.json.error ?? "Belum berhasil. Coba lagi.") });

  async function terbitkan() {
    const r = await kirim("terbit", "/api/admin/studio-soal/impor/terbitkan", "POST", { soalId: id, updatedAt });
    if (!r.ok) return gagal(r);
    const lewat = (r.json.dilewati as SoalDilewati[] | undefined)?.[0];
    if (lewat) return setPesan({ jenis: "gagal", teks: `Soal belum diterbitkan, ${teksDilewati(lewat)}` });
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Soal diterbitkan.") });
    router.refresh();
  }

  async function editVersiBaru() {
    const r = await kirim("versi", `/api/admin/studio-soal/bank/${id}/versi-baru`, "POST");
    // Berhasil membuat, atau sudah ada versi terbuka: lanjutkan menyunting draf itu.
    if (typeof r.json.soalId === "string") {
      const tujuan = r.json.soalId;
      return pindah("versi", (x) => x.push(`/bank-soal/${tujuan}/edit`));
    }
    gagal(r);
  }

  async function arsipkan() {
    const r = await kirim("arsip", `/api/admin/studio-soal/bank/${id}/arsipkan`, "POST");
    if (!r.ok) return gagal(r);
    setPesan({ jenis: "ok", teks: String(r.json.pesan ?? "Soal diarsipkan.") });
    router.refresh();
  }

  async function hapus() {
    const r = await kirim("hapus", `/api/admin/studio-soal/bank/${id}`, "DELETE");
    if (!r.ok) return gagal(r);
    pindah("hapus", (x) => x.push("/bank-soal"));
  }

  const dialog = {
    terbit: {
      judul: "Terbitkan soal ini?",
      isi: `Soal terkunci setelah terbit: perubahan berikutnya membuat versi baru.${versiBaru ? " Versi lama ditandai digantikan." : ""}`,
      tombol: "Ya, terbitkan",
      jalankan: terbitkan,
    },
    arsip: {
      judul: "Arsipkan soal ini?",
      isi: "Soal tidak ikut latihan lagi, tetapi tetap tersimpan di Bank Soal.",
      tombol: "Ya, arsipkan",
      jalankan: arsipkan,
    },
    hapus: {
      judul: "Hapus draf soal ini?",
      isi: "Draf dihapus permanen dan tidak bisa dikembalikan. Bila bacaan drafnya tidak dipakai soal lain, bacaan itu ikut dihapus.",
      tombol: "Ya, hapus",
      jalankan: hapus,
    },
  }[konfirmasi ?? "hapus"];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/bank-soal" className="w-fit text-sm text-primary hover:underline">
        ← Bank Soal
      </Link>

      {sumber !== "buatan_sendiri" ? (
        <p className={pesanKelas("ok")}>Soal buatan mentor: hanya bisa dilihat.</p>
      ) : null}
      {pesan ? (
        <p role={pesan.jenis === "gagal" ? "alert" : "status"} className={pesanKelas(pesan.jenis)}>
          {pesan.teks}
        </p>
      ) : null}
      {sumber === "buatan_sendiri" && versiTerbuka ? (
        <p className="text-sm text-black">
          Ada draf versi lain dari soal ini.{" "}
          <Link href={`/bank-soal/${versiTerbuka}`} className="text-primary hover:underline">
            Buka draf itu
          </Link>
        </p>
      ) : null}

      <section className={KARTU}>
        <TampilanSoal key={id} mode="admin" soal={soal} metadata={metadata} stimulus={bacaan} />
      </section>

      {izin.terbit || izin.edit || izin.versiBaru || izin.arsip || izin.hapus ? (
        <div className="flex flex-wrap justify-end gap-2">
          {izin.hapus ? (
            <Button variant="secondary" size="sm" onClick={() => setKonfirmasi("hapus")} disabled={sibuk !== null}>
              Hapus draf
            </Button>
          ) : null}
          {izin.arsip ? (
            <Button variant="secondary" size="sm" onClick={() => setKonfirmasi("arsip")} disabled={sibuk !== null}>
              Arsipkan
            </Button>
          ) : null}
          {izin.edit ? (
            <Link href={`/bank-soal/${id}/edit`} className={buttonClassName({ variant: "secondary", size: "sm" })}>
              Edit
            </Link>
          ) : null}
          {izin.terbit ? (
            <Button size="sm" onClick={() => setKonfirmasi("terbit")} disabled={sibuk !== null}>
              Terbitkan
            </Button>
          ) : null}
          {izin.versiBaru ? (
            <Button size="sm" onClick={editVersiBaru} disabled={sibuk !== null}>
              {sibuk === "versi" ? "Membuka…" : "Edit"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <Modal open={konfirmasi !== null} onClose={() => (sibuk ? undefined : setKonfirmasi(null))} labelledBy={idJudul}>
        <div className="flex flex-col gap-4">
          <h2 id={idJudul} className="pr-8 text-lg font-medium text-black">
            {dialog.judul}
          </h2>
          <p className="text-sm text-black">{dialog.isi}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setKonfirmasi(null)} disabled={sibuk !== null}>
              Batal
            </Button>
            <Button size="sm" onClick={dialog.jalankan} disabled={sibuk !== null}>
              {sibuk !== null ? "Memproses…" : dialog.tombol}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
