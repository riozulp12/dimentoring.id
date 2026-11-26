/** Pembuat berkas gambar & .docx bergambar untuk tes (header gambar secukupnya, tanpa isi piksel). */
import { buatZip } from "@/lib/admin/docxZip";

const be32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

export const png = (lebar = 20, tinggi = 10, tambahByte = 0) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    be32(13),
    Buffer.from("IHDR"),
    be32(lebar),
    be32(tinggi),
    Buffer.from([8, 2, 0, 0, 0, 0, 0, 0, 0]),
    Buffer.alloc(tambahByte),
  ]);

export function jpeg(lebar = 30, tinggi = 15) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]);
  const sof = Buffer.from([0xff, 0xc2, 0x00, 0x0b, 8, tinggi >> 8, tinggi & 255, lebar >> 8, lebar & 255, 1, 1, 0x11, 0]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

export function webp(lebar: number, tinggi: number, ragam: "VP8 " | "VP8L" | "VP8X") {
  const b = Buffer.alloc(32);
  b.write("RIFF", 0);
  b.writeUInt32LE(24, 4);
  b.write("WEBP", 8);
  b.write(ragam, 12);
  if (ragam === "VP8 ") {
    b.set([0x9d, 0x01, 0x2a], 23);
    b.writeUInt16LE(lebar, 26);
    b.writeUInt16LE(tinggi, 28);
  } else if (ragam === "VP8L") {
    b[20] = 0x2f;
    b.writeUInt32LE((((tinggi - 1) << 14) | (lebar - 1)) >>> 0, 21);
  } else {
    b.writeUIntLE(lebar - 1, 24, 3);
    b.writeUIntLE(tinggi - 1, 27, 3);
  }
  return b;
}

export const par = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;

export interface OpsiGambar {
  alt?: string;
  /** "anchor" = mengambang. */
  letak?: "inline" | "anchor";
  /** Isi graphicData pengganti (bagan, SmartArt, bentuk). */
  isi?: string;
  tautan?: boolean;
  svg?: boolean;
}

/** Satu <w:drawing> seperti yang ditulis Word. */
export function drawing(rId: string, o: OpsiGambar = {}) {
  const tag = o.letak === "anchor" ? "wp:anchor" : "wp:inline";
  const svg = o.svg ? `<a:extLst><a:ext><asvg:svgBlip r:embed="rIdSvg"/></a:ext></a:extLst>` : "";
  const isi =
    o.isi ??
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip ${o.tautan ? "r:link" : "r:embed"}="${rId}">${svg}</a:blip></pic:blipFill></pic:pic></a:graphicData>`;
  const alt = o.alt === undefined ? "" : ` descr="${o.alt}"`;
  return `<w:drawing><${tag}><wp:docPr id="1" name="Picture 1"${alt}/><a:graphic>${isi}</a:graphic></${tag}></w:drawing>`;
}

export const run = (isi: string) => `<w:r>${isi}</w:r>`;
export const parGambar = (rId: string, o?: OpsiGambar) => `<w:p>${run(drawing(rId, o))}</w:p>`;

export interface BerkasMedia {
  rId: string;
  /** Nama di word/media. */
  nama: string;
  data: Buffer;
  /** Ganti Target relasi (uji target aneh). */
  target?: string;
  luar?: boolean;
}

const NS = [
  ["w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main"],
  ["r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships"],
  ["wp", "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"],
  ["a", "http://schemas.openxmlformats.org/drawingml/2006/main"],
  ["pic", "http://schemas.openxmlformats.org/drawingml/2006/picture"],
  ["m", "http://schemas.openxmlformats.org/officeDocument/2006/math"],
  ["mc", "http://schemas.openxmlformats.org/markup-compatibility/2006"],
  ["wps", "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"],
  ["c", "http://schemas.openxmlformats.org/drawingml/2006/chart"],
  ["dgm", "http://schemas.openxmlformats.org/drawingml/2006/diagram"],
  ["asvg", "http://schemas.microsoft.com/office/drawing/2016/SVG/main"],
];

export function docxBergambar(body: string, media: BerkasMedia[]) {
  const relasi = media
    .map(
      (m) =>
        `<Relationship Id="${m.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.target ?? `media/${m.nama}`}"${m.luar ? ' TargetMode="External"' : ""}/>`,
    )
    .join("");
  const teks = (s: string) => Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`, "utf8");
  return buatZip([
    {
      nama: "[Content_Types].xml",
      isi: teks(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      ),
    },
    {
      nama: "_rels/.rels",
      isi: teks(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      ),
    },
    { nama: "word/_rels/document.xml.rels", isi: teks(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relasi}</Relationships>`) },
    {
      nama: "word/document.xml",
      isi: teks(`<w:document ${NS.map(([p, u]) => `xmlns:${p}="${u}"`).join(" ")}><w:body>${body}</w:body></w:document>`),
    },
    ...media.filter((m) => !m.luar).map((m) => ({ nama: `word/media/${m.nama}`, isi: m.data })),
  ]);
}
