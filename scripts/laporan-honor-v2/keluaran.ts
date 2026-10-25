/**
 * Laporan Honor v2 — format CSV & penulisan file. --dry-run TIDAK menulis apa
 * pun (tidak membuat folder juga); --out wajib di luar folder repo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";

export type Sel = string | number | null | undefined;

function selCsv(v: Sel): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV dengan BOM UTF-8 supaya Excel membaca huruf dengan benar. */
export function keCsv(header: string[], rows: Sel[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(selCsv).join(",")).join("\r\n") + "\r\n";
}

/** true bila `target` berada di dalam (atau sama dengan) `repoRoot`. */
export function diDalamRepo(target: string, repoRoot: string): boolean {
  const rel = relative(resolve(repoRoot), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export interface HasilTulis {
  ditulis: string[];
  dilewati: string[];
}

/** Tulis semua file ke `outDir`. dryRun = tidak menyentuh disk sama sekali. */
export function tulisKeluaran(outDir: string, files: Record<string, string>, dryRun: boolean): HasilTulis {
  const nama = Object.keys(files).map((n) => join(outDir, n));
  if (dryRun) return { ditulis: [], dilewati: nama };
  mkdirSync(outDir, { recursive: true });
  for (const [n, isi] of Object.entries(files)) writeFileSync(join(outDir, n), isi, "utf8");
  return { ditulis: nama, dilewati: [] };
}
