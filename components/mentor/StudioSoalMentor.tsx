"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { buttonClassName } from "@/components/ui/buttonClassName";
import TombolHapusDraf from "@/components/studio-soal/TombolHapusDraf";
import { CHIP, pilihan } from "@/components/studio-soal/gaya";
import { panggilApi } from "@/components/studio-soal/klien";
import { alasanTidakBisaHapus, tampilkanTombolHapus } from "@/lib/shared/studio-soal/hapusDraf";
import {
  BATAS_KIRIM,
  FILTER_STATUS,
  LABEL_FILTER,
  alasanDariJawaban,
  antreanKirim,
  hitungPerStatus,
  kelayakanKirim,
  keadaanPilihSemua,
  petaStatusBacaan,
  pilihSemua,
  ringkasHasilKirim,
  saringStatus,
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
 * Studio Soal (Mentor) — PR 3a + 3b, UX-1, UX-2. Subtes yang ditugaskan Admin,
 * daftar soal & bacaan tulisan mentor, satu pintu "+ Buat soal", filter
 * status, dan kirim banyak soal sekaligus.
 *
 * Kirim banyak memanggil endpoint kirim yang sudah ada satu per satu
 * (berurutan). Server tetap memeriksa pemilik, penugasan, dan kelengkapan
 * setiap soal; kegagalan satu soal tidak menghentikan yang lain.
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

function BarisSoal({
  s,
  ditugaskan,
  pilih,
}: {
  s: SoalRingkas;
  ditugaskan: boolean;
  /** Bila ada: checkbox kirim banyak. `catatan` = alasan tidak bisa dikirim sendiri. */
  pilih?: { boleh: boolean; dipilih: boolean; onToggle: () => void; catatan?: string };
}) {
  return (
    <li className={BARIS}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {pilih ? (
          pilih.boleh ? (
            <input
              type="checkbox"
              className={KOTAK}
              checked={pilih.dipilih}
              onChange={pilih.onToggle}
              aria-label={`Pilih soal: ${cuplikRedaksi(s.redaksi, 60)}`}
            />
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )
        ) : null}
        <Link href={`/studio-soal/soal/${s.id}`} className="group flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="break-words text-sm text-black group-hover:text-primary sm:text-base">{cuplikRedaksi(s.redaksi)}</p>
          <p className="text-xs text-muted sm:text-sm">
            {LABEL_TIPE_SOAL[s.tipe] ?? s.tipe}
            {s.stimulusId ? " · bagian dari bacaan" : ""}
            {s.versi > 1 ? ` · versi ${s.versi}` : ""} · diubah {formatTanggal(s.updatedAt)}
          </p>
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
            alasan={alasanTidakBisaHapus("soal", { status: s.status, pernahDiajukan: s.pernahDiajukan ?? false, ditugaskan })}
          />
        ) : null}
      </div>
    </li>
  );
}

function DaftarBacaan({ stimulus, ditugaskan }: { stimulus: StimulusRingkas[]; ditugaskan: boolean }) {
  if (stimulus.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium text-black">Bacaan / teks pendukung</h3>
      <ul className="flex flex-col divide-y divide-line">
        {stimulus.map((st) => (
          <li key={st.id} className={BARIS}>
            <Link href={`/studio-soal/stimulus/${st.id}`} className="group flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="break-words text-sm text-black group-hover:text-primary">{st.judul || "(tanpa judul)"}</p>
              <p className="text-xs text-muted">
                Dipakai {st.jumlahSoal} soal{st.versi > 1 ? ` · versi ${st.versi}` : ""} · diubah {formatTanggal(st.updatedAt)}
              </p>
            </Link>
            <div className="flex shrink-0 items-center gap-3">
              <ChipStatus status={st.status} />
              {tampilkanTombolHapus(st.status) ? (
                <TombolHapusDraf
                  objek="stimulus"
                  id={st.id}
                  versi={st.versi}
                  alasan={alasanTidakBisaHapus("stimulus", {
                    status: st.status,
                    pernahDiajukan: st.pernahDiajukan ?? false,
                    ditugaskan,
                    jumlahSoal: st.jumlahSoal,
                  })}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StudioSoalMentor({
  data,
  stimulus = [],
}: {
  data: StudioSoalMentorView;
  stimulus?: StimulusRingkas[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterStatus>("semua");
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  // Status setelah dikirim di halaman ini (sebelum daftar selesai disegarkan).
  const [statusLokal, setStatusLokal] = useState<Map<string, string>>(new Map());
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [proses, setProses] = useState<{ ke: number; dari: number } | null>(null);
  const [ringkasan, setRingkasan] = useState<RingkasanKirim | null>(null);
  const sibukRef = useRef(false);
  const ringkasanRef = useRef<HTMLDivElement | null>(null);

  const stimulusDi = (subtesId: string) => stimulus.filter((s) => s.subtesId === subtesId);
  const statusBacaan = useMemo(() => petaStatusBacaan(stimulus), [stimulus]);

  // Soal di subtes yang ditugaskan, dengan status terbaru.
  const kelompok = useMemo(
    () =>
      data.ditugaskan.map((k) => ({
        ...k,
        soal: k.soal.map((s) => (statusLokal.has(s.id) ? { ...s, status: statusLokal.get(s.id) as string } : s)),
      })),
    [data.ditugaskan, statusLokal],
  );
  const semuaSoal = useMemo(() => kelompok.flatMap((k) => k.soal), [kelompok]);
  const jumlah = useMemo(() => hitungPerStatus(semuaSoal), [semuaSoal]);
  const bolehKirim = useMemo(() => {
    const peta = new Map<string, boolean>();
    for (const s of semuaSoal) peta.set(s.id, kelayakanKirim(s, statusBacaan).boleh);
    return peta;
  }, [semuaSoal, statusBacaan]);
  const redaksiDari = useMemo(() => new Map(semuaSoal.map((s) => [s.id, s.redaksi])), [semuaSoal]);

  // Pilihan yang tidak lagi boleh (mis. baru terkirim) dibuang otomatis.
  const pilihanSah = useMemo(() => new Set([...terpilih].filter((id) => bolehKirim.get(id))), [terpilih, bolehKirim]);
  const nPilih = pilihanSah.size;

  async function kirimSemua() {
    if (sibukRef.current) return;
    const antrean = antreanKirim(pilihanSah, new Set(), (id) => bolehKirim.get(id) === true);
    if (antrean.length === 0) return;
    sibukRef.current = true;
    setRingkasan(null);
    const hasil: HasilKirimSatu[] = [];
    for (let i = 0; i < antrean.length; i++) {
      const id = antrean[i];
      setProses({ ke: i + 1, dari: antrean.length });
      const r = await panggilApi(`/api/studio-soal/soal/${id}/ajukan`, "POST");
      if (r.ok) {
        hasil.push({ id, ok: true });
        setStatusLokal((prev) => new Map(prev).set(id, "diajukan"));
      } else {
        hasil.push({ id, ok: false, alasan: alasanDariJawaban(r.json) });
      }
    }
    sibukRef.current = false;
    setProses(null);
    setKonfirmasi(false);
    setTerpilih(new Set());
    setRingkasan(ringkasHasilKirim(hasil));
    router.refresh();
    requestAnimationFrame(() => ringkasanRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

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
            beberapa draf untuk mengirimnya sekaligus.
          </p>

          {ringkasan ? (
            <div
              ref={ringkasanRef}
              role="status"
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
                      <span className="break-words text-black">{cuplikRedaksi(redaksiDari.get(g.id) ?? "", 80)}</span>
                      <span className="text-danger">{g.alasan}</span>
                      <Link href={`/studio-soal/soal/${g.id}`} className="w-fit font-medium text-primary hover:underline">
                        Perbaiki →
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-black">Saring soal</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Saring soal berdasarkan status">
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
              bacaan={stimulusDi(k.subtesId)}
              statusBacaan={statusBacaan}
              terpilih={pilihanSah}
              setTerpilih={setTerpilih}
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
          {data.tidakDitugaskan.map((k) => (
            <section
              key={k.subtesId}
              className="flex flex-col gap-2 rounded-[20px] border-[0.8px] border-line bg-surface px-5 py-4 sm:px-6"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-medium text-black">{k.nama}</h3>
                <p className="shrink-0 text-sm text-muted">{k.soal.length} soal</p>
              </div>
              <DaftarBacaan stimulus={stimulusDi(k.subtesId)} ditugaskan={false} />
              {k.soal.length === 0 ? null : (
                <ul className="flex flex-col divide-y divide-line">
                  {k.soal.map((s) => (
                    <BarisSoal key={s.id} s={s} ditugaskan={false} />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </section>
      ) : null}

      {/* ---- Bilah aksi kirim banyak ---- */}
      {nPilih > 0 ? (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-[16px] lg:border">
          <span className="text-sm text-black">
            {nPilih} soal dipilih{nPilih >= BATAS_KIRIM ? ` (maksimal ${BATAS_KIRIM} sekali kirim)` : ""}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setTerpilih(new Set())}>
              Batal pilih
            </Button>
            <Button size="sm" onClick={() => setKonfirmasi(true)}>
              Kirim {nPilih} soal untuk dicek
            </Button>
          </div>
        </div>
      ) : null}

      <Modal open={konfirmasi} onClose={() => (proses ? undefined : setKonfirmasi(false))}>
        <div className="flex flex-col gap-4">
          <h2 className="pr-8 text-lg font-medium text-black">Kirim {nPilih} soal untuk dicek?</h2>
          <p className="text-sm text-black">
            Soal yang terkirim dikunci sampai selesai dicek. Soal yang belum lengkap tidak ikut terkirim — alasannya akan
            ditampilkan supaya bisa diperbaiki.
          </p>
          {proses ? (
            <p className="text-sm text-muted" aria-live="polite">
              Mengirim {proses.ke} dari {proses.dari}…
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setKonfirmasi(false)} disabled={proses !== null}>
              Batal
            </Button>
            <Button size="sm" onClick={kirimSemua} disabled={proses !== null}>
              {proses ? "Mengirim…" : "Ya, kirim"}
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
  statusBacaan,
  terpilih,
  setTerpilih,
}: {
  k: KelompokSubtes;
  filter: FilterStatus;
  bacaan: StimulusRingkas[];
  statusBacaan: ReadonlyMap<string, string>;
  terpilih: ReadonlySet<string>;
  setTerpilih: (fn: (prev: Set<string>) => Set<string>) => void;
}) {
  const terlihat = saringStatus(k.soal, filter).map((s) => {
    const kel = kelayakanKirim(s, statusBacaan);
    return { s, boleh: kel.boleh, catatan: !kel.boleh && s.stimulusId && (s.status === "draf" || s.status === "ditolak") ? kel.alasan : undefined };
  });
  const ringkasTerlihat = terlihat.map((t) => ({ id: t.s.id, boleh: t.boleh }));
  const adaBoleh = terlihat.some((t) => t.boleh);

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-line bg-white px-5 py-4 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-medium text-black sm:text-lg">{k.nama}</h2>
          <p className="shrink-0 text-sm text-muted">{k.soal.length} soal</p>
        </div>
        <Link href={`/studio-soal/buat?subtes=${k.subtesId}`} className={buttonClassName({ size: "sm" })}>
          + Buat soal
        </Link>
      </div>
      <DaftarBacaan stimulus={bacaan} ditugaskan />
      {k.soal.length === 0 ? (
        <p className="text-sm text-muted">Belum ada soal di subtes ini.</p>
      ) : terlihat.length === 0 ? (
        <p className="text-sm text-muted">Tidak ada soal dengan status “{LABEL_FILTER[filter]}” di subtes ini.</p>
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
            {terlihat.map(({ s, boleh, catatan }) => (
              <BarisSoal
                key={s.id}
                s={s}
                ditugaskan
                pilih={{
                  boleh,
                  catatan,
                  dipilih: terpilih.has(s.id),
                  onToggle: () => setTerpilih((prev) => ubahPilihan(prev, s.id, boleh)),
                }}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
