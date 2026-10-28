"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";
import EditorRumus from "@/components/studio-soal/EditorRumus";
import { rumusDiPosisi, sisipkanRumus, type RentangRumus } from "@/lib/shared/studio-soal/sisipRumus";
import { panjangKarakter } from "@/lib/shared/studio-soal/teks";

/**
 * Textarea dengan tombol "Sisipkan rumus" (editor rumus visual, UX-3 D),
 * tombol sisip format (kode rumus sebaris/blok, tebal, miring), penghitung
 * karakter (per karakter = sama dengan batas database), dan pesan error per
 * field. Dipakai form soal & stimulus (teks soal, pilihan jawaban, pernyataan,
 * pembahasan, teks bacaan).
 *
 * Bila kursor berada di dalam rumus yang sudah ada, "Sisipkan rumus" membuka
 * editor dengan rumus itu terisi dan menggantinya saat disimpan.
 */

const FORMAT: { label: string; judul: string; buka: string; tutup: string }[] = [
  { label: "Kode rumus", judul: "Tulis kode rumus sebaris \\( … \\)", buka: "\\(", tutup: "\\)" },
  { label: "Kode rumus blok", judul: "Tulis kode rumus di baris sendiri \\[ … \\]", buka: "\\[", tutup: "\\]" },
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
  const [editor, setEditor] = useState<{
    pilihan: { awal: number; akhir: number };
    ganti: RentangRumus | null;
  } | null>(null);

  function bukaEditor() {
    const el = ref.current;
    const awal = el?.selectionStart ?? value.length;
    const akhir = el?.selectionEnd ?? awal;
    setEditor({ pilihan: { awal, akhir }, ganti: rumusDiPosisi(value, awal) });
  }

  function sisip(tex: string, blok: boolean) {
    if (!editor) return;
    const hasil = sisipkanRumus(value, editor.pilihan, tex, blok, editor.ganti);
    onChange(hasil.teks);
    setEditor(null);
    const el = ref.current;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(hasil.kursor, hasil.kursor);
    });
  }

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
          {format ? (
            <button
              type="button"
              onClick={bukaEditor}
              title="Buka editor rumus. Taruh kursor di dalam rumus yang ada untuk mengubahnya."
              className="rounded-[8px] border border-primary bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary hover:bg-white"
            >
              Sisipkan rumus
            </button>
          ) : null}
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
      {editor ? (
        <EditorRumus
          awal={editor.ganti?.tex ?? ""}
          blokAwal={editor.ganti?.blok ?? false}
          mengubah={editor.ganti !== null}
          onSisip={sisip}
          onBatal={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}

/** Petunjuk singkat rumus & format (menggantikan contekan panjang, UX-3 D). */
export function ContekanRumus() {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] bg-surface px-3 py-2 text-xs text-muted">
      <p>
        <span className="font-medium text-black">Rumus:</span> tekan “Sisipkan rumus”, lalu ketik seperti di kalkulator —{" "}
        <code>/</code> untuk pecahan, <code>^</code> untuk pangkat, <code>sqrt</code> untuk akar. Taruh kursor di rumus yang
        sudah ada untuk mengubahnya.
      </p>
      <p>
        Sudah biasa menulis kode? Tulis di antara <code>{"\\("}</code> dan <code>{"\\)"}</code>, mis.{" "}
        <code>{"\\(\\frac{a}{b}\\)"}</code>. Format lain: **tebal**, *miring*, baris kosong = paragraf baru.
      </p>
    </div>
  );
}
