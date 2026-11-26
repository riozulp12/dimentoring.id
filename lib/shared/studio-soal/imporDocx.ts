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
 *   Subtes: ...  Topik: ...  Jenis: PG | Majemuk | Isian
 *   Kesulitan: mudah|sedang|hots   Level: 1-3   Waktu: detik   Bacaan: B1   (opsional)
 *   Soal: <redaksi, boleh banyak paragraf sampai baris A.>
 *   A. ...  B. ...  C. ...  D. ...  E. ...
 *   Kunci: C                    (Isian: jawaban dipisah |)
 *   Pembahasan: <boleh banyak paragraf sampai #SOAL berikutnya>
 *
 * Jenis "Majemuk" (alias "Majemuk Kompleks") tanpa A–E:
 *   Kolom: Benar | Salah        (opsional; tepat 2 label)
 *   P1. <pernyataan>  P2. ...   (2–6, berurutan; satu paragraf per pernyataan)
 *   Kunci: P1=Benar, P2=Salah
 *
 * Tabel hanya diterima di dalam #BACAAN dan menjadi blok tabel pada bacaan, urut
 * sesuai dokumen; tabel di tempat lain menolak seluruh berkas (penolakan).
 *
 * Gambar SEBARIS (PNG/JPEG/WebP) diterima di redaksi, pembahasan, dan bacaan:
 * analisisObjekDocx() menggantinya dengan penanda sisipan di tempatnya, lalu di
 * sini menjadi penanda {{gN}} (soal) atau blok gambar (bacaan). Gambar di pilihan,
 * pernyataan, kunci, atau label menolak berkas.
 *
 * Persamaan Word (m:oMath), gambar mengambang/bentuk/tabel, sel gabungan, dan
 * tabel bersarang TIDAK diterima: berkas ditolak, menyebut soal/bacaan terdekat.
 * Rumus ditulis sebagai teks \( ... \) lalu divalidasi cekRumus oleh susunImpor.
 */
import { KOLOM_BACAAN, KOLOM_SOAL, SUMBER_BAWAAN, type GalatImpor } from "./impor";
import { ALT_BAWAAN, BATAS_GAMBAR, type GambarEntri } from "./gambar";
import { BATAS, type BlokStimulus } from "./tipe";

/** Berkas diunggah browser langsung ke Storage, jadi tidak dibatasi body fungsi. */
export const BATAS_BYTE_DOCX = 25 * 1024 * 1024;

/** Penanda sisipan gambar ke-n di teks dokumen (karakter Private Use Area). */
export const sisipan = (n: number) => `\uE000${n}\uE001`;
const POLA_SISIP = /\uE000(\d+)\uE001/g;

/** Gambar yang sudah diperiksa & diberi id, sesuai urutan sisipan. */
export interface GambarSumber {
  media_id: string;
  alt: string;
  /** Teks alternatif kosong di Word: dipakai ALT_BAWAAN + peringatan. */
  altBawaan: boolean;
}

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
  /** Daftar gambar per nomor baris soalBaris. */
  soalGambar: Map<number, GambarEntri[]>;
  /** Alasan menolak SELURUH berkas (tabel di luar #BACAAN, gambar di tempat terlarang). */
  penolakan: string[];
  /** Galat/peringatan struktur (label ganda, pilihan ganda dua kali, teks nyasar). baris = nomor soal ke-N + 1. */
  catatan: GalatImpor[];
}

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

type KunciLabel = "subtes" | "topik" | "jenis" | "kesulitan" | "level" | "waktu" | "bacaan" | "soal" | "kolom" | "kunci" | "pembahasan" | "sumber";

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
  kolom: "kolom",
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
  kolom: "Kolom",
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
  kolom: "label_kolom_1",
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

/** "P1." / "p2)" — bukan "P1.5". */
const POLA_PERNYATAAN = /^\s*p\s*(\d{1,2})\s*[.)](?!\d)\s*([\s\S]*)$/i;
const MAKS_P = BATAS.pernyataanMaks;

/** Buang nomor di depan hanya bila sisanya penanda atau label ("1. Soal: ..."). */
function tanpaNomor(baris: string): string {
  const sisa = baris.replace(POLA_NOMOR, "");
  if (sisa === baris) return baris;
  return POLA_PENANDA.test(sisa) || POLA_PERNYATAAN.test(sisa) || cocokLabel(sisa) ? sisa : baris;
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
  /** Nomor P -> teks, hanya 1..6. */
  pernyataan: Map<number, string>;
  kunci: string;
  pembahasan: string[];
  aktif: "soal" | "opsi" | "pernyataan" | "kunci" | "pembahasan" | "lain" | null;
  opsiTerakhir: number;
  pernyataanTerakhir: number;
  sudah: Set<KunciLabel>;
}

const normalJenis = (v: string) => {
  const k = rapikan(v).toLocaleLowerCase("id-ID");
  if (["pg", "pilihan ganda", "pilihan_ganda"].includes(k)) return "pilihan_ganda";
  if (["majemuk", "majemuk kompleks", "majemuk_kompleks"].includes(k)) return "majemuk_kompleks";
  if (k === "isian") return "isian";
  return k;
};
const normalKunciPg = (v: string) => {
  const m = v.trim().match(/^\(?([A-Ea-e])\s*[.)]?$/);
  return m ? m[1].toUpperCase() : v.trim();
};
/** "P1=Benar, P2=Salah" -> "Benar|Salah" (posisi = nomor P; yang tak disebut kosong). */
function uraiKunciMajemuk(teks: string, galat: (pesan: string) => void): string {
  const nilai = new Map<number, string>();
  const bagian = teks
    .split(/(?<![\p{L}\p{N}])(?=p\s*\d+\s*=)/iu)
    .map((x) => x.trim())
    .filter((x) => x !== "");
  for (const b of bagian) {
    const m = b.match(/^p\s*(\d+)\s*=\s*([^=|]*?)\s*[,;]?$/i);
    if (!m) galat(`Kunci majemuk "${b.slice(0, 40)}" tidak terbaca. Tulis seperti P1=Benar, P2=Salah.`);
    else {
      const n = Number(m[1]);
      if (n < 1 || n > MAKS_P) galat(`Kunci P${n}: nomor pernyataan hanya P1 sampai P${MAKS_P}.`);
      else if (nilai.has(n)) galat(`Kunci P${n} ditulis lebih dari sekali.`);
      else nilai.set(n, m[2]);
    }
  }
  return Array.from({ length: Math.max(0, ...nilai.keys()) }, (_, i) => nilai.get(i + 1) ?? "").join("|");
}

const angkaDepan = (v: string) => v.trim().replace(/\s*(detik|dtk|s)\.?$/i, "");

const memuatPenanda = (t: TabelDocx) =>
  t.tabel.some((baris) => baris.some((sel) => sel.split("\n").some((l) => POLA_PENANDA.test(tanpaNomor(l)))));

export function uraiParagrafDocx(isi: ItemDocx[], gambar: GambarSumber[] = []): HasilUraiDocx {
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
        penolakan.add(
          `Soal ke-${aktifSoal.nomor} berisi tabel; ${pindahkan} Atau, untuk soal benar/salah per pernyataan, tulis sebagai Jenis: Majemuk dengan baris P1., P2., ...`,
        );
      } else {
        penolakan.add(`Ada tabel sebelum soal pertama; ${pindahkan}`);
      }
      continue;
    }
    // Label & penanda dikenali dari teks tanpa sisipan gambar; isinya tetap memakai `mentah`.
    const adaGambar = mentah.includes("\uE000");
    const baris = tanpaNomor(adaGambar ? mentah.replace(POLA_SISIP, "").trim() : mentah);
    const penanda = baris.match(POLA_PENANDA);
    if (penanda) {
      if (adaGambar) penolakan.add("Ada gambar di baris penanda #SOAL/#BACAAN. Pindahkan gambarnya ke paragraf sendiri.");
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
          pernyataan: new Map(),
          kunci: "",
          pembahasan: [],
          aktif: null,
          opsiTerakhir: -1,
          pernyataanTerakhir: 0,
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
        if (adaGambar) {
          penolakan.add(`Ada gambar di baris ${NAMA_LABEL[l.kunci]} bacaan ke-${aktifBacaan.nomor}. Pindahkan ke paragraf isi bacaan.`);
        }
        if (aktifBacaan.sudah.has(l.kunci)) {
          catat("bacaan", aktifBacaan.nomor + 1, KOLOM_DARI_LABEL[l.kunci], `Label "${NAMA_LABEL[l.kunci]}" muncul lebih dari sekali.`);
        } else {
          aktifBacaan.sudah.add(l.kunci);
          if (l.kunci === "subtes") aktifBacaan.subtes = l.nilai;
          else aktifBacaan.sumber = l.nilai;
        }
      } else {
        // [teks, nomor, teks, nomor, teks]: teks dan gambar berurutan seperti di dokumen.
        mentah.split(POLA_SISIP).forEach((potong, i) => {
          const b = aktifBacaan as BlokBacaan;
          if (i % 2 === 1) {
            const g = gambar[Number(potong)];
            if (!g) return;
            b.blok.push({ jenis: "gambar", media_id: g.media_id, alt: g.alt });
            if (g.altBawaan) {
              catat("bacaan", b.nomor + 1, "teks", `Gambar di bacaan ke-${b.nomor} tidak punya teks alternatif; dipakai "${ALT_BAWAAN}".`, "peringatan");
            }
          } else if (potong.trim() !== "") {
            const akhir = b.blok.at(-1);
            if (akhir?.jenis === "teks") akhir.teks += `\n\n${potong.trim()}`;
            else b.blok.push({ jenis: "teks", teks: potong.trim() });
          }
        });
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

    const tolakGambar = (letak: string) =>
      penolakan.add(`Ada gambar di ${letak} soal ke-${s.nomor}; belum didukung. Pindahkan ke teks soal atau pembahasan.`);
    if (l) {
      let nilai = l.nilai;
      if (adaGambar) {
        if (l.kunci === "soal" || l.kunci === "pembahasan") {
          // Gambar sebelum label ikut ke isi, sesuai urutannya.
          const titik = mentah.search(/[:：]/);
          nilai = [...(mentah.slice(0, titik).match(POLA_SISIP) ?? []), mentah.slice(titik + 1).trim()].join(" ").trim();
        } else tolakGambar(`baris ${NAMA_LABEL[l.kunci]}`);
      }
      if (s.sudah.has(l.kunci)) {
        catat("soal", noSoal, KOLOM_DARI_LABEL[l.kunci], `Label "${NAMA_LABEL[l.kunci]}" muncul lebih dari sekali.`);
        continue;
      }
      s.sudah.add(l.kunci);
      switch (l.kunci) {
        case "soal":
          s.aktif = "soal";
          if (nilai) s.redaksi.push(nilai.replace(POLA_NOMOR, ""));
          break;
        case "kunci":
          s.aktif = "kunci";
          s.kunci = l.nilai;
          break;
        case "pembahasan":
          s.aktif = "pembahasan";
          if (nilai) s.pembahasan.push(nilai);
          break;
        default:
          s.meta[l.kunci] = l.nilai;
          s.aktif = "lain";
      }
      continue;
    }

    const p = baris.match(POLA_PERNYATAAN);
    if (p) {
      if (adaGambar) tolakGambar("pernyataan");
      const n = Number(p[1]);
      const sebelumnya = Math.max(0, ...s.pernyataan.keys());
      s.aktif = "pernyataan";
      s.pernyataanTerakhir = 0;
      if (n < 1) catat("soal", noSoal, "pernyataan_1", "Nomor pernyataan mulai dari P1.");
      else if (n > MAKS_P) catat("soal", noSoal, `pernyataan_${n}`, `Maksimal ${MAKS_P} pernyataan (P1 sampai P${MAKS_P}).`);
      else if (s.pernyataan.has(n)) catat("soal", noSoal, `pernyataan_${n}`, `Pernyataan P${n} muncul lebih dari sekali.`);
      else {
        if (n < sebelumnya) {
          catat("soal", noSoal, `pernyataan_${n}`, `Nomor pernyataan harus berurutan P1, P2, ...: P${n} ditulis setelah P${sebelumnya}.`);
        }
        s.pernyataan.set(n, p[2].trim());
        s.pernyataanTerakhir = n;
      }
      continue;
    }

    // Di soal berpernyataan, baris A–E tetap dikenali supaya ditolak, bukan menempel ke teks lain.
    const bisaOpsi =
      s.aktif === "soal" || s.aktif === "opsi" || (s.aktif !== "kunci" && (s.pernyataan.size > 0 || s.sudah.has("kolom")));
    const opsiCocok = (adaGambar ? baris : mentah).match(POLA_OPSI);
    const opsi = bisaOpsi || (s.aktif !== "kunci" && normalJenis(s.meta.jenis ?? "") === "majemuk_kompleks") ? opsiCocok : null;
    if (opsi) {
      if (adaGambar) tolakGambar("pilihan jawaban");
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

    if (adaGambar && s.aktif !== "soal") {
      if (s.aktif === "opsi") tolakGambar("pilihan jawaban");
      else if (s.aktif === "pernyataan") tolakGambar("pernyataan");
      else if (s.aktif === "kunci") tolakGambar("baris Kunci");
      else penolakan.add(`Gambar di soal ke-${s.nomor} harus diletakkan sesudah baris Soal: atau di Pembahasan.`);
      continue;
    }
    if (s.aktif === "soal") s.redaksi.push(s.redaksi.length === 0 ? mentah.trim().replace(POLA_NOMOR, "") : mentah.trim());
    else if (s.aktif === "opsi" && s.opsiTerakhir >= 0) s.opsi[s.opsiTerakhir] = `${s.opsi[s.opsiTerakhir] ?? ""} ${mentah.trim()}`.trim();
    else if (s.aktif === "pernyataan") {
      const n = s.pernyataanTerakhir;
      if (n > 0) s.pernyataan.set(n, `${s.pernyataan.get(n) ?? ""} ${mentah.trim()}`.trim());
    } else if (s.aktif === "kunci") s.kunci = `${s.kunci} ${mentah.trim()}`.trim();
    else catat("soal", noSoal, "", `Baris "${mentah.trim().slice(0, 40)}" tidak dikenali dan diabaikan.`, "peringatan");
  }

  const soalBaris: string[][] = [[...KOLOM_SOAL]];
  const soalGambar = new Map<number, GambarEntri[]>();
  for (const s of soal) {
    const jenis = normalJenis(s.meta.jenis ?? "");
    const galat = (kolom: string, pesan: string) => catat("soal", s.nomor + 1, kolom, pesan);
    for (const [n, teks] of s.pernyataan) {
      if (teks === "") galat(`pernyataan_${n}`, `Pernyataan P${n} kosong.`);
    }
    let label = ["", ""];
    if (s.sudah.has("kolom")) {
      const isiKolom = (s.meta.kolom ?? "").split("|").map((x) => x.trim());
      if (isiKolom.length === 2 && isiKolom.every((x) => x !== "")) label = isiKolom;
      else {
        galat("label_kolom_1", "Kolom harus berisi tepat 2 label dipisah |, mis. Kolom: Benar | Salah.");
        // Tetap ditandai terisi supaya soal non-majemuk juga diberi tahu.
        if (jenis !== "majemuk_kompleks") label = [s.meta.kolom || "-", ""];
      }
    }
    // Baris "A." kosong di soal majemuk tetap harus terlihat oleh pemeriksa.
    const opsiKe = (i: number) => (jenis === "majemuk_kompleks" && s.opsi[i] === "" ? "-" : (s.opsi[i] ?? ""));
    const kunci =
      jenis === "majemuk_kompleks"
        ? uraiKunciMajemuk(s.kunci, (pesan) => galat("kunci", pesan))
        : jenis === "isian"
          ? s.kunci.trim()
          : normalKunciPg(s.kunci);
    // Sisipan -> {{g1}}, {{g2}}, ... berurutan: teks soal dulu, lalu pembahasan.
    const entri: GambarEntri[] = [];
    const pasang = (teks: string, kolom: string) =>
      teks.replace(POLA_SISIP, (_, n: string) => {
        const g = gambar[Number(n)];
        if (!g) return "";
        const kode = `g${entri.length + 1}`;
        entri.push({ kode, media_id: g.media_id, alt: g.alt });
        if (g.altBawaan) {
          catat("soal", s.nomor + 1, kolom, `Gambar ${kode} di soal ke-${s.nomor} tidak punya teks alternatif; dipakai "${ALT_BAWAAN}".`, "peringatan");
        }
        return `{{${kode}}}`;
      });
    const redaksi = pasang(s.redaksi.join("\n\n"), "redaksi");
    const pembahasan = pasang(s.pembahasan.join("\n\n"), "pembahasan");
    if (entri.length > 0) soalGambar.set(s.nomor + 1, entri);
    const nilai: Record<(typeof KOLOM_SOAL)[number], string> = {
      subtes: s.meta.subtes ?? "",
      topik: s.meta.topik ?? "",
      tipe: jenis,
      redaksi,
      opsi_a: opsiKe(0),
      opsi_b: opsiKe(1),
      opsi_c: opsiKe(2),
      opsi_d: opsiKe(3),
      opsi_e: opsiKe(4),
      kunci,
      pembahasan,
      kesulitan: s.meta.kesulitan ?? "",
      level_kognitif: (s.meta.level ?? "").trim(),
      estimasi_detik: angkaDepan(s.meta.waktu ?? ""),
      sumber_rujukan: s.meta.sumber ?? "",
      kode_bacaan: (s.meta.bacaan ?? "").trim(),
      urutan_dalam_bacaan: "",
      label_kolom_1: label[0],
      label_kolom_2: label[1],
      pernyataan_1: s.pernyataan.get(1) ?? "",
      pernyataan_2: s.pernyataan.get(2) ?? "",
      pernyataan_3: s.pernyataan.get(3) ?? "",
      pernyataan_4: s.pernyataan.get(4) ?? "",
      pernyataan_5: s.pernyataan.get(5) ?? "",
      pernyataan_6: s.pernyataan.get(6) ?? "",
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
      // Bacaan tanpa tabel/gambar tetap lewat kolom teks, sama persis dengan jalur CSV.
      if (b.blok.some((x) => x.jenis !== "teks")) bacaanBlok.set(bacaanBaris.length, b.blok);
    }
  }
  return { soalBaris, bacaanBaris, bacaanBlok, soalGambar, penolakan: [...penolakan], catatan };
}

// ---------------------------------------------------------------------------
// Pemeriksaan XML dokumen: persamaan Word, gambar, sel gabungan & tabel bersarang
// ---------------------------------------------------------------------------

export interface TemuanObjekDocx {
  jenis:
    | "persamaan"
    | "gambar"
    | "gambar_mengambang"
    | "gambar_svg"
    | "gambar_tautan"
    | "bentuk"
    | "terlalu_banyak"
    | "sel_gabungan"
    | "tabel_bersarang";
  /** true bila persamaan/gambar berada di dalam sel tabel. */
  diSel?: true;
  /** Bagian terdekat: soal ke-N, bacaan ke-N, atau sebelum penanda pertama. */
  konteks: "soal" | "bacaan" | "awal";
  nomor: number;
}

/** Gambar sebaris yang diterima: byte-nya diambil lewat rId, posisinya ditandai penanda sisipan. */
export interface GambarInline {
  rId: string;
  /** wp:docPr descr; "" bila kosong. */
  alt: string;
  konteks: "soal" | "bacaan";
  nomor: number;
}

const decodeXml = (s: string) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Satu <w:drawing>: gambar sebaris yang bisa dipakai, atau jenis penolakannya. */
function periksaDrawing(d: string, terbungkus: boolean): TemuanObjekDocx["jenis"] | { rId: string; alt: string } {
  if (/<wp:anchor[\s>]/.test(d)) return "gambar_mengambang";
  // Bentuk/kotak teks/grup/kanvas/bagan/SmartArt, atau dibungkus mc:AlternateContent (fitur khusus Word).
  if (terbungkus || /<(?:c:chart\b|dgm:|wps:|wpg:|wpc:)/.test(d) || /drawingml\/2006\/(?:chart|diagram)\b/.test(d)) return "bentuk";
  if (/svgBlip/.test(d)) return "gambar_svg";
  const blip = d.match(/<a:blip(?:\s[^>]*)?\/?>/g) ?? [];
  if (blip.length > 1) return "bentuk";
  const rId = blip[0]?.match(/\sr:embed="([^"]+)"/)?.[1];
  if (!rId) return blip[0]?.includes("r:link=") ? "gambar_tautan" : "gambar";
  return { rId, alt: decodeXml(d.match(/<wp:docPr\b[^>]*\sdescr="([^"]*)"/)?.[1] ?? "").trim() };
}

/**
 * Pindai word/document.xml. Persamaan (m:oMath) dan objek yang tidak didukung
 * dilaporkan beserta soal/bacaan terdekat (dihitung dari paragraf berawalan #SOAL
 * / #BACAAN di luar tabel). Gambar sebaris yang didukung diganti penanda sisipan
 * di tempatnya (xml hasil), sehingga urutannya terhadap teks terbawa ke pembaca
 * dokumen. Sel gabungan dan tabel bersarang hanya dilaporkan di bacaan; di tempat
 * lain tabelnya sendiri sudah ditolak pengurai. Tidak ada yang dibuang diam-diam.
 */
export function analisisObjekDocx(xml: string): { temuan: TemuanObjekDocx[]; gambar: GambarInline[]; xml: string } {
  const temuan: TemuanObjekDocx[] = [];
  const gambar: GambarInline[] = [];
  const sudah = new Set<string>();
  let soal = 0;
  let bacaan = 0;
  let konteks: TemuanObjekDocx["konteks"] = "awal";
  let teksParagraf = "";
  let paragrafDihitung = false;
  let dalamTabel = 0;
  let dalamPembungkus = 0;
  const nomorKini = () => (konteks === "soal" ? soal : konteks === "bacaan" ? bacaan : 0);
  const lapor = (jenis: TemuanObjekDocx["jenis"], diSel = false) => {
    const nomor = nomorKini();
    const kunci = `${jenis}|${konteks}|${nomor}|${diSel}`;
    if (sudah.has(kunci)) return;
    sudah.add(kunci);
    temuan.push({ jenis, konteks, nomor, ...(diSel ? { diSel: true as const } : {}) });
  };
  // Riwayat pelacakan perubahan menyimpan properti sel LAMA; jangan dihitung.
  // Karakter penanda sisipan yang sudah ada di dokumen dibuang supaya tidak tertukar.
  const sumber = xml.replace(/<w:tcPrChange[\s>][\s\S]*?<\/w:tcPrChange>/g, "").replace(/[\uE000\uE001]/g, "");
  const token =
    /<w:drawing(?:\s[^>]*)?\/>|<w:drawing(?:\s[^>]*)?>[\s\S]*?<\/w:drawing>|<mc:AlternateContent(?:\s[^>]*)?>|<\/mc:AlternateContent>|<w:p[ >\/]|<m:oMathPara[ >\/]|<m:oMath[ >\/]|<w:pict[ >\/]|<w:object[ >\/]|<w:tbl(?:\s[^>]*)?>|<\/w:tbl>|<w:gridSpan\s[^>]*>|<w:[vh]Merge[ >\/]|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let hasilXml = "";
  let disalin = 0;
  for (const m of sumber.matchAll(token)) {
    const t = m[0];
    if (t.startsWith("<w:drawing")) {
      const periksa = periksaDrawing(t, dalamPembungkus > 0);
      if (dalamTabel > 0 && typeof periksa !== "string") lapor("gambar", true);
      else if (typeof periksa === "string") lapor(periksa, dalamTabel > 0);
      else if (konteks === "awal") lapor("gambar");
      else if (gambar.length >= BATAS_GAMBAR.perBerkas) lapor("terlalu_banyak");
      else {
        hasilXml += `${sumber.slice(disalin, m.index)}<w:t xml:space="preserve">${sisipan(gambar.length)}</w:t>`;
        disalin = m.index + t.length;
        gambar.push({ ...periksa, konteks, nomor: nomorKini() });
      }
    } else if (t === "</mc:AlternateContent>") {
      dalamPembungkus = Math.max(0, dalamPembungkus - 1);
    } else if (t.startsWith("<mc:AlternateContent")) {
      if (!t.endsWith("/>")) dalamPembungkus += 1;
    } else if (t === "</w:tbl>") {
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
  return { temuan, gambar, xml: hasilXml + sumber.slice(disalin) };
}

export const cariObjekTerlarangDocx = (xml: string): TemuanObjekDocx[] => analisisObjekDocx(xml).temuan;

/** "soal ke-2" / "bacaan ke-1" / null (sebelum penanda pertama). */
export const namaBagianDocx = (konteks: TemuanObjekDocx["konteks"], nomor: number) =>
  konteks === "awal" ? null : `${konteks} ke-${nomor}`;

/** Pesan penolakan berkas untuk Admin, satu per temuan. */
export function pesanObjekTerlarang(temuan: TemuanObjekDocx[]): string[] {
  return temuan.map((t) => {
    const bagian = namaBagianDocx(t.konteks, t.nomor);
    const diSel = t.diSel ? "di sel tabel " : "";
    const letak = bagian ? `${diSel || "di "}${bagian}` : `${diSel}sebelum soal pertama`;
    switch (t.jenis) {
      case "sel_gabungan":
        return `Ada sel gabungan (merge) di tabel ${bagian}. Pisahkan selnya supaya tiap baris punya jumlah sel yang sama, lalu unggah lagi.`;
      case "tabel_bersarang":
        return `Ada tabel di dalam tabel di ${bagian}. Jadikan tabel biasa lalu unggah lagi.`;
      case "persamaan":
        return `Ada persamaan Word (Equation) ${letak}. Tulis rumus sebagai teks \\( ... \\) lalu unggah lagi.`;
      case "gambar_mengambang":
        return `Ada gambar mengambang ${letak}. Ubah ke 'In line with text' lalu unggah lagi.`;
      case "gambar_svg":
        return `Ada gambar SVG ${letak}. Tempel ulang sebagai PNG atau JPEG.`;
      case "gambar_tautan":
        return `Ada gambar tautan (tidak tertanam) ${letak}. Sisipkan gambarnya langsung ke dokumen.`;
      case "bentuk":
        return `Ada bentuk, kotak teks, SmartArt, atau grafik Word ${letak}. Ganti dengan gambar PNG atau JPEG yang 'In line with text'.`;
      case "terlalu_banyak":
        return `Berkas memuat lebih dari ${BATAS_GAMBAR.perBerkas} gambar. Pecah berkasnya.`;
      default:
        if (t.diSel) return `Ada gambar ${letak}. Gambar di dalam tabel belum didukung; letakkan di luar tabel.`;
        if (!bagian) return `Ada gambar ${letak}. Letakkan gambar di dalam #BACAAN atau soal.`;
        return `Ada gambar ${letak} yang tidak bisa dibaca (gambar lama atau objek). Sisipkan ulang sebagai PNG atau JPEG 'In line with text'.`;
    }
  });
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

/** Isi template Word: 1 bacaan (dengan tabel kecil) + 3 soal contoh (PG berbacaan, PG rumus, majemuk) (dipakai pembuat berkas di server dan tes). */
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
    "#SOAL",
    "Subtes: Penalaran Umum",
    "Jenis: Majemuk",
    "Kesulitan: sedang",
    "Soal: Diketahui \\(x = 3\\). Tentukan benar atau salah setiap pernyataan berikut.",
    "Kolom: Benar | Salah",
    "P1. \\(x\\) adalah bilangan ganjil.",
    "P2. \\(x\\) adalah bilangan genap.",
    "P3. \\(x^2 = 9\\).",
    "Kunci: P1=Benar, P2=Salah, P3=Benar",
    "Pembahasan: Karena \\(x = 3\\), maka \\(x\\) ganjil, bukan genap, dan \\(x^2 = 9\\).",
  ];
}
