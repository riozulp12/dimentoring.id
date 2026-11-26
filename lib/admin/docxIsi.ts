import { randomUUID } from "node:crypto";
import { convertToHtml } from "mammoth";
import { BATAS_BYTE_XML, bacaEntriBinerZip, bacaEntriZip, gantiEntriZip } from "@/lib/admin/docxZip";
import { ALT_BAWAAN, BATAS_GAMBAR, bacaInfoGambar } from "@/lib/shared/studio-soal/gambar";
import type { MasukanImpor } from "@/lib/shared/studio-soal/impor";
import {
  analisisObjekDocx,
  namaBagianDocx,
  paragrafDariTeksMentah,
  pesanObjekTerlarang,
  uraiParagrafDocx,
  type GambarInline,
  type GambarSumber,
  type ItemDocx,
} from "@/lib/shared/studio-soal/imporDocx";

/**
 * Isi berkas .docx -> baris perantara untuk susunImpor() (tanpa database, tanpa HTTP).
 *
 * Dokumen dibaca sebagai model mammoth (lewat transformDocument), bukan
 * extractRawText: extractRawText meratakan sel tabel jadi paragraf biasa,
 * sehingga sel bisa terbaca sebagai soal/pilihan/kunci. Teks paragraf dibentuk
 * dengan aturan yang sama dengan extractRawText. API transformDocument belum
 * dijamin stabil oleh mammoth: versinya dikunci dan dijaga tes berkas nyata.
 */

interface ElemenDocx {
  type: string;
  value?: string;
  children?: ElemenDocx[];
}

function teksMentah(el: ElemenDocx): string {
  if (el.type === "text") return el.value ?? "";
  if (el.type === "tab") return "\t";
  return (el.children ?? []).map(teksMentah).join("") + (el.type === "paragraph" ? "\n\n" : "");
}

const adaTabel = (el: ElemenDocx): boolean => (el.children ?? []).some((a) => a.type === "table" || adaTabel(a));

/** Paragraf dan tabel sesuai urutan di dokumen. */
function isiDariDokumen(akar: ElemenDocx): ItemDocx[] {
  const hasil: ItemDocx[] = [];
  let teks = "";
  const kuras = () => {
    hasil.push(...paragrafDariTeksMentah(teks));
    teks = "";
  };
  const anak = (el: ElemenDocx, type: string) => (el.children ?? []).filter((a) => a.type === type);
  const telusuri = (el: ElemenDocx) => {
    if (el.type === "table") {
      kuras();
      hasil.push({
        tabel: anak(el, "tableRow").map((baris) =>
          anak(baris, "tableCell").map((sel) => paragrafDariTeksMentah(teksMentah(sel)).join("\n")),
        ),
      });
    } else if (adaTabel(el)) {
      el.children?.forEach(telusuri);
    } else {
      teks += teksMentah(el);
    }
  };
  akar.children?.forEach(telusuri);
  kuras();
  return hasil;
}

/** Satu gambar dari dokumen, sudah diperiksa; belum disimpan ke Storage. */
export interface GambarSiap extends GambarSumber {
  mime: string;
  ext: string;
  data: Buffer;
  lebar: number;
  tinggi: number;
}

export type HasilOlahDocx =
  | {
      ok: true;
      masukan: Pick<MasukanImpor, "soalBaris" | "bacaanBaris" | "bacaanBlok" | "soalGambar" | "galatTambahan">;
      media: GambarSiap[];
    }
  | { ok: false; error: string; status: 413 | 422 };

const ringkasTolak = (pesan: string[]) => `Berkas ditolak. ${pesan.slice(0, 5).join(" ")}${pesan.length > 5 ? ` (+${pesan.length - 5} lagi)` : ""}`;

/** Target relasi -> nama entri ZIP; null bila di luar word/media/. */
function entriMedia(target: string): string | null {
  const bagian: string[] = [];
  for (const b of (target.startsWith("/") ? target.slice(1) : `word/${target}`).split("/")) {
    if (b === "..") return null;
    if (b !== "." && b !== "") bagian.push(b);
  }
  const nama = bagian.join("/");
  return nama.startsWith("word/media/") ? nama : null;
}

/**
 * Ambil byte tiap gambar lewat word/_rels/document.xml.rels. Format & dimensi
 * ditentukan dari byte awal berkas, bukan ekstensi.
 */
function ambilGambar(buffer: Buffer, daftar: GambarInline[]): { media: GambarSiap[]; penolakan: string[] } {
  const rels = bacaEntriZip(buffer, "word/_rels/document.xml.rels") ?? "";
  const relasi = new Map(
    (rels.match(/<Relationship\s[^>]*>/g) ?? []).map((r) => {
      const atribut = (nama: string) => r.match(new RegExp(`\\s${nama}="([^"]*)"`))?.[1] ?? "";
      return [atribut("Id"), { target: atribut("Target"), luar: atribut("TargetMode") === "External" }] as const;
    }),
  );
  const media: GambarSiap[] = [];
  const penolakan = new Set<string>();
  for (const g of daftar) {
    const di = namaBagianDocx(g.konteks, g.nomor) ?? "awal berkas";
    const r = relasi.get(g.rId);
    if (r?.luar) {
      penolakan.add(`Ada gambar tautan (tidak tertanam) di ${di}. Sisipkan gambarnya langsung ke dokumen.`);
      continue;
    }
    const nama = r ? entriMedia(r.target) : null;
    const data = nama ? bacaEntriBinerZip(buffer, nama, BATAS_GAMBAR.byte) : null;
    if (data === "terlalu_besar") {
      penolakan.add(`Gambar di ${di} lebih besar dari 2 MB. Perkecil lalu sisipkan ulang.`);
      continue;
    }
    if (!data) {
      penolakan.add(`Gambar di ${di} tidak bisa dibaca. Sisipkan ulang gambarnya.`);
      continue;
    }
    const info = bacaInfoGambar(data);
    if (!info.ok) {
      penolakan.add(
        info.alasan === "format"
          ? `Gambar berformat ${info.format} di ${di} tidak didukung; tempel ulang sebagai PNG atau JPEG.`
          : `Gambar di ${di} tidak bisa dibaca (berkas rusak). Tempel ulang sebagai PNG atau JPEG.`,
      );
      continue;
    }
    if (info.lebar > BATAS_GAMBAR.dimensi || info.tinggi > BATAS_GAMBAR.dimensi) {
      penolakan.add(`Gambar di ${di} berukuran ${info.lebar}×${info.tinggi} px; maksimal ${BATAS_GAMBAR.dimensi} px per sisi.`);
      continue;
    }
    const alt = [...g.alt].slice(0, BATAS_GAMBAR.altMaks).join("").trim();
    media.push({
      media_id: randomUUID(),
      alt: alt || ALT_BAWAAN,
      altBawaan: alt === "",
      mime: info.mime,
      ext: info.ext,
      data,
      lebar: info.lebar,
      tinggi: info.tinggi,
    });
  }
  return { media, penolakan: [...penolakan] };
}

/** Periksa objek terlarang, baca isi, lalu uraikan. Berkas ditolak utuh bila ada yang tidak bisa dibaca dengan setia. */
export async function olahDocx(buffer: Buffer): Promise<HasilOlahDocx> {
  const tolak = (error: string, status: 413 | 422 = 422) => ({ ok: false as const, error, status });

  const xml = bacaEntriZip(buffer, "word/document.xml");
  if (xml === null) return tolak("Isi dokumen Word tidak bisa dibaca. Simpan ulang sebagai .docx lalu coba lagi.");
  if (xml.length > BATAS_BYTE_XML) return tolak("Dokumen terlalu besar.", 413);

  const analisis = analisisObjekDocx(xml);
  if (analisis.temuan.length > 0) return tolak(ringkasTolak(pesanObjekTerlarang(analisis.temuan)));

  const { media, penolakan } = ambilGambar(buffer, analisis.gambar);
  if (penolakan.length > 0) return tolak(ringkasTolak(penolakan));
  // Bergambar: pembaca dokumen diberi XML yang gambarnya sudah diganti penanda sisipan.
  const untukDibaca = media.length > 0 ? gantiEntriZip(buffer, "word/document.xml", Buffer.from(analisis.xml, "utf8")) : buffer;
  if (!untukDibaca) return tolak("Isi dokumen Word tidak bisa dibaca. Simpan ulang sebagai .docx lalu coba lagi.");

  const tangkap: ElemenDocx[] = [];
  try {
    await convertToHtml(
      { buffer: untukDibaca },
      {
        // Hanya modelnya yang dipakai; anak dikosongkan supaya HTML tidak ikut dibuat.
        transformDocument: (dokumen: ElemenDocx) => {
          tangkap.push(dokumen);
          return { ...dokumen, children: [] };
        },
      },
    );
  } catch {
    tangkap.length = 0;
  }
  if (tangkap.length === 0) return tolak("Dokumen Word tidak bisa dibaca. Pastikan berkasnya tidak rusak atau dikunci.");

  const urai = uraiParagrafDocx(isiDariDokumen(tangkap[0]), media);
  if (urai.penolakan.length > 0) return tolak(ringkasTolak(urai.penolakan));
  return {
    ok: true,
    masukan: {
      soalBaris: urai.soalBaris,
      bacaanBaris: urai.bacaanBaris,
      bacaanBlok: urai.bacaanBlok,
      soalGambar: urai.soalGambar,
      galatTambahan: urai.catatan,
    },
    media,
  };
}
