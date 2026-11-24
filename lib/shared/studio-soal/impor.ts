/**
 * Unggah soal massal Studio Soal ("Buatan Sendiri") — modul MURNI (tanpa server/DB).
 *
 * Masukan: CSV v1 (soal.csv wajib + bacaan.csv opsional, dihubungkan lewat
 * kode_bacaan) ATAU baris perantara yang sama bentuknya dengan hasil parseCsv
 * (dipakai jalur DOCX, lihat imporDocx.ts) — validasinya satu: susunImpor(). Hanya soal teks + rumus LaTeX; gambar, majemuk kompleks, XLSX,
 * dan DOCX BELUM didukung. Setiap baris divalidasi dengan validator Studio Soal
 * yang sama dengan form mentor (validasiSoal/validasiStimulus mode "ajukan" +
 * cek rumus KaTeX), karena soal impor langsung diterbitkan Admin tanpa tinjau
 * sejawat. Server WAJIB memanggil susunImpor() ulang; hasil klien tidak dipercaya.
 */
import { deteksiPemisahCsv, parseCsv } from "@/lib/admin/parseCsv";
import { buatCsv } from "@/lib/shared/csv";
import { parseAngka } from "./angka";
import { validasiRumusSoal, validasiRumusStimulus } from "./rumus";
import { normalisasiTeks, panjangTrim } from "./teks";
import { BATAS, LABEL_OPSI, TINGKAT_KESULITAN, isSubtesSnbt } from "./tipe";
import { validasiSoal, validasiStimulus, type ErrorValidasi } from "./validasi";

export const VERSI_TEMPLATE_IMPOR = 1;
/** Sumber bawaan bila kolom/label sumber kosong (memenuhi syarat 3–300 karakter stimulus). */
export const SUMBER_BAWAAN = "Buatan Sendiri";
export const BATAS_SOAL_IMPOR = 300;
export const BATAS_TERBIT_IMPOR = 200;
export const TIPE_IMPOR = ["pilihan_ganda", "isian"] as const;

export const KOLOM_SOAL = [
  "subtes",
  "topik",
  "tipe",
  "redaksi",
  "opsi_a",
  "opsi_b",
  "opsi_c",
  "opsi_d",
  "opsi_e",
  "kunci",
  "pembahasan",
  "kesulitan",
  "level_kognitif",
  "estimasi_detik",
  "sumber_rujukan",
  "kode_bacaan",
  "urutan_dalam_bacaan",
] as const;
export const KOLOM_SOAL_WAJIB = ["subtes", "tipe", "redaksi", "kunci", "pembahasan"] as const;
export const KOLOM_BACAAN = ["kode_bacaan", "subtes", "teks", "sumber_rujukan"] as const;

/** Kolom judul yang dikenali sebagai tempat gambar: isinya selalu ditolak. */
const KOLOM_GAMBAR = ["gambar", "image", "foto", "url_gambar"];

export interface SubtesImpor {
  id: string;
  nama: string;
  kategori: string;
}
export interface TopikImpor {
  id: string;
  subtes_id: string;
  nama: string;
}

export type TingkatGalat = "galat" | "peringatan";
export interface GalatImpor {
  berkas: "soal" | "bacaan";
  /** Nomor baris di berkas (judul = 1, data mulai 2). 0 = masalah di tingkat berkas. */
  baris: number;
  kolom: string;
  pesan: string;
  tingkat: TingkatGalat;
}

export interface StimulusSiap {
  kode: string;
  subtes_id: string;
  judul_internal: string;
  konten: { v: 1; blok: { jenis: "teks"; teks: string }[] };
  sumber_rujukan: string;
}
export interface SoalSiap {
  subtes_id: string;
  topik_id: string | null;
  stimulus_kode: string | null;
  urutan_dalam_stimulus: number | null;
  tipe: "pilihan_ganda" | "isian";
  redaksi: string;
  konten: Record<string, unknown>;
  kunci: Record<string, unknown>;
  pembahasan: string;
  sumber_rujukan: string | null;
  tingkat_kesulitan: string;
  level_kognitif: number | null;
  estimasi_waktu_detik: number | null;
}

export type StatusBaris = "ok" | "peringatan" | "galat";
export interface BarisPratinjau {
  baris: number;
  subtes: string;
  tipe: string;
  /** Cuplikan redaksi (teks apa adanya, termasuk rumus). */
  redaksi: string;
  /** Kunci jawaban — hanya untuk layar Admin unggah soal. */
  kunci: string;
  kodeBacaan: string;
  status: StatusBaris;
}

export interface HasilImpor {
  galat: GalatImpor[];
  peringatan: GalatImpor[];
  pratinjau: BarisPratinjau[];
  stimulus: StimulusSiap[];
  soal: SoalSiap[];
  /** Baris soal yang lolos (ok + peringatan). */
  ringkasan: {
    jumlahBaris: number;
    jumlahOk: number;
    jumlahGalat: number;
    jumlahPeringatan: number;
    jumlahBacaan: number;
  };
}

export interface MasukanImpor {
  soalCsv: string;
  bacaanCsv?: string | null;
  /** Baris perantara (baris pertama = judul kolom, seperti hasil parseCsv). Bila ada, menggantikan soalCsv/bacaanCsv. */
  soalBaris?: string[][];
  bacaanBaris?: string[][] | null;
  /** Catatan struktur dari pengurai sebelumnya (mis. DOCX); baris yang memuat galat tidak ikut disimpan. */
  galatTambahan?: GalatImpor[];
  subtes: SubtesImpor[];
  topik: TopikImpor[];
  /** Redaksi soal yang sudah ada di bank (apa adanya); dinormalisasi di sini. */
  redaksiAda?: Iterable<string>;
}

// ---------------------------------------------------------------------------
// Utilitas
// ---------------------------------------------------------------------------

const rapikanNama = (s: string) => s.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("id-ID");
const bersih = (s: string | undefined) => (s ?? "").replace(/^﻿/, "").trim();
const cuplik = (s: string, maks = 90) => {
  const satu = s.replace(/\s+/gu, " ").trim();
  return satu.length > maks ? `${satu.slice(0, maks - 1)}…` : satu;
};

const POLA_GAMBAR: RegExp[] = [
  /<\s*img\b/i,
  /<\s*svg\b/i,
  /!\[[^\]]*\]\([^)]*\)/,
  /\\includegraphics/i,
  /data:image\//i,
  /https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?\S*)?(?=$|[\s)"'])/i,
  /^\s*\[\s*(?:gambar|image|foto)\b/i,
];
export const adaGambar = (teks: string) => POLA_GAMBAR.some((p) => p.test(teks));

function bacaTabel(csv: string, baris?: string[][] | null): { judul: string[]; data: { baris: number; sel: string[] }[]; galatBentuk: string | null } {
  const rows = baris ?? parseCsv(csv, deteksiPemisahCsv(csv));
  if (rows.length === 0) return { judul: [], data: [], galatBentuk: "Berkas kosong." };
  const judul = rows[0].map((h) => rapikanNama(bersih(h)).replace(/\s+/gu, "_"));
  const data: { baris: number; sel: string[] }[] = [];
  rows.slice(1).forEach((sel, i) => {
    if (sel.every((c) => c.trim() === "")) return;
    data.push({ baris: i + 2, sel });
  });
  return { judul, data, galatBentuk: null };
}

/** Peta field validator -> nama kolom CSV, supaya pesan menunjuk kolom yang benar. */
function kolomDariField(field: string, tipe: string): string {
  if (field === "" || field === "redaksi") return "redaksi";
  const opsi = field.match(/^konten\.opsi\.(\d)/);
  if (opsi) return `opsi_${"abcde"[Number(opsi[1])] ?? "a"}`;
  if (field.startsWith("konten.rumpang")) return tipe === "isian" ? "redaksi" : "tipe";
  if (field.startsWith("konten")) return tipe === "isian" ? "redaksi" : "opsi_a";
  if (field.startsWith("kunci")) return "kunci";
  const peta: Record<string, string> = {
    pembahasan: "pembahasan",
    tingkat_kesulitan: "kesulitan",
    level_kognitif: "level_kognitif",
    estimasi_waktu_detik: "estimasi_detik",
    sumber_rujukan: "sumber_rujukan",
    urutan_dalam_stimulus: "urutan_dalam_bacaan",
    subtes_id: "subtes",
    tipe: "tipe",
  };
  return peta[field] ?? field;
}

function kolomDariFieldBacaan(field: string): string {
  if (field.startsWith("konten")) return "teks";
  if (field === "judul_internal") return "kode_bacaan";
  if (field === "sumber_rujukan") return "sumber_rujukan";
  if (field === "subtes_id") return "subtes";
  return field || "teks";
}

function bulat(teks: string, min: number, maks: number): number | null {
  if (!/^\d{1,6}$/.test(teks)) return null;
  const n = Number(teks);
  return n >= min && n <= maks ? n : null;
}

// ---------------------------------------------------------------------------
// Susun & validasi
// ---------------------------------------------------------------------------

export function susunImpor(masukan: MasukanImpor): HasilImpor {
  const semua: GalatImpor[] = [];
  const tambah = (
    berkas: GalatImpor["berkas"],
    baris: number,
    kolom: string,
    pesan: string,
    tingkat: TingkatGalat = "galat",
  ) => {
    if (!semua.some((g) => g.berkas === berkas && g.baris === baris && g.kolom === kolom && g.pesan === pesan)) {
      semua.push({ berkas, baris, kolom, pesan, tingkat });
    }
  };

  for (const g of masukan.galatTambahan ?? []) tambah(g.berkas, g.baris, g.kolom, g.pesan, g.tingkat);

  const petaSubtes = new Map(masukan.subtes.map((s) => [rapikanNama(s.nama), s]));
  const petaTopik = new Map(masukan.topik.map((t) => [`${t.subtes_id}|${rapikanNama(t.nama)}`, t]));
  const redaksiBank = new Set([...(masukan.redaksiAda ?? [])].map((r) => normalisasiTeks(r)));

  // ---- bacaan.csv ----
  const stimulus: StimulusSiap[] = [];
  const bacaanBermasalah = new Set<string>();
  const petaBacaan = new Map<string, { subtesId: string }>();
  const barisBacaan = new Map<string, number>();
  const adaBacaanCsv =
    (masukan.bacaanBaris?.length ?? 0) > 0 || (typeof masukan.bacaanCsv === "string" && masukan.bacaanCsv.trim() !== "");

  if (adaBacaanCsv) {
    const tabel = bacaTabel(masukan.bacaanCsv ?? "", masukan.bacaanBaris);
    if (tabel.galatBentuk) tambah("bacaan", 0, "", tabel.galatBentuk);
    for (const k of KOLOM_BACAAN) {
      if (!tabel.judul.includes(k)) tambah("bacaan", 1, k, `Kolom "${k}" tidak ada di judul berkas.`);
    }
    const adaKolomWajib = KOLOM_BACAAN.every((k) => tabel.judul.includes(k));
    if (adaKolomWajib) {
      const idx = Object.fromEntries(KOLOM_BACAAN.map((k) => [k, tabel.judul.indexOf(k)])) as Record<
        (typeof KOLOM_BACAAN)[number],
        number
      >;
      if (tabel.data.length > BATAS_SOAL_IMPOR) {
        tambah("bacaan", 0, "", `Bacaan terlalu banyak (maks. ${BATAS_SOAL_IMPOR} per unggahan).`);
      }
      for (const { baris, sel } of tabel.data) {
        const kodeAsli = bersih(sel[idx.kode_bacaan]);
        const kode = kodeAsli.toLocaleLowerCase("id-ID");
        if (sel.length > tabel.judul.length) {
          tambah("bacaan", baris, "", "Kolom lebih banyak dari judul — apit teks yang memuat koma/titik koma dengan tanda kutip.");
        }
        if (!kode) tambah("bacaan", baris, "kode_bacaan", "Kode bacaan belum diisi.");
        else if (petaBacaan.has(kode) || barisBacaan.has(kode)) {
          tambah("bacaan", baris, "kode_bacaan", `Kode bacaan "${kodeAsli}" dipakai lebih dari sekali (baris ${barisBacaan.get(kode)}).`);
          bacaanBermasalah.add(kode);
        }
        if (kode && !barisBacaan.has(kode)) barisBacaan.set(kode, baris);

        const subtes = petaSubtes.get(rapikanNama(sel[idx.subtes] ?? ""));
        if (!subtes) tambah("bacaan", baris, "subtes", `Subtes "${bersih(sel[idx.subtes])}" tidak dikenal.`);
        else if (!isSubtesSnbt(subtes.kategori)) tambah("bacaan", baris, "subtes", `Subtes "${subtes.nama}" bukan subtes SNBT.`);

        const teks = sel[idx.teks] ?? "";
        const sumber = bersih(sel[idx.sumber_rujukan]) || SUMBER_BAWAAN;
        if (adaGambar(teks) || KOLOM_GAMBAR.some((g) => tabel.judul.includes(g) && bersih(sel[tabel.judul.indexOf(g)]) !== "")) {
          tambah("bacaan", baris, "teks", "Gambar belum didukung. Hapus gambarnya atau tulis ulang sebagai teks/tabel.");
        }

        const input = {
          subtes_kategori: subtes?.kategori,
          judul_internal: kode ? cuplik(`${kodeAsli} — ${teks}`, 100) : "",
          konten: { v: 1, blok: [{ jenis: "teks", teks }] },
          sumber_rujukan: sumber,
        };
        const errors: ErrorValidasi[] = [...validasiStimulus(input, "ajukan"), ...validasiRumusStimulus(input)];
        for (const er of errors) {
          if (er.field === "judul_internal" && !kode) continue;
          tambah("bacaan", baris, kolomDariFieldBacaan(er.field), er.pesan);
        }

        if (semua.some((g) => g.berkas === "bacaan" && g.baris === baris && g.tingkat === "galat")) {
          if (kode) bacaanBermasalah.add(kode);
        } else if (subtes && kode) {
          petaBacaan.set(kode, { subtesId: subtes.id });
          stimulus.push({
            kode,
            subtes_id: subtes.id,
            judul_internal: input.judul_internal,
            konten: { v: 1, blok: [{ jenis: "teks", teks }] },
            sumber_rujukan: sumber,
          });
        }
      }
    }
  }

  // ---- soal.csv ----
  const pratinjau: BarisPratinjau[] = [];
  const soal: SoalSiap[] = [];
  const tabel = bacaTabel(masukan.soalCsv ?? "", masukan.soalBaris);
  if (tabel.galatBentuk) tambah("soal", 0, "", tabel.galatBentuk);

  let kolomLengkap = tabel.galatBentuk === null;
  for (const k of KOLOM_SOAL_WAJIB) {
    if (kolomLengkap && !tabel.judul.includes(k)) {
      tambah("soal", 1, k, `Kolom "${k}" tidak ada di judul berkas.`);
    }
  }
  kolomLengkap = kolomLengkap && KOLOM_SOAL_WAJIB.every((k) => tabel.judul.includes(k));
  if (kolomLengkap) {
    for (const k of tabel.judul) {
      if (k && !(KOLOM_SOAL as readonly string[]).includes(k) && !KOLOM_GAMBAR.includes(k)) {
        tambah("soal", 1, k, `Kolom "${k}" tidak dikenal dan diabaikan.`, "peringatan");
      }
    }
  }
  if (kolomLengkap && tabel.data.length === 0) tambah("soal", 0, "", "Tidak ada baris soal di berkas.");
  if (tabel.data.length > BATAS_SOAL_IMPOR) {
    tambah("soal", 0, "", `Terlalu banyak soal: ${tabel.data.length}. Maksimal ${BATAS_SOAL_IMPOR} soal per unggahan — pecah berkasnya.`);
  }

  if (kolomLengkap) {
    const kol = (sel: string[], nama: string): string => {
      const i = tabel.judul.indexOf(nama);
      return i < 0 ? "" : (sel[i] ?? "");
    };
    const kunciDuplikat = new Map<string, number>();
    const urutanDipakai = new Map<string, Set<number>>();
    const urutanOtomatis = new Map<string, number>();

    for (const { baris, sel } of tabel.data) {
      const g = (kolom: string, pesan: string, tingkat: TingkatGalat = "galat") => tambah("soal", baris, kolom, pesan, tingkat);

      if (sel.length > tabel.judul.length) {
        g("", "Kolom lebih banyak dari judul — apit teks yang memuat koma/titik koma dengan tanda kutip.");
      }
      const subtesAsli = bersih(kol(sel, "subtes"));
      const subtes = petaSubtes.get(rapikanNama(subtesAsli));
      if (!subtesAsli) g("subtes", "Subtes belum diisi.");
      else if (!subtes) g("subtes", `Subtes "${subtesAsli}" tidak dikenal.`);
      else if (!isSubtesSnbt(subtes.kategori)) g("subtes", `Subtes "${subtes.nama}" bukan subtes SNBT.`);

      let topikId: string | null = null;
      const topikAsli = bersih(kol(sel, "topik"));
      if (topikAsli) {
        const t = subtes ? petaTopik.get(`${subtes.id}|${rapikanNama(topikAsli)}`) : undefined;
        if (t) topikId = t.id;
        else if (subtes) g("topik", `Topik "${topikAsli}" tidak ada untuk subtes ${subtes.nama}.`);
      }

      const tipe = bersih(kol(sel, "tipe")).toLowerCase();
      if (!tipe) g("tipe", "Tipe soal belum diisi (pilihan_ganda atau isian).");
      else if (tipe === "majemuk_kompleks") g("tipe", "Tipe majemuk_kompleks belum didukung lewat unggahan. Buat lewat Studio Soal.");
      else if (!(TIPE_IMPOR as readonly string[]).includes(tipe)) g("tipe", `Tipe "${tipe}" tidak dikenal (pilihan_ganda atau isian).`);

      // Gambar: kolom gambar berisi, atau penanda gambar di teks mana pun.
      const kolomTeks = ["redaksi", "opsi_a", "opsi_b", "opsi_c", "opsi_d", "opsi_e", "pembahasan"];
      if (
        kolomTeks.some((k) => adaGambar(kol(sel, k))) ||
        KOLOM_GAMBAR.some((k) => tabel.judul.includes(k) && bersih(kol(sel, k)) !== "")
      ) {
        g("redaksi", "Gambar belum didukung. Hapus gambarnya atau tulis ulang sebagai teks/rumus.");
      }

      const redaksiAsli = kol(sel, "redaksi");
      let redaksi = redaksiAsli;
      const kunciMentah = bersih(kol(sel, "kunci"));
      let konten: Record<string, unknown> = { v: 1 };
      let kunci: Record<string, unknown> = { v: 1 };

      if (tipe === "pilihan_ganda") {
        konten = { v: 1, opsi: LABEL_OPSI.map((label, i) => ({ label, teks: kol(sel, `opsi_${"abcde"[i]}`) })) };
        const huruf = kunciMentah.toUpperCase();
        if (!kunciMentah) g("kunci", "Kunci belum diisi (huruf A sampai E).");
        else if (!(LABEL_OPSI as readonly string[]).includes(huruf)) g("kunci", `Kunci "${kunciMentah}" harus satu huruf A sampai E.`);
        kunci = { v: 1, opsi: huruf };
      } else if (tipe === "isian") {
        const diterima = kunciMentah
          .split("|")
          .map((x) => x.trim())
          .filter((x) => x !== "");
        if (diterima.length === 0) g("kunci", "Jawaban belum diisi (pisahkan beberapa jawaban dengan |).");
        const penanda = [...redaksiAsli.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[1]);
        if (penanda.length === 0 && redaksiAsli.trim() !== "") redaksi = `${redaksiAsli.trimEnd()} {{r1}}`;
        else if (penanda.length > 1 || penanda[0] !== "r1") {
          g("redaksi", "Isian lewat unggahan hanya satu kotak jawaban: pakai {{r1}} sekali, atau kosongkan agar ditambahkan di akhir soal.");
        }
        const jenis = diterima.length > 0 && diterima.every((x) => parseAngka(x) !== null) ? "angka" : "teks";
        konten = { v: 1, rumpang: [{ id: "r1", jenis }] };
        kunci = { v: 1, rumpang: { r1: { diterima } } };
      }

      const kesulitan = (bersih(kol(sel, "kesulitan")) || "sedang").toLowerCase();
      if (!(TINGKAT_KESULITAN as readonly string[]).includes(kesulitan)) {
        g("kesulitan", `Kesulitan "${bersih(kol(sel, "kesulitan"))}" tidak dikenal (mudah, sedang, atau hots).`);
      }
      const levelMentah = bersih(kol(sel, "level_kognitif"));
      const level = levelMentah === "" ? null : bulat(levelMentah, BATAS.levelKognitifMin, BATAS.levelKognitifMaks);
      if (levelMentah !== "" && level === null) g("level_kognitif", "Level kognitif harus 1, 2, atau 3.");
      const estMentah = bersih(kol(sel, "estimasi_detik"));
      const estimasi = estMentah === "" ? null : bulat(estMentah, BATAS.estimasiDetikMin, BATAS.estimasiDetikMaks);
      if (estMentah !== "" && estimasi === null) {
        g("estimasi_detik", `Perkiraan waktu harus angka bulat ${BATAS.estimasiDetikMin}–${BATAS.estimasiDetikMaks} detik.`);
      }
      const sumberRujukan = bersih(kol(sel, "sumber_rujukan")) || SUMBER_BAWAAN;

      // Bacaan.
      const kodeAsli = bersih(kol(sel, "kode_bacaan"));
      const kode = kodeAsli.toLocaleLowerCase("id-ID");
      let urutan: number | null = null;
      const urutanMentah = bersih(kol(sel, "urutan_dalam_bacaan"));
      if (kode) {
        if (!adaBacaanCsv) g("kode_bacaan", `Kode bacaan "${kodeAsli}" dipakai tetapi bacaan.csv tidak diunggah.`);
        else if (!barisBacaan.has(kode)) g("kode_bacaan", `Kode bacaan "${kodeAsli}" tidak ada di bacaan.csv.`);
        else if (bacaanBermasalah.has(kode)) g("kode_bacaan", `Bacaan "${kodeAsli}" (baris ${barisBacaan.get(kode)} di bacaan.csv) masih bermasalah.`);
        else {
          const b = petaBacaan.get(kode);
          if (b && subtes && b.subtesId !== subtes.id) g("kode_bacaan", `Subtes soal berbeda dengan subtes bacaan "${kodeAsli}".`);
        }
        const dipakai = urutanDipakai.get(kode) ?? new Set<number>();
        if (urutanMentah !== "") {
          urutan = bulat(urutanMentah, 1, 50);
          if (urutan === null) g("urutan_dalam_bacaan", "Urutan dalam bacaan harus angka 1–50.");
          else if (dipakai.has(urutan)) g("urutan_dalam_bacaan", `Urutan ${urutan} sudah dipakai soal lain di bacaan "${kodeAsli}".`);
        } else {
          let n = urutanOtomatis.get(kode) ?? 0;
          do n += 1;
          while (dipakai.has(n));
          urutanOtomatis.set(kode, n);
          urutan = n <= 50 ? n : null;
          if (urutan === null) g("urutan_dalam_bacaan", "Satu bacaan maksimal 50 soal.");
        }
        if (urutan !== null) dipakai.add(urutan);
        urutanDipakai.set(kode, dipakai);
      } else if (urutanMentah !== "") {
        g("urutan_dalam_bacaan", "Urutan diabaikan karena kode_bacaan kosong.", "peringatan");
      }

      // Validator Studio Soal yang sama dengan form mentor.
      if ((TIPE_IMPOR as readonly string[]).includes(tipe)) {
        const input = {
          subtes_kategori: subtes?.kategori,
          tipe,
          redaksi,
          konten,
          kunci,
          pembahasan: kol(sel, "pembahasan"),
          tingkat_kesulitan: kesulitan,
          level_kognitif: level,
          estimasi_waktu_detik: estimasi,
          sumber_rujukan: sumberRujukan,
          stimulus_id: kode ? "x" : null,
          urutan_dalam_stimulus: kode ? urutan : null,
        };
        const kolomSudahGalat = new Set(
          semua.filter((x) => x.berkas === "soal" && x.baris === baris && x.tingkat === "galat").map((x) => x.kolom),
        );
        for (const er of [...validasiSoal(input, "ajukan"), ...validasiRumusSoal(input)]) {
          const kolom = kolomDariField(er.field, tipe);
          if (!kolomSudahGalat.has(kolom)) g(kolom, er.pesan);
        }
      }

      // Duplikat = peringatan.
      const kunciRedaksi = normalisasiTeks(redaksiAsli);
      if (panjangTrim(redaksiAsli) > 0) {
        const sebelumnya = kunciDuplikat.get(kunciRedaksi);
        if (sebelumnya !== undefined) g("redaksi", `Redaksi sama dengan soal di baris ${sebelumnya}.`, "peringatan");
        else kunciDuplikat.set(kunciRedaksi, baris);
        if (redaksiBank.has(kunciRedaksi)) g("redaksi", "Soal dengan redaksi yang sama sudah ada di bank soal.", "peringatan");
      }

      const barisIni = semua.filter((x) => x.berkas === "soal" && x.baris === baris);
      const adaGalat = barisIni.some((x) => x.tingkat === "galat");
      const status: StatusBaris = adaGalat ? "galat" : barisIni.length > 0 ? "peringatan" : "ok";
      pratinjau.push({
        baris,
        subtes: subtes?.nama ?? subtesAsli,
        tipe,
        redaksi: cuplik(redaksiAsli),
        kunci: tipe === "isian" ? kunciMentah : kunciMentah.toUpperCase(),
        kodeBacaan: kodeAsli,
        status,
      });

      if (!adaGalat && subtes && (tipe === "pilihan_ganda" || tipe === "isian")) {
        soal.push({
          subtes_id: subtes.id,
          topik_id: topikId,
          stimulus_kode: kode || null,
          urutan_dalam_stimulus: kode ? urutan : null,
          tipe,
          redaksi,
          konten,
          kunci,
          pembahasan: kol(sel, "pembahasan"),
          sumber_rujukan: sumberRujukan,
          tingkat_kesulitan: kesulitan,
          level_kognitif: level,
          estimasi_waktu_detik: estimasi,
        });
      }
    }

    // Bacaan yang tidak dipakai soal mana pun yang lolos tidak disimpan.
    for (const [kode, baris] of barisBacaan) {
      if (!bacaanBermasalah.has(kode) && !soal.some((s) => s.stimulus_kode === kode)) {
        tambah("bacaan", baris, "kode_bacaan", `Bacaan "${kode}" tidak dipakai soal yang lolos, jadi tidak disimpan.`, "peringatan");
      }
    }
  }

  const stimulusDipakai = stimulus.filter((s) => soal.some((x) => x.stimulus_kode === s.kode));
  const galat = semua.filter((x) => x.tingkat === "galat");
  const peringatan = semua.filter((x) => x.tingkat === "peringatan");
  return {
    galat,
    peringatan,
    pratinjau,
    stimulus: stimulusDipakai,
    soal,
    ringkasan: {
      jumlahBaris: pratinjau.length,
      jumlahOk: soal.length,
      jumlahGalat: pratinjau.filter((p) => p.status === "galat").length,
      jumlahPeringatan: pratinjau.filter((p) => p.status === "peringatan").length,
      jumlahBacaan: stimulusDipakai.length,
    },
  };
}

/**
 * Boleh simpan? Tanpa galat sama sekali, atau (opsi eksplisit) hanya baris
 * lolos bila `lewatiGalat`. Galat tingkat berkas selalu memblokir. Server memakai
 * fungsi ini; tombol di layar hanya mencerminkannya.
 */
export function bisaSimpan(h: HasilImpor, lewatiGalat = false): { ok: true } | { ok: false; alasan: string } {
  if (h.galat.some((g) => g.baris === 0 || (g.baris === 1 && g.kolom !== ""))) {
    return { ok: false, alasan: "Ada masalah di tingkat berkas (judul kolom atau jumlah baris). Perbaiki dulu berkasnya." };
  }
  if (h.soal.length === 0) return { ok: false, alasan: "Tidak ada soal yang lolos untuk disimpan." };
  if (h.galat.length > 0 && !lewatiGalat) {
    return { ok: false, alasan: "Masih ada baris galat. Perbaiki berkasnya, atau pilih lewati baris galat." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

const BARIS_SOAL_CONTOH: string[][] = [
  [
    "Penalaran Umum", "", "pilihan_ganda",
    "Jika \\(x^2 = 9\\) dan \\(x > 0\\), berapakah nilai \\(x + 1\\)?",
    "2", "3", "4", "5", "6", "C",
    "Dari \\(x^2 = 9\\) dan \\(x > 0\\) diperoleh \\(x = 3\\), sehingga \\(x + 1 = 4\\).",
    "mudah", "2", "60", SUMBER_BAWAAN, "", "",
  ],
  [
    "Penalaran Umum", "", "pilihan_ganda",
    "Berdasarkan bacaan, apa gagasan utama paragraf tersebut?",
    "Hujan turun setiap hari", "Kota sering banjir", "Petani butuh air", "Cuaca tidak menentu", "Musim kemarau panjang", "B",
    "Paragraf membahas banjir yang sering terjadi di kota sehingga gagasan utamanya adalah pilihan B.",
    "sedang", "1", "90", SUMBER_BAWAAN, "B1", "1",
  ],
];
const BARIS_BACAAN_CONTOH: string[][] = [
  [
    "B1", "Penalaran Umum",
    "Banjir kembali merendam sejumlah kawasan kota setelah hujan deras semalam. Warga menyebut genangan makin sering terjadi, bahkan ketika hujan hanya turun sebentar.",
    SUMBER_BAWAAN,
  ],
];

/** Template v1: soal.csv + bacaan.csv (BOM UTF-8, siap dibuka di Excel). */
export function buatTemplateCsv(): { soal: string; bacaan: string } {
  return {
    soal: buatCsv([...KOLOM_SOAL], BARIS_SOAL_CONTOH),
    bacaan: buatCsv([...KOLOM_BACAAN], BARIS_BACAAN_CONTOH),
  };
}
