"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Toggle from "@/components/ui/Toggle";
import { KARTU, pesanKelas, pilihan } from "@/components/studio-soal/gaya";
import type { MentorPenugasanItem, PenugasanStudioSoalData } from "@/lib/admin/getPenugasanStudioSoalData";
import { JENIS_UJIAN, cariMentor, potongHalaman, subtesUntukJenis } from "@/lib/shared/studio-soal/jenisUjian";
import {
  PESAN_PERINGATAN,
  kunciPenugasan,
  ringkasPenugasan,
  terapkanAksi,
  type AksiPenugasan,
  type PenugasanRow,
} from "@/lib/shared/studio-soal/penugasan";

/**
 * Penugasan mentor ke subtes Studio Soal (Admin) — PR 3a (revisi K2), UX-1.
 *
 * Dua langkah: (1) pilih jenis ujian -> subtesnya tampil dengan jumlah mentor;
 * (2) cari & klik mentor -> atur tugas per subtes. Pencarian & paginasi
 * berjalan di browser atas data yang sudah dimuat (tidak ada fetch saat
 * mengetik). Simpan tetap lewat PATCH -> RPC studio_soal_atur_penugasan (log
 * audit di database); aturannya tidak berubah.
 *
 * Satu penugasan = mentor boleh MENULIS soal dan MENGECEK soal mentor lain di
 * subtes itu (database belum membedakan dua tugas ini). "Mengajar subtes ini"
 * = isi profil mengajar mentor, hanya petunjuk: tidak memberi hak.
 */

const CHIP_REDUP = "w-fit shrink-0 rounded-full bg-chip px-2.5 py-0.5 text-xs font-medium text-muted";

interface PesanMentor {
  jenis: "ok" | "gagal";
  teks: string;
}

export default function PenugasanStudioSoalClient({ initialData }: { initialData: PenugasanStudioSoalData }) {
  const { subtes, mentor } = initialData;
  const [penugasan, setPenugasan] = useState<PenugasanRow[]>(initialData.penugasan);
  const [sibuk, setSibuk] = useState<Set<string>>(new Set());
  const [pesan, setPesan] = useState<PesanMentor | null>(null);
  const [jenisId, setJenisId] = useState(JENIS_UJIAN[0]?.id ?? "");
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);
  const [dipilihId, setDipilihId] = useState<string | null>(null);
  // Mengetik tetap lancar walau daftar mentor panjang: penyaringan memakai nilai tertunda.
  const cariTertunda = useDeferredValue(cari);

  const subtesJenis = useMemo(() => subtesUntukJenis(jenisId, subtes), [jenisId, subtes]);
  const ditugaskan = useMemo(() => new Set(penugasan.map((p) => kunciPenugasan(p.mentorId, p.subtesId))), [penugasan]);
  const ringkasan = useMemo(
    () => ringkasPenugasan(subtesJenis, penugasan, mentor.filter((m) => m.aktif).map((m) => m.id)),
    [subtesJenis, penugasan, mentor],
  );
  const hasilCari = useMemo(() => cariMentor(mentor, cariTertunda), [mentor, cariTertunda]);
  const halamanIni = potongHalaman(hasilCari, halaman);
  const dipilih = mentor.find((m) => m.id === dipilihId) ?? null;
  const jumlahTugas = (m: MentorPenugasanItem) =>
    subtesJenis.filter((s) => ditugaskan.has(kunciPenugasan(m.id, s.id))).length;

  function pilihMentor(id: string) {
    setDipilihId(id);
    setPesan(null);
  }

  async function ubah(mentorId: string, subtesId: string, aksi: AksiPenugasan) {
    const kunci = kunciPenugasan(mentorId, subtesId);
    setSibuk((prev) => new Set(prev).add(kunci));
    setPesan(null);
    try {
      const response = await fetch("/api/admin/studio-soal/penugasan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentorId, subtesId, aksi }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setPesan({ jenis: "gagal", teks: json.error ?? "Penugasan belum tersimpan. Coba lagi." });
        return;
      }
      setPenugasan((prev) => terapkanAksi(prev, mentorId, subtesId, aksi));
      setPesan({ jenis: "ok", teks: json.pesan });
    } catch {
      setPesan({ jenis: "gagal", teks: "Tidak tersambung ke server. Cek koneksi internet lalu coba lagi." });
    } finally {
      setSibuk((prev) => {
        const baru = new Set(prev);
        baru.delete(kunci);
        return baru;
      });
    }
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* ---- Langkah 1: jenis ujian ---- */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium text-black sm:text-xl">1. Pilih jenis ujian</h2>
          <p className="text-sm text-muted">Subtes milik jenis ujian ini tampil di bawah, lengkap dengan jumlah mentornya.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Jenis ujian">
          {JENIS_UJIAN.map((j) => (
            <button
              key={j.id}
              type="button"
              role="radio"
              aria-checked={jenisId === j.id}
              onClick={() => setJenisId(j.id)}
              className={`flex flex-col items-start rounded-[12px] px-4 py-2 text-left ${pilihan(jenisId === j.id)}`}
            >
              <span>{j.nama}</span>
              <span className={["text-xs font-normal", jenisId === j.id ? "text-white/80" : "text-muted"].join(" ")}>
                {j.keterangan}
              </span>
            </button>
          ))}
        </div>
        {subtesJenis.length === 0 ? (
          <p className="text-sm text-muted">Belum ada subtes untuk jenis ujian ini.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ringkasan.map((r) => (
              <div
                key={r.subtesId}
                className={[
                  "flex flex-col gap-1 rounded-[20px] border-[0.8px] px-4 py-3",
                  r.peringatan ? "border-amber-200 bg-amber-50" : "border-line bg-white",
                ].join(" ")}
              >
                <p className="text-sm font-medium text-black">{r.nama}</p>
                <p className="text-sm text-muted">{r.jumlahMentor} mentor</p>
                {r.peringatan ? <p className="text-xs text-amber-700">{PESAN_PERINGATAN[r.peringatan]}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- Langkah 2: mentor ---- */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium text-black sm:text-xl">2. Pilih mentor, lalu atur tugasnya</h2>
          <p className="text-sm text-muted">
            Mencabut tugas tidak menghapus soal yang sudah ditulis. Hanya mentor aktif yang bisa diberi tugas baru.
          </p>
        </div>

        {mentor.length === 0 ? (
          <div className="rounded-[20px] border-[0.8px] border-line bg-white px-5 py-12 text-center">
            <p className="text-base text-muted">Belum ada mentor aktif.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {/* Daftar mentor */}
            <div className={`${KARTU} lg:self-start`}>
              <InputField
                type="text"
                size="md"
                inputMode="search"
                value={cari}
                onChange={(e) => {
                  setCari(e.target.value);
                  setHalaman(1);
                }}
                placeholder="Cari nama atau email mentor"
                aria-label="Cari nama atau email mentor"
              />
              <p className="text-xs text-muted" aria-live="polite">
                {hasilCari.length === mentor.length
                  ? `${mentor.length} mentor`
                  : `${hasilCari.length} dari ${mentor.length} mentor cocok`}
              </p>
              {hasilCari.length === 0 ? (
                <p className="text-sm text-muted">Tidak ada mentor dengan nama atau email itu.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {halamanIni.item.map((m) => {
                    const aktifDipilih = m.id === dipilihId;
                    const n = jumlahTugas(m);
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          aria-pressed={aktifDipilih}
                          onClick={() => pilihMentor(m.id)}
                          className={[
                            "flex w-full flex-col gap-0.5 rounded-[12px] px-3 py-2.5 text-left transition-colors",
                            aktifDipilih ? "bg-primary-soft" : "hover:bg-surface",
                          ].join(" ")}
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className={["text-sm font-medium", aktifDipilih ? "text-primary" : "text-black"].join(" ")}>
                              {m.nama}
                            </span>
                            {!m.aktif ? <span className={CHIP_REDUP}>Nonaktif</span> : null}
                          </span>
                          <span className="break-all text-xs text-muted">
                            {[m.email, m.asalPtn].filter(Boolean).join(" · ") || "—"}
                          </span>
                          <span className="text-xs text-muted">{n > 0 ? `Ditugaskan di ${n} subtes` : "Belum ditugaskan"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {halamanIni.jumlahHalaman > 1 ? (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={halamanIni.halaman <= 1}
                    onClick={() => setHalaman(halamanIni.halaman - 1)}
                  >
                    ← Sebelumnya
                  </Button>
                  <span className="text-xs text-muted">
                    Halaman {halamanIni.halaman} dari {halamanIni.jumlahHalaman}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={halamanIni.halaman >= halamanIni.jumlahHalaman}
                    onClick={() => setHalaman(halamanIni.halaman + 1)}
                  >
                    Berikutnya →
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Tugas mentor terpilih */}
            <div className={`${KARTU} lg:sticky lg:top-4 lg:self-start`}>
              {!dipilih ? (
                <p className="py-8 text-center text-sm text-muted">Klik salah satu mentor untuk mengatur tugasnya.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-medium text-black sm:text-lg">{dipilih.nama}</h3>
                      {!dipilih.aktif ? <span className={CHIP_REDUP}>Nonaktif — tugas hanya bisa dicabut</span> : null}
                    </div>
                    <p className="text-sm text-muted">
                      Tugas di satu subtes = <span className="font-medium text-black">yang menulis soal</span> dan{" "}
                      <span className="font-medium text-black">yang mengecek soal</span> mentor lain di subtes itu. Mentor tidak
                      pernah mengecek soalnya sendiri.
                    </p>
                  </div>

                  {pesan ? (
                    <p role={pesan.jenis === "gagal" ? "alert" : "status"} className={pesanKelas(pesan.jenis)}>
                      {pesan.teks}
                    </p>
                  ) : null}

                  <ul className="flex flex-col divide-y divide-line">
                    {subtesJenis.map((s) => {
                      const kunci = kunciPenugasan(dipilih.id, s.id);
                      const aktif = ditugaskan.has(kunci);
                      const dikunci = !dipilih.aktif && !aktif;
                      const mengajar = dipilih.subtesProfil.includes(s.id);
                      return (
                        <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-medium text-black">{s.nama}</span>
                            <span className="text-xs text-muted">
                              {sibuk.has(kunci)
                                ? "Menyimpan…"
                                : aktif
                                  ? "Menulis & mengecek soal"
                                  : "Belum ditugaskan"}
                              {mengajar ? " · di profilnya: mengajar subtes ini" : ""}
                            </span>
                          </div>
                          <Toggle
                            checked={aktif}
                            disabled={sibuk.has(kunci) || dikunci}
                            onChange={() => ubah(dipilih.id, s.id, aktif ? "cabut" : "tugaskan")}
                            label={`${aktif ? "Cabut" : "Beri"} tugas ${s.nama} untuk ${dipilih.nama}`}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
