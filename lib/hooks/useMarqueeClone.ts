"use client";

import { useEffect, useRef } from "react";

/**
 * Kloning DOM untuk loop marquee CSS (Testimonial, Mentor di landing page)
 * — dilakukan di sini, CLIENT-SIDE setelah mount, supaya HTML hasil SSR
 * (view-source, crawler) cuma berisi SATU salinan konten asli. Sebelumnya
 * data di-triple/quadruple lewat array (`[...items, ...items, ...items]`)
 * langsung di server render, jadi teks testimoni/nama mentor duplikat
 * berkali-kali di HTML — buruk untuk SEO & pembaca layar. Klon di sini
 * ditandai `aria-hidden` karena murni kelanjutan visual loop, bukan
 * konten sungguhan.
 *
 * @param copies Total salinan yang perlu ADA DI DOM supaya animasi CSS
 * `translateX(-100%/copies)` (lihat --marquee-distance di pemakainya)
 * terlihat mulus tanpa "patahan" — mis. 3 kalau --marquee-distance
 * -33.3334%, 4 kalau -25%. `copies - 1` klon ditambahkan di belakang
 * konten asli.
 */
export function useMarqueeClone<T extends HTMLElement>(copies: number) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const track = ref.current;
    if (!track || copies <= 1) return;

    const originalChildren = Array.from(track.children);
    for (let i = 1; i < copies; i++) {
      for (const el of originalChildren) {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.setAttribute("aria-hidden", "true");
        track.appendChild(clone);
      }
    }

    return () => {
      // Idempotent kalau effect ini sempat jalan ulang (mis. Strict Mode
      // dev) — bersihkan klon lama supaya tidak menumpuk dobel.
      for (const el of Array.from(track.children)) {
        if (el.getAttribute("aria-hidden") === "true") el.remove();
      }
    };
  }, [copies]);

  return ref;
}
