import { convertToHtml } from "mammoth";
import { BATAS_BYTE_XML, bacaEntriZip } from "@/lib/admin/docxZip";
import type { MasukanImpor } from "@/lib/shared/studio-soal/impor";
import {
  cariObjekTerlarangDocx,
  paragrafDariTeksMentah,
  pesanObjekTerlarang,
  uraiParagrafDocx,
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

export type HasilOlahDocx =
  | { ok: true; masukan: Pick<MasukanImpor, "soalBaris" | "bacaanBaris" | "bacaanBlok" | "galatTambahan"> }
  | { ok: false; error: string; status: 413 | 422 };

const ringkasTolak = (pesan: string[]) => `Berkas ditolak. ${pesan.slice(0, 5).join(" ")}${pesan.length > 5 ? ` (+${pesan.length - 5} lagi)` : ""}`;

/** Periksa objek terlarang, baca isi, lalu uraikan. Berkas ditolak utuh bila ada yang tidak bisa dibaca dengan setia. */
export async function olahDocx(buffer: Buffer): Promise<HasilOlahDocx> {
  const tolak = (error: string, status: 413 | 422 = 422) => ({ ok: false as const, error, status });

  const xml = bacaEntriZip(buffer, "word/document.xml");
  if (xml === null) return tolak("Isi dokumen Word tidak bisa dibaca. Simpan ulang sebagai .docx lalu coba lagi.");
  if (xml.length > BATAS_BYTE_XML) return tolak("Dokumen terlalu besar.", 413);

  const terlarang = cariObjekTerlarangDocx(xml);
  if (terlarang.length > 0) return tolak(ringkasTolak(pesanObjekTerlarang(terlarang)));

  const tangkap: ElemenDocx[] = [];
  try {
    await convertToHtml(
      { buffer },
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

  const urai = uraiParagrafDocx(isiDariDokumen(tangkap[0]));
  if (urai.penolakan.length > 0) return tolak(ringkasTolak(urai.penolakan));
  return {
    ok: true,
    masukan: { soalBaris: urai.soalBaris, bacaanBaris: urai.bacaanBaris, bacaanBlok: urai.bacaanBlok, galatTambahan: urai.catatan },
  };
}
