import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { ItemDocx } from "@/lib/shared/studio-soal/imporDocx";

/**
 * Pembaca/penulis ZIP minimal untuk berkas .docx (tanpa dependensi tambahan).
 * Pembaca hanya dipakai untuk memeriksa word/document.xml (persamaan Word,
 * gambar, sel gabungan); teks dan tabel dibaca mammoth (docxIsi.ts). Penulis membuat contoh template Word.
 *
 * Pembaca tahan terhadap berkas berbahaya: ukuran hasil ekstraksi dibatasi,
 * jumlah entri dibatasi, ZIP64 ditolak.
 */

export const BATAS_BYTE_XML = 30 * 1024 * 1024;
const BATAS_ENTRI = 10000;

/** Tanda ZIP lokal ("PK\x03\x04"). */
export function berawalanZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

/** Isi satu entri ZIP sebagai teks UTF-8; null bila tidak ada atau berkas ZIP rusak/tidak didukung. */
export function bacaEntriZip(buf: Buffer, nama: string): string | null {
  try {
    const mulai = Math.max(0, buf.length - 22 - 65535);
    let eocd = -1;
    for (let i = buf.length - 22; i >= mulai; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return null;
    const jumlah = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    if (jumlah === 0xffff || p === 0xffffffff || jumlah > BATAS_ENTRI) return null;
    for (let n = 0; n < jumlah; n++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) return null;
      const metode = buf.readUInt16LE(p + 10);
      const ukuranKompres = buf.readUInt32LE(p + 20);
      const ukuranAsli = buf.readUInt32LE(p + 24);
      const panjangNama = buf.readUInt16LE(p + 28);
      const panjangExtra = buf.readUInt16LE(p + 30);
      const panjangKomentar = buf.readUInt16LE(p + 32);
      const offsetLokal = buf.readUInt32LE(p + 42);
      const namaEntri = buf.toString("utf8", p + 46, p + 46 + panjangNama);
      p += 46 + panjangNama + panjangExtra + panjangKomentar;
      if (namaEntri !== nama) continue;
      if (ukuranAsli > BATAS_BYTE_XML || buf.readUInt32LE(offsetLokal) !== 0x04034b50) return null;
      const awal = offsetLokal + 30 + buf.readUInt16LE(offsetLokal + 26) + buf.readUInt16LE(offsetLokal + 28);
      const data = buf.subarray(awal, awal + ukuranKompres);
      if (metode === 0) return data.toString("utf8");
      if (metode === 8) return inflateRawSync(data, { maxOutputLength: BATAS_BYTE_XML }).toString("utf8");
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Penulis ----

const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = TABEL_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buatZip(entri: { nama: string; isi: Buffer }[]): Buffer {
  const lokal: Buffer[] = [];
  const pusat: Buffer[] = [];
  let offset = 0;
  for (const e of entri) {
    const nama = Buffer.from(e.nama, "utf8");
    const kompres = deflateRawSync(e.isi);
    const crc = crc32(e.isi);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6);
    h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(kompres.length, 18);
    h.writeUInt32LE(e.isi.length, 22);
    h.writeUInt16LE(nama.length, 26);
    lokal.push(h, nama, kompres);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(kompres.length, 20);
    c.writeUInt32LE(e.isi.length, 24);
    c.writeUInt16LE(nama.length, 28);
    c.writeUInt32LE(offset, 42);
    pusat.push(c, nama);
    offset += 30 + nama.length + kompres.length;
  }
  const ukuranPusat = pusat.reduce((n, b) => n + b.length, 0);
  const akhir = Buffer.alloc(22);
  akhir.writeUInt32LE(0x06054b50, 0);
  akhir.writeUInt16LE(entri.length, 8);
  akhir.writeUInt16LE(entri.length, 10);
  akhir.writeUInt32LE(ukuranPusat, 12);
  akhir.writeUInt32LE(offset, 16);
  return Buffer.concat([...lokal, ...pusat, akhir]);
}

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const paragrafXml = (p: string) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`;

function tabelXml(baris: string[][]): string {
  const kolom = Math.max(1, ...baris.map((r) => r.length));
  const garis = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((sisi) => `<w:${sisi} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`)
    .join("");
  const sel = (t: string) => `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${paragrafXml(t)}</w:tc>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${garis}</w:tblBorders></w:tblPr>` +
    `<w:tblGrid>${'<w:gridCol w:w="3000"/>'.repeat(kolom)}</w:tblGrid>` +
    `${baris.map((r) => `<w:tr>${r.map(sel).join("")}</w:tr>`).join("")}</w:tbl>`
  );
}

/** Berkas .docx minimal (paragraf dan tabel polos) yang bisa dibuka Word dan dibaca mammoth. */
export function buatDocx(isi: ItemDocx[]): Buffer {
  return bungkusDocx(isi.map((x) => (typeof x === "string" ? paragrafXml(x) : tabelXml(x.tabel))).join(""));
}

/** Bungkus isi <w:body> (XML) jadi berkas .docx. */
export function bungkusDocx(isiBody: string): Buffer {
  const dokumen =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${isiBody}</w:body></w:document>`;
  const tipe =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;
  return buatZip([
    { nama: "[Content_Types].xml", isi: Buffer.from(tipe, "utf8") },
    { nama: "_rels/.rels", isi: Buffer.from(rels, "utf8") },
    { nama: "word/document.xml", isi: Buffer.from(dokumen, "utf8") },
  ]);
}
