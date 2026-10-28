"use client";

import { useEffect, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Toggle from "@/components/ui/Toggle";
import TeksKaya from "@/components/studio-soal/TeksKaya";
import { bungkusRumus, cekRumusEditor } from "@/lib/shared/studio-soal/sisipRumus";

/**
 * Editor rumus visual (Studio Soal UX-3 D) memakai MathLive: mengetik seperti
 * di kalkulator ("/" jadi pecahan, "^" pangkat), dengan keyboard rumus di
 * layar. Hasilnya teks rumus biasa (\( … \) / \[ … \]) — format simpan tidak
 * berubah dan diperiksa cekRumus yang sama dengan validasi Ajukan.
 *
 * MathLive (± 230 kB gzip) dimuat MALAS lewat import() saat jendela dibuka,
 * hanya di browser (tidak pernah ikut SSR / bundel awal halaman). Font tidak
 * dimuat MathLive (fontsDirectory = null): MathLive memakai keluarga font
 * KaTeX yang sudah dilayani dari situs sendiri lewat katex.min.css (TeksKaya),
 * jadi tidak ada CDN. Suara keyboard dimatikan (soundsDirectory = null).
 */

type ModulMathlive = typeof import("mathlive");
let muatMathlive: Promise<ModulMathlive> | null = null;

function muat(): Promise<ModulMathlive> {
  muatMathlive ??= import("mathlive").then((m) => {
    m.MathfieldElement.fontsDirectory = null;
    m.MathfieldElement.soundsDirectory = null;
    return m;
  });
  return muatMathlive;
}

/** Dipasang hanya saat jendela dibuka (TextareaKaya), jadi state awal diambil dari props. */
export default function EditorRumus({
  awal,
  blokAwal,
  mengubah,
  onSisip,
  onBatal,
}: {
  /** Rumus yang diubah (kosong = rumus baru). */
  awal: string;
  blokAwal: boolean;
  /** true = mengubah rumus yang sudah ada di teks. */
  mengubah: boolean;
  onSisip: (tex: string, blok: boolean) => void;
  onBatal: () => void;
}) {
  const wadahRef = useRef<HTMLDivElement | null>(null);
  const mfRef = useRef<MathfieldElement | null>(null);
  const [tex, setTex] = useState(awal);
  const [blok, setBlok] = useState(blokAwal);
  const [status, setStatus] = useState<"memuat" | "siap" | "gagal">("memuat");

  useEffect(() => {
    let batal = false;
    let mf: MathfieldElement | null = null;
    muat()
      .then((m) => {
        if (batal || !wadahRef.current) return;
        mf = new m.MathfieldElement();
        mf.id = "kolom-rumus";
        mf.setAttribute("aria-label", "Kolom rumus");
        mf.setAttribute("aria-describedby", "petunjuk-rumus");
        mf.mathVirtualKeyboardPolicy = "auto";
        mf.className = "block w-full rounded-[12px] border border-subtle bg-white px-3 py-2 text-lg";
        mf.value = awal;
        mf.addEventListener("input", () => setTex(mf?.getValue("latex-expanded") ?? ""));
        wadahRef.current.appendChild(mf);
        mfRef.current = mf;
        setStatus("siap");
        requestAnimationFrame(() => mf?.focus());
      })
      .catch(() => {
        if (!batal) setStatus("gagal");
      });
    return () => {
      batal = true;
      window.mathVirtualKeyboard?.hide();
      mf?.remove();
      mfRef.current = null;
    };
  }, [awal]);

  const galat = status === "siap" ? cekRumusEditor(tex, blok) : null;
  const bolehSisip = status === "siap" && galat === null;

  return (
    <Modal open onClose={onBatal}>
      <div className="flex flex-col gap-4">
        <h2 className="pr-8 text-lg font-medium text-black">{mengubah ? "Ubah rumus" : "Sisipkan rumus"}</h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kolom-rumus" className="text-sm font-medium text-black">
            Tulis rumusnya
          </label>
          <div ref={wadahRef} />
          {status === "memuat" ? <p className="text-sm text-muted">Menyiapkan editor rumus…</p> : null}
          {status === "gagal" ? (
            <p role="alert" className="text-sm text-danger">
              Editor rumus gagal dimuat. Cek koneksi lalu coba lagi, atau tulis kode rumus langsung di kotak teks.
            </p>
          ) : null}
          <p id="petunjuk-rumus" className="text-xs text-muted">
            Ketik <code>/</code> untuk pecahan, <code>^</code> untuk pangkat, <code>_</code> untuk indeks bawah,{" "}
            <code>sqrt</code> untuk akar. Di HP, keyboard rumus muncul otomatis.
          </p>
          {status === "siap" ? (
            <button
              type="button"
              onClick={() => {
                mfRef.current?.focus();
                window.mathVirtualKeyboard?.show();
              }}
              className="w-fit text-xs font-medium text-primary hover:underline"
            >
              Tampilkan keyboard rumus
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-black">Tampilkan di baris sendiri</span>
          <Toggle checked={blok} onChange={() => setBlok((b) => !b)} label="Tampilkan rumus di baris sendiri" />
        </div>

        <div className="flex flex-col gap-1.5" aria-live="polite">
          <span className="text-sm font-medium text-black">Pratinjau</span>
          <div className="min-h-12 rounded-[12px] bg-surface px-3 py-2">
            {tex.trim() && !galat ? (
              <TeksKaya teks={bungkusRumus(tex.trim(), blok)} />
            ) : (
              <span className="text-sm text-muted">{galat && tex.trim() ? galat : "Rumus akan tampil di sini."}</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onBatal}>
            Batal
          </Button>
          <Button size="sm" disabled={!bolehSisip} onClick={() => onSisip(tex.trim(), blok)}>
            Sisipkan
          </Button>
        </div>
      </div>
    </Modal>
  );
}
