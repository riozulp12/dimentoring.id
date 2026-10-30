"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import MaskotLoading from "@/components/ui/MaskotLoading";
import Modal from "@/components/ui/Modal";
import TeksSibuk from "@/components/ui/TeksSibuk";
import { buttonClassName } from "@/components/ui/buttonClassName";
import TombolHapusDraf from "@/components/studio-soal/TombolHapusDraf";
import { CHIP, pilihan } from "@/components/studio-soal/gaya";
import { panggilApi } from "@/components/studio-soal/klien";
import { useNavigasiSibuk } from "@/components/studio-soal/useNavigasiSibuk";
import { alasanTidakBisaHapus, tampilkanTombolHapus } from "@/lib/shared/studio-soal/hapusDraf";
import {
  BATAS_KIRIM,
  FILTER_STATUS,
  LABEL_FILTER,
  alasanDariJawaban,
  alasanDariJawabanBacaan,
  antreanKirim,
  hitungPerStatus,
  hitungPilihan,
  kelayakanKirim,
  kelayakanKirimBacaan,
  keadaanPilihSemua,
  kelayakanDenganKelengkapan,
  kunciItem,
  petaStatusBacaan,
  pilihSemua,
  ringkasHasilKirim,
  susunDaftar,
  teksJumlah,
  uraiKunci,
  ubahPilihan,
  type FilterStatus,
  type HasilKirimSatu,
  type RingkasanKirim,
} from "@/lib/shared/studio-soal/kirimBanyak";
import {
  LABEL_STATUS_SOAL,
  LABEL_TIPE_SOAL,
  cuplikRedaksi,
  type KelompokSubtes,
  type SoalRingkas,
  type StatusSoal,
  type StimulusRingkas,
  type StudioSoalMentorView,
} from "@/lib/shared/studio-soal/studioMentor";

/**
 * Studio Soal (Mentor) — PR 3a + 3b, UX-1, UX-2, UX-3. Subtes yang ditugaskan
 * Admin, daftar soal & bacaan tulisan mentor, satu pintu "+ Buat soal", filter
 * status, dan kirim banyak soal + bacaan sekaligus.
 *
 * Soal di dalam bacaan tampil menjorok di bawah bacaannya. Bacaan draf/ditolak
 * bisa dicentang (soalnya ikut terkirim bersama); soal di bacaan yang belum
 * terbit tidak punya checkbox sendiri.
 *
 * Kirim banyak memanggil endpoint kirim yang sudah ada satu per satu
 * (berurutan): /soal/:id/ajukan dan /stimulus/:id/ajukan. Server tetap
 * memeriksa pemilik, penugasan, dan kelengkapan; kegagalan satu item tidak
 * menghentikan yang lain.
 */

function formatTanggal(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

function ChipStatus({ status }: { status: string }) {
  return <span className={CHIP}>{LABEL_STATUS_SOAL[status as StatusSoal] ?? status}</span>;
}

const BARIS = "flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4";
const KOTAK = "mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary";

/** Checkbox "Pilih semua" dengan keadaan sebagian (indeterminate). */
function KotakPilihSemua({ keadaan, onChange, label }: { keadaan: "semua" | "sebagian" | "kosong"; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = keadaan === "sebagian";
  }, [keadaan]);
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-black">
      <input ref={ref} type="checkbox" className={KOTAK.replace("mt-1 ", "")} checked={keadaan === "semua"} onChange={onChange} />
      {label}
    </label>
  );
}

/** Checkbox kirim banyak untuk satu baris; tanpa checkbox = ruang kosong supaya teks tetap lurus. */
type Pilih = {
  boleh: boolean;
  dipilih: boolean;
  onToggle: () => void;
  catatan?: string;
  /** Alasan pertama isi belum lengkap (dihitung server saat memuat daftar). */
  belumLengkap?: string;
};

/** Penanda "Belum lengkap" + alasan singkat pertama. */
function PenandaBelumLengkap({ alasan }: { alasan?: string }) {
  if (!alasan) return null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
      <span className="rounded-full bg-danger-soft px-2 py-0.5 font-medium text-danger">Belum lengkap</span>
      <span className="text-muted">{alasan}</span>
    </p>
  );
}

function KotakBaris({ pilih, label }: { pilih?: Pilih; label: string }) {
  if (!pilih) return null;
  return pilih.boleh ? (
    <input type="checkbox" className={KOTAK} checked={pilih.dipilih} onChange={pilih.onToggle} aria-label={label} />
  ) : (
    <span className="w-4 shrink-0" aria-hidden />
  );
}

function BarisSoal({
  s,
  ditugaskan,
  pilih,
  diDalamBacaan = false,
}: {
  s: SoalRingkas;
  ditugaskan: boolean;
  /** Bila ada: checkbox kirim banyak. `catatan` = alasan tidak bisa dikirim sendiri. */
  pilih?: Pilih;
  /** Tampil menjorok di bawah baris bacaannya. */
  diDalamBacaan?: boolean;
}) {
  return (
    <li className={BARIS}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <KotakBaris pilih={pilih} label={`Pilih soal: ${cuplikRedaksi(s.redaksi, 60)}`} />
        <Link href={`/studio-soal/soal/${s.id}`} className="group flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="break-words text-sm text-black group-hover:text-primary sm:text-base">{cuplikRedaksi(s.redaksi)}</p>
          <p className="text-xs text-muted sm:text-sm">
            {LABEL_TIPE_SOAL[s.tipe] ?? s.tipe}
            {s.stimulusId && !diDalamBacaan ? " · bagian dari bacaan" : ""}
            {s.versi > 1 ? ` · versi ${s.versi}` : ""} · diubah {formatTanggal(s.updatedAt)}
          </p>
          <PenandaBelumLengkap alasan={pilih?.belumLengkap} />
          {pilih?.catatan ? <p className="text-xs text-muted">{pilih.catatan}</p> : null}
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-7 sm:pl-0">
        <ChipStatus status={s.status} />
        {tampilkanTombolHapus(s.status) ? (
          <TombolHapusDraf
            objek="soal"
            id={s.id}
            versi={s.versi}
            label="Hapus draf soal"
            alasan={alasanTidakBisaHapus("soal", { status: s.status, pernahDiajukan: s.pernahDiajukan ?? false, ditugaskan })}
          />
        ) : null}
      </div>
    </li>
  );
}

/** Satu bacaan + soal-soalnya (menjorok) dalam satu <li>. */
function GrupBacaanBaris({
  st,
  soal,
  ditugaskan,
  pilih,
  pilihSoal,
}: {
  st: StimulusRingkas;
  soal: SoalRingkas[];
  ditugaskan: boolean;
  pilih?: Pilih;
  pilihSoal?: (s: SoalRingkas) => Pilih;
}) {
  return (
    <li className="flex flex-col">
      <div className={BARIS}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <KotakBaris pilih={pilih} label={`Pilih bacaan: ${st.judul || "(tanpa judul)"}`} />
          <Link href={`/studio-soal/stimulus/${st.id}`} className="group flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="break-words text-sm text-black group-hover:text-primary sm:text-base">
              <span className="font-medium">Bacaan:</span> {st.judul || "(tanpa judul)"}
            </p>
            <p className="text-xs text-muted sm:text-sm">
              Dipakai {st.jumlahSoal} soal{st.versi > 1 ? ` · versi ${st.versi}` : ""} · diubah {formatTanggal(st.updatedAt)}
            </p>
            <PenandaBelumLengkap alasan={pilih?.belumLengkap} />
            {pilih?.catatan ? <p className="text-xs text-muted">{pilih.catatan}</p> : null}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-3 pl-7 sm:pl-0">
          <ChipStatus status={st.status} />
          {tampilkanTombolHapus(st.status) ? (
            <TombolHapusDraf
              objek="stimulus"
              id={st.id}
              versi={st.versi}
              label="Hapus draf bacaan"
              alasan={alasanTidakBisaHapus("stimulus", {
                status: st.status,
                pernahDiajukan: st.pernahDiajukan ?? false,
                ditugaskan,
                jumlahSoal: st.jumlahSoal,
              })}
            />
          ) : null}
        </div>
      </div>
      {soal.length > 0 ? (
        <ul className="mb-2 ml-2 flex flex-col divide-y divide-line border-l-2 border-line pl-4 sm:ml-7">
          {soal.map((s) => (
            <BarisSoal key={s.id} s={s} ditugaskan={ditugaskan} pilih={pilihSoal?.(s)} diDalamBacaan />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

const TANPA_PENANDA: Record<string, string> = {};

function denganStatus<T extends { id: string; status: string }>(x: T, statusLokal: ReadonlyMap<string, string>): T {
  const st = statusLokal.get(x.id);
  return st ? { ...x, status: st } : x;
}

export default function StudioSoalMentor({
  data,
  stimulus = [],
  belumLengkap = TANPA_PENANDA,
}: {
  data: StudioSoalMentorView;
  stimulus?: StimulusRingkas[];
  /** "soal:<id>" / "bacaan:<id>" -> alasan pertama isi belum lengkap (server, lib/mentor/studioSoal.ts). */
  belumLengkap?: Record<string, string>;
}) {
  const { jenisPindah, pindah } = useNavigasiSibuk<"kirim">();
  const [filter, setFilter] = useState<FilterStatus>("semua");
  /** Kunci "soal:<id>" / "bacaan:<id>". */
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  // Status setelah dikirim di halaman ini (sebelum daftar selesai disegarkan). Id soal & bacaan sama-sama UUID.
  const [statusLokal, setStatusLokal] = useState<Map<string, string>>(new Map());
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [proses, setProses] = useState<{ ke: number; dari: number } | null>(null);
  // Sibuk mengirim, atau daftar masih dimuat ulang sesudahnya (UX-4).
  const sedangKirim = proses !== null || jenisPindah !== null;
  const [ringkasan, setRingkasan] = useState<RingkasanKirim | null>(null);
  const sibukRef = useRef(false);
  const ringkasanRef = useRef<HTMLDivElement | null>(null);
  const idJudulKirim = useId();

  const bacaanSemua = useMemo(() => stimulus.map((b) => denganStatus(b, statusLokal)), [stimulus, statusLokal]);
  const bacaanDi = (subtesId: string) => bacaanSemua.filter((s) => s.subtesId === subtesId);
  const statusBacaan = useMemo(() => petaStatusBacaan(bacaanSemua), [bacaanSemua]);

  // Soal di subtes yang ditugaskan, dengan status terbaru.
  const kelompok = useMemo(
    () => data.ditugaskan.map((k) => ({ ...k, soal: k.soal.map((s) => denganStatus(s, statusLokal)) })),
    [data.ditugaskan, statusLokal],
  );
  const semuaSoal = useMemo(() => kelompok.flatMap((k) => k.soal), [kelompok]);
  const idDitugaskan = useMemo(() => new Set(data.ditugaskan.map((k) => k.subtesId)), [data.ditugaskan]);
  const bacaanDitugaskan = useMemo(() => bacaanSemua.filter((b) => idDitugaskan.has(b.subtesId)), [bacaanSemua, idDitugaskan]);
  const jumlah = useMemo(() => hitungPerStatus([...semuaSoal, ...bacaanDitugaskan]), [semuaSoal, bacaanDitugaskan]);

  /** Per kunci: boleh dicentang + catatan bila tidak + alasan belum lengkap. */
  const kelayakan = useMemo(() => {
    const peta = new Map<string, { boleh: boolean; catatan?: string; belumLengkap?: string }>();
    // Hanya draf/ditolak yang dinilai; status yang berubah di halaman ini (baru terkirim) tidak lagi.
    const alasanLengkap = (kunci: string, id: string, status: string) =>
      (status === "draf" || status === "ditolak") && !statusLokal.has(id) ? belumLengkap[kunci] : undefined;
    for (const s of semuaSoal) {
      const kunci = kunciItem("soal", s.id);
      const kurang = alasanLengkap(kunci, s.id, s.status);
      const dasar = kelayakanKirim(s, statusBacaan);
      const k = kelayakanDenganKelengkapan(dasar, kurang);
      // Catatan hanya untuk soal yang ikut bacaannya (bukan "Sudah dikirim." dsb.); belum lengkap tampil sendiri.
      const catatan = !dasar.boleh && s.stimulusId && (s.status === "draf" || s.status === "ditolak") ? dasar.alasan : undefined;
      peta.set(kunci, { boleh: k.boleh, catatan, belumLengkap: kurang });
    }
    for (const b of bacaanDitugaskan) {
      const kunci = kunciItem("bacaan", b.id);
      const kurang = alasanLengkap(kunci, b.id, b.status);
      const soalDi = semuaSoal.filter((s) => s.stimulusId === b.id);
      const dasar = kelayakanKirimBacaan(b, soalDi);
      const k = kelayakanDenganKelengkapan(dasar, kurang);
      const catatan = !dasar.boleh && (b.status === "draf" || b.status === "ditolak") ? dasar.alasan : undefined;
      peta.set(kunci, { boleh: k.boleh, catatan, belumLengkap: kurang });
    }
    return peta;
  }, [semuaSoal, bacaanDitugaskan, statusBacaan, belumLengkap, statusLokal]);
  const boleh = (kunci: string) => kelayakan.get(kunci)?.boleh === true;

  const namaItem = useMemo(() => {
    const peta = new Map<string, string>();
    for (const s of semuaSoal) peta.set(kunciItem("soal", s.id), cuplikRedaksi(s.redaksi, 80));
    for (const b of bacaanDitugaskan) peta.set(kunciItem("bacaan", b.id), `Bacaan: ${b.judul || "(tanpa judul)"}`);
    return peta;
  }, [semuaSoal, bacaanDitugaskan]);

  // Pilihan yang tidak lagi boleh (mis. baru terkirim) dibuang otomatis.
  const pilihanSah = useMemo(() => new Set([...terpilih].filter((k) => kelayakan.get(k)?.boleh === true)), [terpilih, kelayakan]);
  const nPilih = pilihanSah.size;
  const n = hitungPilihan(pilihanSah);
  const teksPilihan = teksJumlah(n.soal, n.bacaan);

  async function kirimSemua() {
    if (sibukRef.current) return;
    const antrean = antreanKirim(pilihanSah, new Set(), boleh);
    if (antrean.length === 0) return;
    sibukRef.current = true;
    setRingkasan(null);
    const hasil: HasilKirimSatu[] = [];
    for (let i = 0; i < antrean.length; i++) {
      const item = uraiKunci(antrean[i]);
      if (!item) continue;
      setProses({ ke: i + 1, dari: antrean.length });
      const id = item.id;
      const url = item.jenis === "soal" ? `/api/studio-soal/soal/${id}/ajukan` : `/api/studio-soal/stimulus/${id}/ajukan`;
      const r = await panggilApi(url, "POST");
      if (r.ok) {
        hasil.push({ id: item.id, jenis: item.jenis, ok: true });
        setStatusLokal((prev) => {
          const baru = new Map(prev).set(item.id, "diajukan");
          // Bacaan terkirim = soal draf/ditolak di dalamnya ikut terkirim (sama dengan RPC).
          if (item.jenis === "bacaan") {
            for (const s of semuaSoal) {
              if (s.stimulusId === item.id && (s.status === "draf" || s.status === "ditolak")) baru.set(s.id, "diajukan");
            }
          }
          return baru;
        });
      } else {
        const alasan = item.jenis === "bacaan" ? alasanDariJawabanBacaan(r.json) : alasanDariJawaban(r.json);
        hasil.push({ id: item.id, jenis: item.jenis, ok: false, alasan });
      }
    }
    sibukRef.current = false;
    setProses(null);
    // Jendela tetap terbuka ("Mengirim…") sampai daftar terbaru selesai dimuat;
    // state di dalam transition diterapkan bersama data baru.
    pindah("kirim", (r) => {
      setKonfirmasi(false);
      setTerpilih(new Set());
      setRingkasan(ringkasHasilKirim(hasil));
      r.refresh();
    });
  }

  // Gulir ke ringkasan hasil begitu tampil (sesudah daftar terbaru dimuat).
  useEffect(() => {
    if (ringkasan) ringkasanRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [ringkasan]);

  const pilihUntuk = (kunci: string): Pilih => ({
    boleh: boleh(kunci),
    catatan: kelayakan.get(kunci)?.catatan,
    belumLengkap: kelayakan.get(kunci)?.belumLengkap,
    dipilih: pilihanSah.has(kunci),
    onToggle: () => setTerpilih((prev) => ubahPilihan(prev, kunci, boleh(kunci))),
  });

  return (
    <div className={["flex flex-col gap-6", nPilih > 0 ? "pb-24" : ""].join(" ")}>
      {data.ditugaskan.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[20px] border-[0.8px] border-line bg-white px-5 py-12 text-center">
          <p className="text-base font-medium text-black">Anda belum ditugaskan menulis soal</p>
          <p className="max-w-[520px] text-sm text-muted">
            Admin yang memilih subtes yang bisa Anda tulis. Subtes di profil mengajar Anda tidak otomatis masuk ke sini.
            Hubungi Admin kalau ingin ikut menulis soal.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            Tulis soal untuk subtes di bawah ini. Setelah dikirim, soal dicek dulu oleh mentor lain sebelum terbit. Centang
            beberapa draf atau bacaan untuk mengirimnya sekaligus.
          </p>

          {ringkasan ? (
            <div
              ref={ringkasanRef}
              role={ringkasan.gagal.length > 0 ? "alert" : "status"}
              className={[
                "flex flex-col gap-2 rounded-[16px] border px-4 py-3 text-sm",
                ringkasan.gagal.length > 0 ? "border-danger-line bg-danger-soft" : "border-success-line bg-success-soft",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <p className={["font-medium", ringkasan.gagal.length > 0 ? "text-black" : "text-success"].join(" ")}>
                  {ringkasan.judul}
                </p>
                <button type="button" onClick={() => setRingkasan(null)} className="shrink-0 text-xs text-muted hover:underline">
                  Tutup
                </button>
              </div>
              {ringkasan.gagal.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {ringkasan.gagal.map((g) => (
                    <li key={g.id} className="flex flex-col gap-0.5 rounded-[12px] bg-white px-3 py-2">
                      <span className="break-words text-black">{namaItem.get(kunciItem(g.jenis, g.id)) ?? ""}</span>
                      <span className="text-danger">{g.alasan}</span>
                      <Link
                        href={g.jenis === "bacaan" ? `/studio-soal/stimulus/${g.id}` : `/studio-soal/soal/${g.id}`}
                        className="w-fit font-medium text-primary hover:underline"
                      >
                        Perbaiki →
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-black">Saring soal dan bacaan</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Saring soal dan bacaan berdasarkan status">
              {FILTER_STATUS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={filter === f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 ${pilihan(filter === f)}`}
                >
                  {LABEL_FILTER[f]} ({jumlah[f]})
                </button>
              ))}
            </div>
          </div>

          {kelompok.map((k) => (
            <BagianSubtes
              key={k.subtesId}
              k={k}
              filter={filter}
              bacaan={bacaanDi(k.subtesId)}
              terpilih={pilihanSah}
              setTerpilih={setTerpilih}
              pilihUntuk={pilihUntuk}
            />
          ))}
        </>
      )}

      {data.tidakDitugaskan.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium text-black sm:text-lg">Soal di subtes yang tidak lagi ditugaskan</h2>
            <p className="text-sm text-muted">
              Soal ini tetap tersimpan, tapi tidak bisa diubah atau dikirim sampai Admin menugaskan Anda lagi.
            </p>
          </div>
          {data.tidakDitugaskan.map((k) => {
            const { grup, mandiri } = susunDaftar(k.soal, bacaanDi(k.subtesId), "semua");
            return (
              <section
                key={k.subtesId}
                className="flex flex-col gap-2 rounded-[20px] border-[0.8px] border-line bg-surface px-5 py-4 sm:px-6"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-medium text-black">{k.nama}</h3>
                  <p className="shrink-0 text-sm text-muted">{k.soal.length} soal</p>
                </div>
                {grup.length + mandiri.length === 0 ? null : (
                  <ul className="flex flex-col divide-y divide-line">
                    {grup.map((g) => (
                      <GrupBacaanBaris key={g.bacaan.id} st={g.bacaan} soal={g.soal} ditugaskan={false} />
                    ))}
                    {mandiri.map((s) => (
                      <BarisSoal key={s.id} s={s} ditugaskan={false} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </section>
      ) : null}

      {/* ---- Bilah aksi kirim banyak ---- */}
      {nPilih > 0 ? (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-[16px] lg:border">
          <span className="text-sm text-black">
            {teksPilihan} dipilih{nPilih >= BATAS_KIRIM ? ` (maksimal ${BATAS_KIRIM} sekali kirim)` : ""}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setTerpilih(new Set())}>
              Batal pilih
            </Button>
            <Button size="sm" onClick={() => setKonfirmasi(true)}>
              Kirim {teksPilihan} untuk dicek
            </Button>
          </div>
        </div>
      ) : null}

      <Modal open={konfirmasi} onClose={() => (sedangKirim ? undefined : setKonfirmasi(false))} labelledBy={idJudulKirim}>
        <div className="flex flex-col gap-4">
          <h2 id={idJudulKirim} className="pr-8 text-lg font-medium text-black">Kirim {teksPilihan} untuk dicek?</h2>
          <p className="text-sm text-black">
            Yang terkirim dikunci sampai selesai dicek. Yang belum lengkap tidak ikut terkirim — alasannya akan
            ditampilkan supaya bisa diperbaiki.
          </p>
          {n.bacaan > 0 ? (
            <p className="text-sm text-muted">
              Bacaan dikirim bersama semua soal drafnya. Kalau ada satu soal yang belum lengkap, bacaan itu dan semua
              soalnya tidak terkirim.
            </p>
          ) : null}
          <p className="text-sm text-muted" aria-live="polite">
            {proses ? (
              <span className="inline-flex items-center gap-1.5">
                <MaskotLoading size="xs" />
                Mengirim {proses.ke} dari {proses.dari}…
              </span>
            ) : jenisPindah ? (
              <span className="inline-flex items-center gap-1.5">
                <MaskotLoading size="xs" />
                Memperbarui daftar…
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setKonfirmasi(false)} disabled={sedangKirim}>
              Batal
            </Button>
            <Button size="sm" onClick={kirimSemua} disabled={sedangKirim} aria-busy={sedangKirim}>
              <TeksSibuk sibuk={sedangKirim} teks="Mengirim…">
                Ya, kirim
              </TeksSibuk>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BagianSubtes({
  k,
  filter,
  bacaan,
  terpilih,
  setTerpilih,
  pilihUntuk,
}: {
  k: KelompokSubtes;
  filter: FilterStatus;
  bacaan: StimulusRingkas[];
  terpilih: ReadonlySet<string>;
  setTerpilih: (fn: (prev: Set<string>) => Set<string>) => void;
  pilihUntuk: (kunci: string) => Pilih;
}) {
  const { grup, mandiri } = susunDaftar(k.soal, bacaan, filter);
  // Urutan yang terlihat: bacaan, soal di dalamnya, lalu soal biasa — untuk "Pilih semua".
  const ringkasTerlihat = [
    ...grup.flatMap((g) => [kunciItem("bacaan", g.bacaan.id), ...g.soal.map((s) => kunciItem("soal", s.id))]),
    ...mandiri.map((s) => kunciItem("soal", s.id)),
  ].map((id) => ({ id, boleh: pilihUntuk(id).boleh }));
  const adaBoleh = ringkasTerlihat.some((t) => t.boleh);
  const kosong = k.soal.length === 0 && bacaan.length === 0;

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-line bg-white px-5 py-4 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-medium text-black sm:text-lg">{k.nama}</h2>
          <p className="shrink-0 text-sm text-muted">
            {k.soal.length} soal{bacaan.length > 0 ? ` · ${bacaan.length} bacaan` : ""}
          </p>
        </div>
        <Link href={`/studio-soal/buat?subtes=${k.subtesId}`} className={buttonClassName({ size: "sm" })}>
          + Buat soal
        </Link>
      </div>
      {kosong ? (
        <p className="text-sm text-muted">Belum ada soal di subtes ini.</p>
      ) : ringkasTerlihat.length === 0 ? (
        <p className="text-sm text-muted">Tidak ada soal atau bacaan dengan status “{LABEL_FILTER[filter]}” di subtes ini.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {adaBoleh ? (
            <KotakPilihSemua
              keadaan={keadaanPilihSemua(terpilih, ringkasTerlihat)}
              onChange={() => setTerpilih((prev) => pilihSemua(prev, ringkasTerlihat))}
              label="Pilih semua yang bisa dikirim"
            />
          ) : null}
          <ul className="flex flex-col divide-y divide-line">
            {grup.map((g) => (
              <GrupBacaanBaris
                key={g.bacaan.id}
                st={g.bacaan}
                soal={g.soal}
                ditugaskan
                pilih={pilihUntuk(kunciItem("bacaan", g.bacaan.id))}
                pilihSoal={(s) => pilihUntuk(kunciItem("soal", s.id))}
              />
            ))}
            {mandiri.map((s) => (
              <BarisSoal key={s.id} s={s} ditugaskan pilih={pilihUntuk(kunciItem("soal", s.id))} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
