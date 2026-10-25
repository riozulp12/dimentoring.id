"use client";

import "katex/dist/katex.min.css";
import katex from "katex";
import { Fragment, useEffect, useMemo, useRef, type ReactNode } from "react";
import { uraiTeksKaya, type Segmen } from "@/lib/shared/studio-soal/teksKaya";
import { OPSI_KATEX, cekRumus } from "@/lib/shared/studio-soal/rumus";

/**
 * Render teks soal/stimulus: teks biasa sebagai node teks React (otomatis
 * di-escape), **tebal**, *miring*, dan rumus \( \) / \[ \] lewat KaTeX.
 * Tidak memakai dangerouslySetInnerHTML: KaTeX menggambar langsung ke elemen
 * kosong miliknya (katex.render, trust:false). Rumus yang rusak tampil apa
 * adanya dengan warna merah.
 */

function Rumus({ tex, blok }: { tex: string; blok: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Validitas dihitung saat render (parse KaTeX murah); efek hanya menggambar.
  const galat = useMemo(() => cekRumus(tex, blok) !== null, [tex, blok]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (galat) {
      el.textContent = blok ? `\\[${tex}\\]` : `\\(${tex}\\)`;
      return;
    }
    katex.render(tex, el, { ...OPSI_KATEX, displayMode: blok, throwOnError: false });
  }, [tex, blok, galat]);
  // Elemen sengaja tanpa anak React: isinya milik KaTeX.
  return (
    <span
      ref={ref}
      className={[blok ? "block max-w-full overflow-x-auto py-1" : "", galat ? "font-mono text-sm text-[#E70A0A]" : ""].join(" ")}
    />
  );
}

function RenderSegmen({ s, rumpang }: { s: Segmen; rumpang?: (id: string) => ReactNode }) {
  if (s.jenis === "baris_baru") return <br />;
  if (s.jenis === "rumpang") {
    return rumpang ? (
      <>{rumpang(s.id)}</>
    ) : (
      <span className="mx-0.5 inline-block min-w-12 border-b-2 border-dashed border-[#7E7C7C] px-1 text-center text-xs text-[#7E7C7C]">
        {s.id}
      </span>
    );
  }
  let isi: ReactNode = s.jenis === "teks" ? s.teks : <Rumus tex={s.tex} blok={s.blok} />;
  if (s.miring) isi = <em>{isi}</em>;
  if (s.tebal) isi = <strong className="font-semibold">{isi}</strong>;
  return <>{isi}</>;
}

export default function TeksKaya({
  teks,
  rumpang,
  className = "",
  kosong,
  sebaris = false,
}: {
  teks: string;
  /** Render rumpang {{id}} (redaksi isian). Tanpa ini, {{id}} tampil sebagai teks. */
  rumpang?: (id: string) => ReactNode;
  className?: string;
  /** Ditampilkan bila teks kosong. */
  kosong?: string;
  /** Render dengan <span> (untuk di dalam <button>/<label>, yang tidak boleh berisi <p>/<div>). */
  sebaris?: boolean;
}) {
  const paragraf = uraiTeksKaya(teks, { rumpang: Boolean(rumpang) });
  const Wadah = sebaris ? "span" : "div";
  const Paragraf = sebaris ? "span" : "p";
  if (paragraf.length === 0) {
    return kosong ? <Paragraf className={`block italic text-[#AFAFAF] ${className}`}>{kosong}</Paragraf> : null;
  }
  return (
    <Wadah className={`flex min-w-0 flex-col gap-2 break-words ${className}`}>
      {paragraf.map((p, i) => (
        <Paragraf key={i} className="block leading-relaxed">
          {p.segmen.map((s, j) => (
            <Fragment key={j}>
              <RenderSegmen s={s} rumpang={rumpang} />
            </Fragment>
          ))}
        </Paragraf>
      ))}
    </Wadah>
  );
}
