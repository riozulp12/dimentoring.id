"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import TeksKaya from "@/components/studio-soal/TeksKaya";
import { panjangKarakter } from "@/lib/shared/studio-soal/teks";

/**
 * Textarea dengan tombol sisip format (rumus sebaris/blok, tebal, miring),
 * penghitung karakter (per karakter = sama dengan batas database), dan pesan
 * error per field. Dipakai form soal & stimulus.
 */

const FORMAT: { label: string; judul: string; buka: string; tutup: string }[] = [
  { label: "Rumus", judul: "Sisipkan rumus sebaris \\( … \\)", buka: "\\(", tutup: "\\)" },
  { label: "Rumus blok", judul: "Sisipkan rumus blok \\[ … \\]", buka: "\\[", tutup: "\\]" },
  { label: "Tebal", judul: "Tebal **…**", buka: "**", tutup: "**" },
  { label: "Miring", judul: "Miring *…*", buka: "*", tutup: "*" },
];

export function PesanError({ pesan }: { pesan?: string[] }) {
  if (!pesan || pesan.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5">
      {pesan.map((p, i) => (
        <li key={i} className="text-xs text-danger sm:text-sm">
          {p}
        </li>
      ))}
    </ul>
  );
}

export default function TextareaKaya({
  id,
  label,
  value,
  onChange,
  maks,
  rows = 4,
  error,
  petunjuk,
  tombolTambahan,
  inputRef,
  disabled = false,
  format = true,
  wajib = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maks?: number;
  rows?: number;
  error?: string[];
  petunjuk?: ReactNode;
  tombolTambahan?: ReactNode;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  /** Tampilkan tombol sisip rumus/tebal/miring. */
  format?: boolean;
  wajib?: boolean;
}) {
  const refSendiri = useRef<HTMLTextAreaElement | null>(null);
  const ref = inputRef ?? refSendiri;
  const panjang = panjangKarakter(value);

  function bungkus(buka: string, tutup: string) {
    const el = ref.current;
    if (!el) return;
    const awal = el.selectionStart ?? value.length;
    const akhir = el.selectionEnd ?? value.length;
    const terpilih = value.slice(awal, akhir);
    onChange(value.slice(0, awal) + buka + terpilih + tutup + value.slice(akhir));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(awal + buka.length, awal + buka.length + terpilih.length);
    });
  }

  const adaError = Boolean(error && error.length > 0);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-black">
          {label}
          {wajib ? <span className="text-danger"> *</span> : null}
        </label>
        {maks ? (
          <span className={["text-xs", panjang > maks ? "text-danger" : "text-subtle"].join(" ")}>
            {panjang.toLocaleString("id-ID")}/{maks.toLocaleString("id-ID")}
          </span>
        ) : null}
      </div>
      {(format || tombolTambahan) && !disabled ? (
        <div className="flex flex-wrap gap-1.5">
          {format
            ? FORMAT.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  title={f.judul}
                  onClick={() => bungkus(f.buka, f.tutup)}
                  className="rounded-[8px] border border-line-strong bg-white px-2.5 py-1 text-xs font-medium text-black hover:border-primary"
                >
                  {f.label}
                </button>
              ))
            : null}
          {tombolTambahan}
        </div>
      ) : null}
      <textarea
        id={id}
        ref={ref}
        value={value}
        rows={rows}
        disabled={disabled}
        aria-invalid={adaError}
        onChange={(e) => onChange(e.target.value)}
        className={[
          "w-full resize-y rounded-[12px] border bg-white px-3 py-2 text-sm text-black outline-none transition-colors focus:border-black disabled:bg-surface-muted disabled:text-muted sm:text-base",
          adaError ? "border-danger" : "border-subtle",
        ].join(" ")}
      />
      {petunjuk ? <div className="text-xs text-muted">{petunjuk}</div> : null}
      <PesanError pesan={error} />
    </div>
  );
}

const CONTOH: [string, string][] = [
  ["Pangkat", "\\(x^2 + y^3\\)"],
  ["Pecahan", "\\(\\frac{a}{b}\\)"],
  ["Akar", "\\(\\sqrt{2}\\), \\(\\sqrt[3]{x}\\)"],
  ["Kali, bagi", "\\(3 \\times 4 \\div 2\\)"],
  ["Pertidaksamaan", "\\(x \\le 5\\), \\(y \\ge 1\\), \\(a \\ne b\\)"],
  ["Simbol", "\\(\\pi\\), \\(\\alpha\\), \\(\\infty\\), \\(\\pm\\)"],
  ["Indeks bawah", "\\(U_n\\), \\(\\log_2 8\\)"],
  ["Tebal / miring", "**penting**, *istilah*"],
];

/** Contekan singkat cara menulis rumus & format. */
export function ContekanRumus() {
  return (
    <details className="rounded-[12px] border border-line bg-white px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-black">Cara menulis rumus & format</summary>
      <div className="mt-2 flex flex-col gap-2 text-foreground">
        <p className="text-xs text-muted">
          Rumus ditulis di antara <code>\(</code> dan <code>\)</code> (sebaris) atau <code>\[</code> dan <code>\]</code> (baris
          sendiri). Tanda <code>$</code> tidak dipakai. Baris kosong = paragraf baru. Tulis <code>\*</code> untuk bintang biasa.
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {CONTOH.map(([nama, kode]) => (
            <div key={nama} className="flex flex-col rounded-[8px] bg-surface px-2 py-1.5">
              <span className="text-xs text-muted">{nama}</span>
              <code className="break-all text-xs">{kode}</code>
              <TeksKaya teks={kode} className="text-sm" />
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
