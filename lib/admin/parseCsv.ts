/**
 * Parser CSV minimal (RFC4180-ish) — dependency-free karena cuma dipakai satu
 * fitur (Import CSV Kelola Assessment). Dukung field ber-quote (","), quote
 * ter-escape (""), dan newline di dalam field yang di-quote.
 */
export type PemisahCsv = "," | ";";

/** Pilih pemisah dari baris judul: ";" hanya bila lebih banyak daripada ",". */
export function deteksiPemisahCsv(text: string): PemisahCsv {
  const tanpaBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const baris = tanpaBom.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const koma = (baris.match(/,/g) ?? []).length;
  const titikKoma = (baris.match(/;/g) ?? []).length;
  return titikKoma > koma ? ";" : ",";
}

/**
 * `pemisah` bawaan "," (perilaku lama tidak berubah). BOM UTF-8 di awal berkas
 * dibuang. Impor Studio Soal memakai deteksiPemisahCsv() karena Excel berlokal
 * Indonesia menyimpan CSV dengan ";".
 */
export function parseCsv(text: string, pemisah: PemisahCsv = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const tanpaBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const normalized = tanpaBom.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < normalized.length) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === pemisah) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}
