"use client";

import { useState } from "react";
import TeksKaya from "@/components/studio-soal/TeksKaya";
import StimulusPratinjau from "@/components/studio-soal/StimulusPratinjau";
import { nilaiJawaban, type HasilNilai } from "@/lib/shared/studio-soal/nilaiJawaban";
import { parseAngka } from "@/lib/shared/studio-soal/angka";
import type { BlokStimulus } from "@/lib/shared/studio-soal/tipe";

/**
 * Pratinjau soal + "uji kunci jawaban": mentor menjawab sendiri seperti
 * siswa, lalu jawabannya dinilai dengan nilaiJawaban — fungsi penilaian yang
 * SAMA dengan yang nanti menilai siswa. Kalau jawaban yang menurut mentor
 * benar dinilai salah, kuncinya yang keliru (ketahuan sebelum diajukan).
 */

type Obj = Record<string, unknown>;
const objek = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const daftar = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export interface SoalUntukPratinjau {
  tipe: string;
  redaksi: string;
  konten: Obj;
  kunci: Obj;
  pembahasan: string;
}

function petunjukAngka(teks: string): string | null {
  if (teks.trim() === "") return null;
  const p = parseAngka(teks);
  if (!p) return "bukan angka yang dikenali";
  return p.q === BigInt(1) ? `dibaca ${p.p}` : `dibaca ${p.p}/${p.q}`;
}

export default function SoalPratinjau({
  soal,
  stimulus,
}: {
  soal: SoalUntukPratinjau;
  stimulus?: BlokStimulus[] | null;
}) {
  const [opsi, setOpsi] = useState<string | null>(null);
  const [perBaris, setPerBaris] = useState<Record<string, number>>({});
  const [isian, setIsian] = useState<Record<string, string>>({});
  const [hasil, setHasil] = useState<{ nilai: HasilNilai; jejak: string } | null>(null);
  const [tampilKunci, setTampilKunci] = useState(false);

  // Hasil uji hanya berlaku untuk isi soal saat diperiksa.
  const jejak = JSON.stringify([soal.tipe, soal.konten, soal.kunci, soal.redaksi]);
  const hasilBerlaku = hasil && hasil.jejak === jejak ? hasil.nilai : null;
  const statusBagian = new Map((hasilBerlaku?.bagian ?? []).map((b) => [b.id, b.benar]));

  const konten = objek(soal.konten);
  const kunci = objek(soal.kunci);

  function periksa() {
    const jawaban =
      soal.tipe === "pilihan_ganda"
        ? { opsi }
        : soal.tipe === "majemuk_kompleks"
          ? { per_baris: perBaris }
          : { rumpang: isian };
    try {
      setHasil({ nilai: nilaiJawaban({ tipe: soal.tipe, konten, kunci, aturan_skor: "semua_benar", bobot: 1 }, jawaban), jejak });
    } catch {
      setHasil(null);
    }
  }

  function ulangi() {
    setOpsi(null);
    setPerBaris({});
    setIsian({});
    setHasil(null);
  }

  const tandaBagian = (id: string) => {
    const s = statusBagian.get(id);
    if (s === undefined) return null;
    return s ? (
      <span className="text-xs font-medium text-success">✓ benar</span>
    ) : (
      <span className="text-xs font-medium text-danger">✗ salah</span>
    );
  };

  const kunciRumpang = objek(kunci.rumpang);
  const rumpang = daftar<{ id: string; jenis: string }>(konten.rumpang);
  const jenisRumpang = new Map(rumpang.map((r) => [r.id, r.jenis]));

  return (
    <div className="flex flex-col gap-4">
      {stimulus && stimulus.length > 0 ? (
        <div className="rounded-[16px] border border-line bg-surface p-4">
          <StimulusPratinjau blok={stimulus} />
        </div>
      ) : null}

      <div className="text-sm text-black sm:text-base">
        {soal.tipe === "isian" ? (
          <TeksKaya
            teks={soal.redaksi}
            kosong="(teks soal masih kosong)"
            rumpang={(id) =>
              jenisRumpang.has(id) ? (
                <span className="mx-1 inline-flex items-baseline gap-1">
                  <input
                    value={isian[id] ?? ""}
                    onChange={(e) => setIsian((p) => ({ ...p, [id]: e.target.value }))}
                    inputMode={jenisRumpang.get(id) === "angka" ? "decimal" : "text"}
                    aria-label={`Jawaban kotak ${id}`}
                    className="w-28 rounded-[8px] border border-subtle px-2 py-0.5 text-sm outline-none focus:border-primary"
                  />
                  {tandaBagian(id)}
                </span>
              ) : (
                <span className="text-xs text-danger">{`{{${id}}}`} (kotak jawaban ini tidak ada)</span>
              )
            }
          />
        ) : (
          <TeksKaya teks={soal.redaksi} kosong="(teks soal masih kosong)" />
        )}
      </div>

      {soal.tipe === "pilihan_ganda" ? (
        <div role="radiogroup" aria-label="Pilihan jawaban" className="flex flex-col gap-2">
          {daftar<{ label: string; teks: string }>(konten.opsi).map((o) => {
            const dipilih = opsi === o.label;
            const kunciIni = tampilKunci && kunci.opsi === o.label;
            return (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={dipilih}
                onClick={() => setOpsi(o.label)}
                className={[
                  "flex items-start gap-3 rounded-[12px] border px-3 py-2 text-left text-sm transition-colors",
                  dipilih ? "border-primary bg-primary-soft" : "border-line bg-white hover:border-primary",
                  kunciIni ? "ring-2 ring-success" : "",
                ].join(" ")}
              >
                <span className="font-medium">{o.label}.</span>
                <TeksKaya teks={o.teks} kosong="(opsi kosong)" className="flex-1" sebaris />
                {kunciIni ? <span className="text-xs font-medium text-success">kunci</span> : null}
              </button>
            );
          })}
          {tandaBagian("opsi")}
        </div>
      ) : null}

      {soal.tipe === "majemuk_kompleks" ? (
        <div className="flex flex-col gap-2">
          {daftar<{ id: string; teks: string }>(konten.pernyataan).map((p, i) => {
            const label = daftar<string>(konten.label_kolom);
            const kunciBaris = objek(kunci.per_baris)[p.id];
            return (
              <div key={p.id} className="flex flex-col gap-2 rounded-[12px] border border-line bg-white px-3 py-2">
                <div className="flex items-start gap-2 text-sm">
                  <span className="font-medium">{i + 1}.</span>
                  <TeksKaya teks={p.teks} kosong="(pernyataan kosong)" className="flex-1" />
                  {tandaBagian(p.id)}
                </div>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Jawaban pernyataan ${i + 1}`}>
                  {[0, 1].map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={perBaris[p.id] === k}
                      onClick={() => setPerBaris((prev) => ({ ...prev, [p.id]: k }))}
                      className={[
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        perBaris[p.id] === k ? "border-primary bg-primary text-white" : "border-line-strong bg-white text-black",
                        tampilKunci && kunciBaris === k ? "ring-2 ring-success ring-offset-1" : "",
                      ].join(" ")}
                    >
                      {label[k] || (k === 0 ? "Kolom 1" : "Kolom 2")}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {soal.tipe === "isian" && rumpang.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-muted">
          {rumpang
            .filter((r) => r.jenis === "angka" && (isian[r.id] ?? "").trim() !== "")
            .map((r) => (
              <li key={r.id}>
                Kotak {r.id}: {petunjukAngka(isian[r.id] ?? "")}
              </li>
            ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 rounded-[16px] border border-dashed border-line-strong bg-surface p-3">
        <p className="text-xs text-muted">
          Uji kunci jawaban: jawab sendiri seperti siswa, lalu periksa. Penilaiannya sama dengan yang dipakai untuk siswa.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={periksa}
            className="rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-80"
          >
            Periksa jawaban
          </button>
          <button
            type="button"
            onClick={ulangi}
            className="rounded-full border border-line-strong bg-white px-4 py-1.5 text-sm font-medium text-black"
          >
            Ulangi
          </button>
          <button
            type="button"
            aria-pressed={tampilKunci}
            onClick={() => setTampilKunci((v) => !v)}
            className="rounded-full border border-line-strong bg-white px-4 py-1.5 text-sm font-medium text-black"
          >
            {tampilKunci ? "Sembunyikan kunci & pembahasan" : "Tampilkan kunci & pembahasan"}
          </button>
        </div>
        {hasil && !hasilBerlaku ? (
          <p className="text-sm text-muted">Soal berubah sejak diperiksa — periksa lagi.</p>
        ) : hasilBerlaku ? (
          <p
            role="status"
            className={["text-sm font-medium", hasilBerlaku.benar ? "text-success" : "text-danger"].join(" ")}
          >
            {hasilBerlaku.benar
              ? "Benar — jawaban Anda cocok dengan kunci."
              : `Salah — ${hasilBerlaku.bagian.filter((b) => b.benar).length} dari ${hasilBerlaku.bagian.length} bagian benar. Bila menurut Anda jawaban ini benar, periksa kuncinya.`}
          </p>
        ) : null}
      </div>

      {tampilKunci ? (
        <div className="flex flex-col gap-2 rounded-[16px] border border-success-line bg-success-soft p-3 text-sm">
          {soal.tipe === "pilihan_ganda" ? (
            <p>
              <span className="font-medium">Kunci:</span> {typeof kunci.opsi === "string" ? kunci.opsi : "(belum dipilih)"}
            </p>
          ) : null}
          {soal.tipe === "majemuk_kompleks" ? (
            <p>
              <span className="font-medium">Kunci:</span>{" "}
              {daftar<{ id: string }>(konten.pernyataan)
                .map((p, i) => {
                  const k = objek(kunci.per_baris)[p.id];
                  const label = daftar<string>(konten.label_kolom);
                  return `${i + 1}. ${k === 0 || k === 1 ? label[k] || `Kolom ${k + 1}` : "(belum)"}`;
                })
                .join(" · ")}
            </p>
          ) : null}
          {soal.tipe === "isian"
            ? rumpang.map((r) => {
                const k = objek(kunciRumpang[r.id]);
                const diterima = daftar<string>(k.diterima).filter((d) => d.trim() !== "");
                return (
                  <p key={r.id}>
                    <span className="font-medium">{r.id}</span> ({r.jenis}): {diterima.length ? diterima.join(" / ") : "(belum diisi)"}
                    {k.toleransi !== undefined && k.toleransi !== null ? ` · toleransi ${String(k.toleransi)}` : ""}
                  </p>
                );
              })
            : null}
          <div>
            <p className="font-medium">Pembahasan</p>
            <TeksKaya teks={soal.pembahasan} kosong="(pembahasan kosong)" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
