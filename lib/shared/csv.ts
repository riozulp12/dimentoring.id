/**
 * Pembuat CSV yang aman dibuka di Excel/Google Sheets.
 *
 * Anti CSV/formula injection: sel yang diawali = + - @ (atau tab/CR, yang
 * juga bisa memicu rumus) diberi awalan tanda kutip tunggal supaya
 * dianggap teks, bukan rumus. Semua sel dibungkus tanda kutip ganda.
 */

const AWALAN_RUMUS = /^[=+\-@\t\r]/;

export function selCsvAman(value: unknown): string {
  let teks = value === null || value === undefined ? "" : String(value);
  if (AWALAN_RUMUS.test(teks)) teks = `'${teks}`;
  return `"${teks.replace(/"/g, '""')}"`;
}

/** Baris pertama = header. BOM di depan supaya Excel membaca UTF-8 dengan benar. */
export function buatCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((row) => row.map(selCsvAman).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
