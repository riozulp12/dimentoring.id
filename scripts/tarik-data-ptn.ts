/**
 * Tarik data Daya Tampung & Peminat SNBP/SNBT dari sidatagrun (SNPMB) untuk
 * daftar PTN di scripts/data/*.xlsx, lalu tulis ke CSV siap-review dengan
 * format kolom yang sama dengan fitur Import CSV di Kelola Assessment (lihat
 * app/api/kelola-assessment/import-csv/route.ts).
 *
 * SCRIPT INI TERPISAH DARI APLIKASI — dijalankan MANUAL dari terminal:
 *   npm run tarik-ptn              (PTN Jawa)
 *   npm run tarik-ptn:luar-jawa    (PTN luar Jawa)
 * BUKAN cron job, BUKAN dipanggil oleh aplikasi Dimentoring dengan cara apa pun.
 *
 * Kolom "rumpun" sengaja dikosongkan di CSV output — diisi manual oleh Admin
 * lewat dropdown Excel setelah semua PTN selesai ditarik (nama prodi bisa
 * ambigu, butuh penilaian manusia, jangan ditebak otomatis).
 *
 * Endpoint sumber (sidatagrun) bukan API resmi terdokumentasi untuk dipanggil
 * program, jadi diperlakukan sopan: jeda 3-4 detik antar tiap request, dan
 * maksimal 5 PTN diproses per sesi jalan. Progress disimpan ke
 * scripts/progress-ptn*.json supaya sesi berikutnya lanjut, bukan mulai ulang.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { Workbook } from "exceljs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RegionConfig {
  excelPath: string;
  sheetName: string;
  progressPath: string;
  outputCsvPath: string;
}

const REGIONS: Record<string, RegionConfig> = {
  jawa: {
    excelPath: path.join(__dirname, "data", "Data_PTN_Jawa_Terverifikasi.xlsx"),
    sheetName: "Daftar ID PTN Jawa",
    progressPath: path.join(__dirname, "progress-ptn.json"),
    outputCsvPath: path.join(__dirname, "hasil-tarik-ptn.csv"),
  },
  "luar-jawa": {
    excelPath: path.join(__dirname, "data", "Data_PTN_LuarJawa.xlsx"),
    sheetName: "Daftar ID PTN Luar Jawa",
    progressPath: path.join(__dirname, "progress-ptn-luar-jawa.json"),
    outputCsvPath: path.join(__dirname, "hasil-tarik-ptn-luar-jawa.csv"),
  },
};

const regionArg = process.argv[2] ?? "jawa";
const region = REGIONS[regionArg];
if (!region) {
  console.error(`Region "${regionArg}" tidak dikenal. Pilihan: ${Object.keys(REGIONS).join(", ")}`);
  process.exit(1);
}
const { excelPath: EXCEL_PATH, sheetName: SHEET_NAME, progressPath: PROGRESS_PATH, outputCsvPath: OUTPUT_CSV_PATH } = region;

const BATCH_SIZE = 5;
const DELAY_MIN_MS = 3000;
const DELAY_MAX_MS = 4000;
const TAHUN_DATA = 2026;
const SUMBER_DATA = "sidatagrun_snpmb_resmi_2026";

const CSV_HEADER = [
  "nama_universitas",
  "nama_jurusan",
  "rumpun",
  "jenjang",
  "provinsi",
  "kuota_tahun_berjalan",
  "jumlah_peminat_tahun_lalu",
  "jalur",
  "tahun_data",
  "rata_rata_nilai_diterima",
  "sumber_data",
] as const;

type Jalur = "snbp" | "snbt";
type CsvRow = (string | number)[];

interface PtnEntry {
  id: string;
  namaUniversitas: string;
  provinsi: string;
  urlSnbp: string;
}

interface Progress {
  completedIds: string[];
  updatedAt: string;
}

interface ParsedRow {
  nama: string;
  jenjangRaw: string;
  dayaTampungRaw: string;
  peminatRaw: string;
}

// Mapping teks jenjang di sidatagrun -> enum jenjang_prodi ('S1'/'D3'/'D4').
// Kalau ada teks jenjang baru yang tidak ada di sini, baris DI-SKIP (bukan
// ditebak) dan dicatat di ringkasan supaya Admin bisa cek manual.
const JENJANG_MAP: Record<string, string> = {
  sarjana: "S1",
  "sarjana terapan": "D4",
  "diploma tiga": "D3",
  "diploma empat": "D4",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(): number {
  return DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
}

async function loadPtnList(): Promise<PtnEntry[]> {
  if (!existsSync(EXCEL_PATH)) {
    throw new Error(`File Excel tidak ditemukan: ${EXCEL_PATH}`);
  }
  const workbook = new Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" tidak ditemukan di ${EXCEL_PATH}`);
  }

  const entries: PtnEntry[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const id = String(row.getCell(1).text ?? "").trim();
    const namaUniversitas = String(row.getCell(2).text ?? "").trim();
    const provinsi = String(row.getCell(3).text ?? "").trim();
    const urlSnbp = String(row.getCell(4).text ?? "").trim();
    if (!id || !urlSnbp) return;
    entries.push({ id, namaUniversitas, provinsi, urlSnbp });
  });
  return entries;
}

function loadProgress(): Progress {
  if (!existsSync(PROGRESS_PATH)) {
    return { completedIds: [], updatedAt: new Date().toISOString() };
  }
  try {
    const raw = readFileSync(PROGRESS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      completedIds: Array.isArray(parsed.completedIds) ? parsed.completedIds.map(String) : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[progress] Gagal baca ${PROGRESS_PATH}, anggap belum ada progress. Error:`, err);
    return { completedIds: [], updatedAt: new Date().toISOString() };
  }
}

function saveProgress(progress: Progress): void {
  writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), "utf8");
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function ensureCsvHeader(): void {
  if (!existsSync(OUTPUT_CSV_PATH)) {
    writeFileSync(OUTPUT_CSV_PATH, CSV_HEADER.join(",") + "\n", "utf8");
  }
}

function appendCsvRows(rows: CsvRow[]): void {
  if (rows.length === 0) return;
  const text = rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
  appendFileSync(OUTPUT_CSV_PATH, text, "utf8");
}

function mapJenjang(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  return JENJANG_MAP[key] ?? null;
}

// Kembalikan angka valid, atau null kalau kosong / "(sedang dalam proses)" /
// bukan angka bulat — baris dengan hasil null WAJIB di-skip, jangan diisi 0.
function parseCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/proses/i.test(trimmed)) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function parseTable(html: string): ParsedRow[] {
  const $ = cheerio.load(html);
  const table = $("table.table-striped").first();
  if (table.length === 0) return [];

  const headerCells = table
    .find("thead th")
    .map((_, el) => $(el).text().trim().toUpperCase())
    .get();
  const colIndex = (needle: string) => headerCells.findIndex((h) => h.includes(needle));
  const idxNama = colIndex("NAMA");
  const idxJenjang = colIndex("JENJANG");
  const idxDayaTampung = colIndex("DAYA TAMPUNG");
  const idxPeminat = colIndex("PEMINAT");

  if ([idxNama, idxJenjang, idxDayaTampung, idxPeminat].some((i) => i < 0)) {
    console.error("  [parse] Header tabel tidak sesuai ekspektasi, dilewati. Header ditemukan:", headerCells);
    return [];
  }
  const maxIdx = Math.max(idxNama, idxJenjang, idxDayaTampung, idxPeminat);

  const results: ParsedRow[] = [];
  table.find("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length <= maxIdx) return; // baris tidak lengkap (mis. pesan "tidak ada data")
    const get = (idx: number) => $(cells.get(idx)).text().trim();
    results.push({
      nama: get(idxNama),
      jenjangRaw: get(idxJenjang),
      dayaTampungRaw: get(idxDayaTampung),
      peminatRaw: get(idxPeminat),
    });
  });
  return results;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; DimentoringDataPull/1.0; manual-use-only)" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} saat fetch ${url}`);
  }
  return res.text();
}

async function fetchAndParseJalur(entry: PtnEntry, url: string, jalur: Jalur): Promise<CsvRow[]> {
  const html = await fetchHtml(url);
  const parsedRows = parseTable(html);
  const outRows: CsvRow[] = [];
  let skipped = 0;

  for (const row of parsedRows) {
    const jenjang = mapJenjang(row.jenjangRaw);
    const kuota = parseCount(row.dayaTampungRaw);
    const peminat = parseCount(row.peminatRaw);

    if (!row.nama || !jenjang || kuota === null || peminat === null) {
      skipped++;
      continue;
    }

    outRows.push([
      entry.namaUniversitas,
      row.nama,
      "", // rumpun - diisi manual Admin lewat dropdown Excel
      jenjang,
      entry.provinsi,
      kuota,
      peminat,
      jalur,
      TAHUN_DATA,
      "", // rata_rata_nilai_diterima - tidak tersedia dari sumber ini
      SUMBER_DATA,
    ]);
  }

  console.log(
    `    [${jalur.toUpperCase()}] ${outRows.length} baris valid, ${skipped} baris di-skip (data kosong/proses/jenjang tak dikenal).`
  );
  return outRows;
}

async function main(): Promise<void> {
  console.log(`Region: ${regionArg}\n`);
  const allPtn = await loadPtnList();
  if (allPtn.length === 0) {
    console.log("Tidak ada baris PTN yang bisa dibaca dari Excel. Cek isi sheet.");
    return;
  }

  const progress = loadProgress();
  const completedSet = new Set(progress.completedIds);
  const remaining = allPtn.filter((p) => !completedSet.has(p.id));

  if (remaining.length === 0) {
    console.log(`Semua ${allPtn.length} PTN sudah diproses sebelumnya. Tidak ada yang perlu dijalankan.`);
    console.log(`Hasil ada di: ${OUTPUT_CSV_PATH}`);
    return;
  }

  ensureCsvHeader();
  const batch = remaining.slice(0, BATCH_SIZE);
  console.log(
    `Sesi ini: memproses ${batch.length} PTN (${allPtn.length - remaining.length} dari ${allPtn.length} sudah selesai sebelumnya).\n`
  );

  for (let i = 0; i < batch.length; i++) {
    const entry = batch[i];
    console.log(`[${i + 1}/${batch.length} sesi ini] ${entry.namaUniversitas} (ID ${entry.id})`);

    try {
      console.log(`  Fetch SNBP: ${entry.urlSnbp}`);
      const snbpRows = await fetchAndParseJalur(entry, entry.urlSnbp, "snbp");

      const delayBeforeSnbt = randomDelayMs();
      console.log(`  Jeda ${(delayBeforeSnbt / 1000).toFixed(1)}s sebelum fetch SNBT...`);
      await sleep(delayBeforeSnbt);

      const urlSnbt = entry.urlSnbp.replace("ptn_sn.php", "ptn_sb.php");
      console.log(`  Fetch SNBT: ${urlSnbt}`);
      const snbtRows = await fetchAndParseJalur(entry, urlSnbt, "snbt");

      // Tulis ke CSV & tandai selesai hanya kalau KEDUA jalur berhasil,
      // supaya tidak ada baris parsial di CSV kalau salah satu fetch gagal.
      appendCsvRows([...snbpRows, ...snbtRows]);
      completedSet.add(entry.id);
      saveProgress({ completedIds: [...completedSet], updatedAt: new Date().toISOString() });

      const doneCount = completedSet.size;
      console.log(`  Selesai. ${doneCount} dari ${allPtn.length} PTN selesai, sisa ${allPtn.length - doneCount}.\n`);
    } catch (err) {
      console.error(`  GAGAL memproses ${entry.namaUniversitas} (ID ${entry.id}):`, err instanceof Error ? err.message : err);
      console.error("  PTN ini TIDAK ditandai selesai, akan dicoba lagi di sesi berikutnya.\n");
    }

    const isLastInBatch = i === batch.length - 1;
    if (!isLastInBatch) {
      const delayBeforeNextPtn = randomDelayMs();
      console.log(`  Jeda ${(delayBeforeNextPtn / 1000).toFixed(1)}s sebelum PTN berikutnya...\n`);
      await sleep(delayBeforeNextPtn);
    }
  }

  const finalDone = completedSet.size;
  console.log(`=== Sesi selesai: ${finalDone} dari ${allPtn.length} PTN selesai, sisa ${allPtn.length - finalDone}. ===`);
  if (finalDone < allPtn.length) {
    const cmd = regionArg === "jawa" ? "npm run tarik-ptn" : `npm run tarik-ptn:${regionArg}`;
    console.log(`Jalankan lagi \`${cmd}\` untuk melanjutkan sisa PTN.`);
  } else {
    console.log(`Semua PTN sudah diproses. Hasil ada di: ${OUTPUT_CSV_PATH}`);
    console.log('Langkah berikutnya: isi kolom "rumpun" manual lewat Excel, baru import lewat fitur Import CSV di Kelola Assessment.');
  }
}

main().catch((err) => {
  console.error("Script berhenti karena error tak terduga:", err);
  process.exit(1);
});
