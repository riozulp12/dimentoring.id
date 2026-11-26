/**
 * Unggah soal lewat Word (.docx) — modul MURNI (tanpa server, tanpa berkas).
 *
 * Menerima daftar paragraf dan tabel (hasil mammoth di server) dan mengubahnya jadi
 * BARIS PERANTARA yang bentuknya sama dengan hasil parseCsv (judul kolom CSV v1
 * + satu baris per soal/bacaan). Validasinya TIDAK diduplikasi: baris itu
 * diserahkan ke susunImpor() (impor.ts), sama persis dengan jalur CSV.
 *
 * Format (label tidak peka huruf besar/kecil dan spasi berlebih; nomor "1." di
 * depan label atau soal diabaikan):
 *
 *   #BACAAN kode=B1
 *   Subtes: Penalaran Umum
 *   Sumber: ...                 (opsional; bawaan "Buatan Sendiri")
 *   <paragraf bacaan, boleh banyak; boleh diselingi tabel Word (baris pertama = judul kolom)>
 *   #SOAL
 *   Subtes: ...  Topik: ...  Jenis: PG | Isian
 *   Kesulitan: mudah|sedang|hots   Level: 1-3   Waktu: detik   Bacaan: B1   (opsional)
 *   Soal: <redaksi, boleh banyak paragraf sampai baris A.>
 *   A. ...  B. ...  C. ...  D. ...  E. ...
 *   Kunci: C                    (Isian: jawaban dipisah |)
 *   Pembahasan: <boleh banyak paragraf sampai #SOAL berikutnya>
 *
 * Tabel hanya diterima di dalam #BACAAN dan menjadi blok tabel pada bacaan, urut
 * sesuai dokumen; tabel di tempat lain menolak seluruh berkas (penolakan).
 *
 * Persamaan Word (m:oMath), gambar, sel gabungan, dan tabel bersarang TIDAK
 * diterima: cariObjekTerlarangDocx() menolak berkas, menyebut soal/bacaan
 * terdekat. Rumus ditulis sebagai teks \( ... \) lalu divalidasi cekRumus oleh
 * susunImpor.
 */
import { KOLOM_BACAAN, KOLOM_SOAL, SUMBER_BAWAAN, type GalatImpor } from "./impor";
import type { BlokStimulus } from "./tipe";

export const BATAS_BYTE_DOCX = 5 * 1024 * 1024;

/** Satu tabel Word: baris -> teks tiap sel (paragraf dalam sel dipisah baris baru). */
export interface TabelDocx {
  tabel: string[][];
}
/** Isi dokumen sesuai urutan: paragraf (teks) atau tabel. */
export type ItemDocx = string | TabelDocx;

export interface HasilUraiDocx {
  /** Judul kolom + satu baris per #SOAL. */
  soalBaris: string[][];
  /** null bila tidak ada #BACAAN. */
  bacaanBaris: string[][] | null;
  /** Blok teks & tabel untuk bacaan yang memuat tabel, per nomor baris bacaanBaris. */
  bacaanBlok: Map<number, BlokStimulus[]>;
  /** Alasan menolak SELURUH berkas (tabel di luar #BACAAN). */
  penolakan: string[];
  /** Galat/peringatan struktur (label ganda, pilihan ganda dua kali, teks nyasar). baris = nomor soal ke-N + 1. */
  catatan: GalatImpor[];
}

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

type KunciLabel = "subtes" | "topik" | "jenis" | "kesulitan" | "level" | "waktu" | "bacaan" | "soal" | "kunci" | "pembahasan" | "sumber";

const LABEL: Record<string, KunciLabel> = {
  subtes: "subtes",
  topik: "topik",
  jenis: "jenis",
  "jenis soal": "jenis",
  tipe: "jenis",
  kesulitan: "kesulitan",
  "tingkat kesulitan": "kesulitan",
  level: "level",
  "level kognitif": "level",
  waktu: "waktu",
  "estimasi waktu": "waktu",
  bacaan: "bacaan",
  soal: "soal",
  kunci: "kunci",
  "kunci jawaban": "kunci",
  pembahasan: "pembahasan",
  sumber: "sumber",
};
const NAMA_LABEL: Record<KunciLabel, string> = {
  subtes: "Subtes",
  topik: "Topik",
  jenis: "Jenis",
  kesulitan: "Kesulitan",
  level: "Level",
  waktu: "Waktu",
  bacaan: "Bacaan",
  soal: "Soal",
  kunci: "Kunci",
  pembahasan: "Pembahasan",
  sumber: "Sumber",
};
const KOLOM_DARI_LABEL: Record<KunciLabel, string> = {
  subtes: "subtes",
  topik: "topik",
  jenis: "tipe",
  kesulitan: "kesulitan",
  level: "level_kognitif",
  waktu: "estimasi_detik",
  bacaan: "kode_bacaan",
  soal: "redaksi",
  kunci: "kunci",
  pembahasan: "pembahasan",
  sumber: "sumber_rujukan",
};

const rapikan = (s: string) => s.replace(/[ ​]/g, " ").replace(/\s+/g, " ").trim();

function cocokLabel(baris: string): { kunci: KunciLabel; nilai: string } | null {
  const m = baris.match(/^\s*([^:：]{1,30}?)\s*[:：]\s*([\s\S]*)$/);
  if (!m) return null;
  const kunci = LABEL[rapikan(m[1]).toLocaleLowerCase("id-ID")];
  return kunci ? { kunci, nilai: m[2].trim() } : null;
}

const POLA_PENANDA = /^\s*#\s*(bacaan|soal)\b\s*([\s\S]*)$/i;
const POLA_NOMOR = /^\s*\d+\s*[.)]\s+/;
const POLA_OPSI = /^\s*\(?([A-Ea-e])\s*[.)]\s*([\s\S]*)$/;

/** Buang nomor di depan hanya bila sisanya penanda atau label ("1. Soal: ..."). */
function tanpaNomor(baris: string): string {
  const sisa = baris.replace(POLA_NOMOR, "");
  if (sisa === baris) return baris;
  return POLA_PENANDA.test(sisa) || cocokLabel(sisa) ? sisa : baris;
}

export function paragrafDariTeksMentah(teks: string): string[] {
  return teks
    .split(/\r?\n/)
    .map((s) => s.replace(/[ ​]/g, " ").trim())
    .filter((s) => s !== "");
}

// ---------------------------------------------------------------------------
// Urai paragraf -> baris perantara
// ---------------------------------------------------------------------------

interface BlokBacaan {
  nomor: number;
  kode: string;
  subtes: string;
  sumber: string;
  blok: BlokStimulus[];
  sudah: Set<KunciLabel>;
}
interface BlokSoal {
  nomor: number;
  meta: Partial<Record<KunciLabel, string>>;
  redaksi: string[];
  opsi: (string | null)[];
  kunci: string;
  pembahasan: string[];
  aktif: "soal" | "opsi" | "kunci" | "pembahasan" | "lain" | null;
  opsiTerakhir: number;
  sudah: Set<KunciLabel>;
}

const normalJenis = (v: string) => {
  const k = rapikan(v).toLocaleLowerCase("id-ID");
  if (["pg", "pilihan ganda", "pilihan_ganda"].includes(k)) return "pilihan_ganda";
  if (k === "isian") return "isian";
  return k;
};
const normalKunciPg = (v: string) => {
  const m = v.trim().match(/^\(?([A-Ea-e])\s*[.)]?$/);
  return m ? m[1].toUpperCase() : v.trim();
};
const angkaDepan = (v: string) => v.trim().replace(/\s*(detik|dtk|s)\.?$/i, "");

const memuatPenanda = (t: TabelDocx) =>
  t.tabel.some((baris) => baris.some((sel) => sel.split("\n").some((l) => POLA_PENANDA.test(tanpaNomor(l)))));

export function uraiParagrafDocx(isi: ItemDocx[]): HasilUraiDocx {
  const catatan: GalatImpor[] = [];
  const penolakan = new Set<string>();
  const bacaan: BlokBacaan[] = [];
  const soal: BlokSoal[] = [];
  let aktifBacaan: BlokBacaan | null = null;
  let aktifSoal: BlokSoal | null = null;
  let adaTeksNyasar = false;

  const catat = (berkas: "soal" | "bacaan", baris: number, kolom: string, pesan: string, tingkat: "galat" | "peringatan" = "galat") =>
    catatan.push({ berkas, baris, kolom, pesan, tingkat });

  for (const mentah of isi) {
    if (typeof mentah !== "string") {
      const di = aktifSoal ? `di soal ke-${aktifSoal.nomor}` : aktifBacaan ? `di bacaan ke-${aktifBacaan.nomor}` : "sebelum soal pertama";
      const pindahkan = "pindahkan tabel ke #BACAAN lalu hubungkan dengan 'Bacaan: kode'.";
      if (memuatPenanda(mentah)) {
        penolakan.add(`Tabel ${di} memuat penanda #SOAL/#BACAAN. Tulis penanda dan soal sebagai paragraf biasa, bukan di dalam tabel.`);
      } else if (aktifBacaan) {
        const [kepala = [], ...barisIsi] = mentah.tabel;
        aktifBacaan.blok.push({ jenis: "tabel", kepala, baris: barisIsi });
      } else if (aktifSoal) {
        penolakan.add(`Soal ke-${aktifSoal.nomor} berisi tabel; ${pindahkan}`);
      } else {
        penolakan.add(`Ada tabel sebelum soal pertama; ${pindahkan}`);
      }
      continue;
    }
    const baris = tanpaNomor(mentah);
    const penanda = baris.match(POLA_PENANDA);
    if (penanda) {
      if (penanda[1].toLowerCase() === "bacaan") {
        const param = penanda[2].trim();
        const kode = (param.match(/kode\s*=\s*(\S+)/i)?.[1] ?? (param.includes("=") ? "" : param.split(/\s+/)[0] ?? "")).trim();
        aktifBacaan = { nomor: bacaan.length + 1, kode, subtes: "", sumber: "", blok: [], sudah: new Set() };
        bacaan.push(aktifBacaan);
        aktifSoal = null;
      } else {
        aktifSoal = {
          nomor: soal.length + 1,
          meta: {},
          redaksi: [],
          opsi: [null, null, null, null, null],
          kunci: "",
          pembahasan: [],
          aktif: null,
          opsiTerakhir: -1,
          sudah: new Set(),
        };
        soal.push(aktifSoal);
        aktifBacaan = null;
      }
      continue;
    }

    if (aktifBacaan) {
      const l = cocokLabel(baris);
      if (l && (l.kunci === "subtes" || l.kunci === "sumber")) {
        if (aktifBacaan.sudah.has(l.kunci)) {
          catat("bacaan", aktifBacaan.nomor + 1, KOLOM_DARI_LABEL[l.kunci], `Label "${NAMA_LABEL[l.kunci]}" muncul lebih dari sekali.`);
        } else {
          aktifBacaan.sudah.add(l.kunci);
          if (l.kunci === "subtes") aktifBacaan.subtes = l.nilai;
          else aktifBacaan.sumber = l.nilai;
        }
      } else {
        const akhir = aktifBacaan.blok.at(-1);
        if (akhir?.jenis === "teks") akhir.teks += `\n\n${mentah.trim()}`;
        else aktifBacaan.blok.push({ jenis: "teks", teks: mentah.trim() });
      }
      continue;
    }

    const s = aktifSoal;
    if (!s) {
      if (!adaTeksNyasar) {
        adaTeksNyasar = true;
        catat("soal", 0, "", "Ada teks sebelum penanda #BACAAN atau #SOAL pertama; teks itu diabaikan.", "peringatan");
      }
      continue;
    }
    const noSoal = s.nomor + 1;
    const l = cocokLabel(baris);

    // Pembahasan menampung semua baris sampai penanda berikutnya (Kunci yang terlambat tetap dikenali).
    if (s.aktif === "pembahasan" && !(l && l.kunci === "kunci" && !s.sudah.has("kunci"))) {
      s.pembahasan.push(mentah.trim());
      continue;
    }

    if (l) {
      if (s.sudah.has(l.kunci)) {
        catat("soal", noSoal, KOLOM_DARI_LABEL[l.kunci], `Label "${NAMA_LABEL[l.kunci]}" muncul lebih dari sekali.`);
        continue;
      }
      s.sudah.add(l.kunci);
      switch (l.kunci) {
        case "soal":
          s.aktif = "soal";
          if (l.nilai) s.redaksi.push(l.nilai.replace(POLA_NOMOR, ""));
          break;
        case "kunci":
          s.aktif = "kunci";
          s.kunci = l.nilai;
          break;
        case "pembahasan":
          s.aktif = "pembahasan";
          if (l.nilai) s.pembahasan.push(l.nilai);
          break;
        default:
          s.meta[l.kunci] = l.nilai;
          s.aktif = "lain";
      }
      continue;
    }

    const opsi = s.aktif === "soal" || s.aktif === "opsi" ? mentah.match(POLA_OPSI) : null;
    if (opsi) {
      const i = "ABCDE".indexOf(opsi[1].toUpperCase());
      if (s.opsi[i] !== null) {
        catat("soal", noSoal, `opsi_${"abcde"[i]}`, `Pilihan ${"ABCDE"[i]} muncul lebih dari sekali.`);
      } else {
        s.opsi[i] = opsi[2].trim();
      }
      s.aktif = "opsi";
      s.opsiTerakhir = i;
      continue;
    }

    if (s.aktif === "soal") s.redaksi.push(s.redaksi.length === 0 ? mentah.trim().replace(POLA_NOMOR, "") : mentah.trim());
    else if (s.aktif === "opsi" && s.opsiTerakhir >= 0) s.opsi[s.opsiTerakhir] = `${s.opsi[s.opsiTerakhir] ?? ""} ${mentah.trim()}`.trim();
    else if (s.aktif === "kunci") s.kunci = `${s.kunci} ${mentah.trim()}`.trim();
    else catat("soal", noSoal, "", `Baris "${mentah.trim().slice(0, 40)}" tidak dikenali dan diabaikan.`, "peringatan");
  }

  const soalBaris: string[][] = [[...KOLOM_SOAL]];
  for (const s of soal) {
    const jenis = normalJenis(s.meta.jenis ?? "");
    const nilai: Record<(typeof KOLOM_SOAL)[number], string> = {
      subtes: s.meta.subtes ?? "",
      topik: s.meta.topik ?? "",
      tipe: jenis,
      redaksi: s.redaksi.join("\n\n"),
      opsi_a: s.opsi[0] ?? "",
      opsi_b: s.opsi[1] ?? "",
      opsi_c: s.opsi[2] ?? "",
      opsi_d: s.opsi[3] ?? "",
      opsi_e: s.opsi[4] ?? "",
      kunci: jenis === "isian" ? s.kunci.trim() : normalKunciPg(s.kunci),
      pembahasan: s.pembahasan.join("\n\n"),
      kesulitan: s.meta.kesulitan ?? "",
      level_kognitif: (s.meta.level ?? "").trim(),
      estimasi_detik: angkaDepan(s.meta.waktu ?? ""),
      sumber_rujukan: s.meta.sumber ?? "",
      kode_bacaan: (s.meta.bacaan ?? "").trim(),
      urutan_dalam_bacaan: "",
    };
    soalBaris.push(KOLOM_SOAL.map((k) => nilai[k]));
  }

  let bacaanBaris: string[][] | null = null;
  const bacaanBlok = new Map<number, BlokStimulus[]>();
  if (bacaan.length > 0) {
    bacaanBaris = [[...KOLOM_BACAAN]];
    for (const b of bacaan) {
      const teks = b.blok.flatMap((x) => (x.jenis === "teks" ? [x.teks] : [])).join("\n\n");
      bacaanBaris.push([b.kode, b.subtes, teks, b.sumber]);
      // Bacaan tanpa tabel tetap lewat kolom teks, sama persis dengan jalur CSV.
      if (b.blok.some((x) => x.jenis === "tabel")) bacaanBlok.set(bacaanBaris.length, b.blok);
    }
  }
  return { soalBaris, bacaanBaris, bacaanBlok, penolakan: [...penolakan], catatan };
}

// ---------------------------------------------------------------------------
// Deteksi persamaan Word, gambar, sel gabungan & tabel bersarang dari XML dokumen
// ---------------------------------------------------------------------------

export interface TemuanObjekDocx {
  jenis: "persamaan" | "gambar" | "sel_gabungan" | "tabel_bersarang";
  /** true bila persamaan/gambar berada di dalam sel tabel. */
  diSel?: true;
  /** Bagian terdekat: soal ke-N, bacaan ke-N, atau sebelum penanda pertama. */
  konteks: "soal" | "bacaan" | "awal";
  nomor: number;
}

const decodeXml = (s: string) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/**
 * Pindai word/document.xml: objek persamaan (m:oMath, m:oMathPara) dan gambar
 * (w:drawing, w:pict, w:object) dilaporkan beserta soal/bacaan terdekat
 * (dihitung dari paragraf berawalan #SOAL / #BACAAN di luar tabel). Sel gabungan
 * dan tabel bersarang hanya dilaporkan di bacaan; di tempat lain tabelnya sendiri
 * sudah ditolak pengurai. Tidak ada yang dibuang diam-diam.
 */
export function cariObjekTerlarangDocx(xml: string): TemuanObjekDocx[] {
  const hasil: TemuanObjekDocx[] = [];
  const sudah = new Set<string>();
  let soal = 0;
  let bacaan = 0;
  let konteks: TemuanObjekDocx["konteks"] = "awal";
  let teksParagraf = "";
  let paragrafDihitung = false;
  let dalamTabel = 0;
  const lapor = (jenis: TemuanObjekDocx["jenis"], diSel = false) => {
    const nomor = konteks === "soal" ? soal : konteks === "bacaan" ? bacaan : 0;
    const kunci = `${jenis}|${konteks}|${nomor}|${diSel}`;
    if (sudah.has(kunci)) return;
    sudah.add(kunci);
    hasil.push({ jenis, konteks, nomor, ...(diSel ? { diSel: true as const } : {}) });
  };
  // Riwayat pelacakan perubahan menyimpan properti sel LAMA; jangan dihitung.
  const bersihXml = xml.replace(/<w:tcPrChange[\s>][\s\S]*?<\/w:tcPrChange>/g, "");
  const token =
    /<w:p[ >\/]|<m:oMathPara[ >\/]|<m:oMath[ >\/]|<w:drawing[ >\/]|<w:pict[ >\/]|<w:object[ >\/]|<w:tbl(?:\s[^>]*)?>|<\/w:tbl>|<w:gridSpan\s[^>]*>|<w:[vh]Merge[ >\/]|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  for (const m of bersihXml.matchAll(token)) {
    const t = m[0];
    if (t === "</w:tbl>") {
      dalamTabel = Math.max(0, dalamTabel - 1);
    } else if (t.startsWith("<w:tbl")) {
      dalamTabel += 1;
      if (dalamTabel > 1 && konteks === "bacaan") lapor("tabel_bersarang");
    } else if (t.startsWith("<w:gridSpan") || t.startsWith("<w:vMerge") || t.startsWith("<w:hMerge")) {
      const melebar1 = t.startsWith("<w:gridSpan") && !(Number(t.match(/w:val="(\d+)"/)?.[1]) > 1);
      if (!melebar1 && konteks === "bacaan") lapor("sel_gabungan");
    } else if (t.startsWith("<w:p ") || t.startsWith("<w:p>") || t.startsWith("<w:p/")) {
      teksParagraf = "";
      paragrafDihitung = false;
    } else if (t.startsWith("<w:t")) {
      teksParagraf += decodeXml(m[1] ?? "");
      if (!paragrafDihitung && dalamTabel === 0) {
        const penanda = tanpaNomor(teksParagraf.trim()).match(POLA_PENANDA);
        if (penanda) {
          paragrafDihitung = true;
          if (penanda[1].toLowerCase() === "soal") {
            soal += 1;
            konteks = "soal";
          } else {
            bacaan += 1;
            konteks = "bacaan";
          }
        }
      }
    } else {
      lapor(t.startsWith("<m:") ? "persamaan" : "gambar", dalamTabel > 0);
    }
  }
  return hasil;
}

/** Pesan penolakan berkas untuk Admin, satu per temuan. */
export function pesanObjekTerlarang(temuan: TemuanObjekDocx[]): string[] {
  return temuan.map((t) => {
    const bagian = t.konteks === "soal" ? `soal ke-${t.nomor}` : t.konteks === "bacaan" ? `bacaan ke-${t.nomor}` : null;
    if (t.jenis === "sel_gabungan") {
      return `Ada sel gabungan (merge) di tabel ${bagian}. Pisahkan selnya supaya tiap baris punya jumlah sel yang sama, lalu unggah lagi.`;
    }
    if (t.jenis === "tabel_bersarang") return `Ada tabel di dalam tabel di ${bagian}. Jadikan tabel biasa lalu unggah lagi.`;
    const diSel = t.diSel ? "di sel tabel " : "";
    const letak = bagian ? `${diSel || "di "}${bagian}` : `${diSel}sebelum soal pertama`;
    return t.jenis === "persamaan"
      ? `Ada persamaan Word (Equation) ${letak}. Tulis rumus sebagai teks \\( ... \\) lalu unggah lagi.`
      : `Ada gambar ${letak}. Gambar belum didukung — hapus gambarnya atau tulis ulang sebagai teks.`;
  });
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

/** Isi template Word: 1 bacaan (dengan tabel kecil) + 2 soal contoh (dipakai pembuat berkas di server dan tes). */
export function isiTemplateDocx(): ItemDocx[] {
  return [
    "#BACAAN kode=B1",
    "Subtes: Penalaran Umum",
    `Sumber: ${SUMBER_BAWAAN}`,
    "Banjir kembali merendam sejumlah kawasan kota setelah hujan deras semalam.",
    "Warga menyebut genangan makin sering terjadi, bahkan ketika hujan hanya turun sebentar.",
    {
      tabel: [
        ["Kawasan", "Tinggi genangan (cm)"],
        ["Utara", "40"],
        ["Selatan", "25"],
      ],
    },
    "#SOAL",
    "Subtes: Penalaran Umum",
    "Jenis: PG",
    "Kesulitan: sedang",
    "Level: 1",
    "Waktu: 90",
    "Bacaan: B1",
    "Soal: Berdasarkan bacaan, apa gagasan utama paragraf tersebut?",
    "A. Hujan turun setiap hari",
    "B. Kota sering banjir",
    "C. Petani butuh air",
    "D. Cuaca tidak menentu",
    "E. Musim kemarau panjang",
    "Kunci: B",
    "Pembahasan: Paragraf membahas banjir yang sering terjadi di kota sehingga gagasan utamanya adalah pilihan B.",
    "#SOAL",
    "Subtes: Penalaran Umum",
    "Jenis: PG",
    "Kesulitan: mudah",
    "Soal: Jika \\(x^2 = 9\\) dan \\(x > 0\\), berapakah nilai \\(x + 1\\)?",
    "A. 2",
    "B. 3",
    "C. 4",
    "D. 5",
    "E. 6",
    "Kunci: C",
    "Pembahasan: Dari \\(x^2 = 9\\) dan \\(x > 0\\) diperoleh \\(x = 3\\), sehingga \\(x + 1 = 4\\).",
  ];
}
