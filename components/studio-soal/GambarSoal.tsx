import type { GambarTampil } from "@/lib/shared/studio-soal/gambar";

/**
 * Satu gambar soal/bacaan. <img> biasa (bukan next/image): alamatnya bertanda
 * tangan berumur pendek dari server, dan Vercel Hobby membatasi kuota optimasi
 * gambar. width/height dari soal_media supaya tata letak tidak melompat.
 */
export default function GambarSoal({ gambar }: { gambar: GambarTampil }) {
  if (!gambar.url) {
    return <span className="block text-sm italic text-subtle">Gambar tidak bisa dimuat: {gambar.alt}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={gambar.url}
      alt={gambar.alt}
      width={gambar.lebar || undefined}
      height={gambar.tinggi || undefined}
      className="my-1 block h-auto max-w-full rounded-[8px]"
    />
  );
}
