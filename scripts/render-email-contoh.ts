/**
 * Pratinjau template email — TIDAK mengirim email apa pun, tidak butuh env.
 *
 *   npx tsx scripts/render-email-contoh.ts              # gambar dari public/ lokal (langsung tampil)
 *   npx tsx scripts/render-email-contoh.ts --produksi   # gambar dari https://dimentoring.id (tampil setelah aset ter-deploy)
 *
 * Menulis ke .tmp/email-preview/ (di-.gitignore): <event>.html, <event>.txt, dan
 * index.html berisi daftar semua event. Buka index.html di browser. Data contoh
 * fiktif, ada di lib/email/contohEmail.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { CONTOH_EVENT_EMAIL } from "../lib/email/contohEmail";
import { escapeHtml } from "../lib/email/layoutEmail";

const pakaiProduksi = process.argv.includes("--produksi");
const asetBaseUrl = pakaiProduksi ? undefined : pathToFileURL(resolve(process.cwd(), "public")).href;

const keluar = resolve(process.cwd(), ".tmp", "email-preview");
mkdirSync(keluar, { recursive: true });

const baris: string[] = [];
for (const event of CONTOH_EVENT_EMAIL) {
  const hasil = event.buat({ asetBaseUrl });
  writeFileSync(join(keluar, `${event.kunci}.html`), hasil.html, "utf8");
  writeFileSync(join(keluar, `${event.kunci}.txt`), `Subjek: ${hasil.subjek}\n\n${hasil.teks}\n`, "utf8");
  baris.push(
    `<li><a href="${event.kunci}.html">${escapeHtml(event.judul)}</a> &middot; <a href="${event.kunci}.txt">teks biasa</a><br><small>Subjek: ${escapeHtml(hasil.subjek)}</small></li>`,
  );
  console.log(`${event.kunci}: ${hasil.html.length} karakter HTML, subjek "${hasil.subjek}"`);
}

writeFileSync(
  join(keluar, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Pratinjau email Dimentoring</title><body style="font-family:Arial,sans-serif;max-width:640px;margin:32px auto;line-height:1.7"><h1>Pratinjau email</h1><ul>${baris.join("")}</ul></body>`,
  "utf8",
);
console.log(`\nSelesai: ${join(keluar, "index.html")} (gambar dari ${pakaiProduksi ? "https://dimentoring.id" : "public/ lokal"})`);
