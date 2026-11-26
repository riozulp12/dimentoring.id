import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { ItemDocx } from "@/lib/shared/studio-soal/imporDocx";

/**
 * Pembaca/penulis ZIP minimal untuk berkas .docx (tanpa dependensi tambahan).
 * Pembaca hanya dipakai untuk memeriksa word/document.xml (persamaan Word,
 * sel gabungan, gambar) dan mengambil byte gambar; teks & tabel dibaca mammoth
 * (docxIsi.ts). Penulis membuat contoh template Word.
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

interface EntriZip {
  nama: string;
  metode: number;
  crc: number;
  ukuranAsli: number;
  /** Data seperti tersimpan di ZIP (terkompres bila metode 8). */
  data: Buffer;
}

/** Entri dari direktori pusat; null bila ZIP rusak atau tidak didukung. */
function daftarEntri(buf: Buffer): EntriZip[] | null {
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
    const hasil: EntriZip[] = [];
    for (let n = 0; n < jumlah; n++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) return null;
      const ukuranKompres = buf.readUInt32LE(p + 20);
      const panjangNama = buf.readUInt16LE(p + 28);
      const offsetLokal = buf.readUInt32LE(p + 42);
      if (buf.readUInt32LE(offsetLokal) !== 0x04034b50) return null;
      const awal = offsetLokal + 30 + buf.readUInt16LE(offsetLokal + 26) + buf.readUInt16LE(offsetLokal + 28);
      hasil.push({
        nama: buf.toString("utf8", p + 46, p + 46 + panjangNama),
        metode: buf.readUInt16LE(p + 10),
        crc: buf.readUInt32LE(p + 16),
        ukuranAsli: buf.readUInt32LE(p + 24),
        data: buf.subarray(awal, awal + ukuranKompres),
      });
      p += 46 + panjangNama + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    }
    return hasil;
  } catch {
    return null;
  }
}

/** Isi biner satu entri; hasil ekstraksi dibatasi `batas` byte. null = tidak ada / rusak. */
export function bacaEntriBinerZip(buf: Buffer, nama: string, batas: number): Buffer | "terlalu_besar" | null {
  const e = daftarEntri(buf)?.find((x) => x.nama === nama);
  if (!e) return null;
  if (e.ukuranAsli > batas) return "terlalu_besar";
  try {
    if (e.metode === 0) return e.data.length > batas ? "terlalu_besar" : e.data;
    if (e.metode === 8) return inflateRawSync(e.data, { maxOutputLength: batas });
    return null;
  } catch (err) {
    // Ukuran yang diklaim berbohong: ekstraksi dihentikan di batas.
    return err instanceof RangeError ? "terlalu_besar" : null;
  }
}

/** Isi satu entri ZIP sebagai teks UTF-8; null bila tidak ada, terlalu besar, atau berkas ZIP rusak/tidak didukung. */
export function bacaEntriZip(buf: Buffer, nama: string): string | null {
  const isi = bacaEntriBinerZip(buf, nama, BATAS_BYTE_XML);
  return Buffer.isBuffer(isi) ? isi.toString("utf8") : null;
}

/** Salin ZIP dengan satu entri diganti; entri lain disalin apa adanya (tanpa diekstrak). */
export function gantiEntriZip(buf: Buffer, nama: string, isi: Buffer): Buffer | null {
  const entri = daftarEntri(buf);
  if (!entri) return null;
  return buatZip(entri.map((e) => (e.nama === nama ? { nama, isi } : e)));
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

export function buatZip(entri: ({ nama: string; isi: Buffer } | EntriZip)[]): Buffer {
  const lokal: Buffer[] = [];
  const pusat: Buffer[] = [];
  let offset = 0;
  for (const e of entri) {
    const nama = Buffer.from(e.nama, "utf8");
    const { metode, crc, ukuranAsli, data } =
      "isi" in e ? { metode: 8, crc: crc32(e.isi), ukuranAsli: e.isi.length, data: deflateRawSync(e.isi) } : e;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6);
    h.writeUInt16LE(metode, 8);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18);
    h.writeUInt32LE(ukuranAsli, 22);
    h.writeUInt16LE(nama.length, 26);
    lokal.push(h, nama, data);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(metode, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(ukuranAsli, 24);
    c.writeUInt16LE(nama.length, 28);
    c.writeUInt32LE(offset, 42);
    pusat.push(c, nama);
    offset += 30 + nama.length + data.length;
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
