/**
 * Test tampilan baris "Kelas Terdaftar" (Dashboard Mentor & Siswa): nama kelas + jadwal dua kolom sama lebar
 * (komponen bersama IsiBarisDuaKolom di dalam BarisKlik). Tanpa browser: komponen DIRENDER sungguhan di proses
 * terpisah (react-dom/server menolak kondisi "react-server" runner tes — pola sama dengan
 * tests/badge-kapasitas.test.ts), lalu markup + kelas diperiksa. Memastikan: teks nama & jadwal utuh di DOM
 * (tidak dipotong lewat kode), title = nama lengkap, tetap <a href> ke tujuan yang sama, jadwal kosong aman.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatJadwal } from "@/lib/shared/formatJadwal";
import { hrefKelasMentor } from "@/lib/shared/dashboardLinks";

const ID = "3f2b8c1e-9a47-4d6b-8e21-5c7a0d9b1f34";

function renderBaris(props: { href: string | null; kiri: string; kanan: string; kananClass?: string }): string {
  const kode = `
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const unwrap = (m) => (typeof m.default === "function" ? m.default : m.default.default);
    const Baris = unwrap(await import("./components/dashboard/BarisKlik.tsx"));
    const Isi = unwrap(await import("./components/dashboard/IsiBarisDuaKolom.tsx"));
    const p = JSON.parse(process.argv[1]);
    const isi = React.createElement(Isi, { kiri: p.kiri, kanan: p.kanan, ...(p.kananClass ? { kananClass: p.kananClass } : {}) });
    process.stdout.write(renderToStaticMarkup(React.createElement(Baris, { href: p.href ?? undefined, className: "-mx-2 px-2 py-2.5 sm:py-3" }, isi)));
  `;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode, JSON.stringify(props)], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
}

const jadwalPanjang = formatJadwal([
  { hari: "Senin", jam_mulai: "17:00" },
  { hari: "Rabu", jam_mulai: "16:30" },
  { hari: "Jumat", jam_mulai: "19:00" },
]);
const NAMA = "[UJI] Multi Mentor";

describe("IsiBarisDuaKolom di dalam BarisKlik", () => {
  it("nama kelas dan jadwal dirender PENUH di DOM (tidak dipotong lewat kode)", () => {
    const html = renderBaris({ href: hrefKelasMentor(ID), kiri: NAMA, kanan: jadwalPanjang });
    assert.ok(html.includes(NAMA));
    assert.ok(html.includes(jadwalPanjang.replaceAll("&", "&amp;")), html);
    assert.ok(!html.includes("…") && !html.includes("..."), "tidak ada pemotongan di kode");
  });

  it("atribut title berisi nama kelas lengkap, termasuk nama sangat panjang", () => {
    const panjang = `[UJI] ${"Kelas Intensif Persiapan SNBT ".repeat(8).trim()}`;
    const html = renderBaris({ href: hrefKelasMentor(ID), kiri: panjang, kanan: "Senin, 17:00 WIB" });
    assert.ok(html.includes(`title="${panjang}"`));
    assert.ok(html.includes(`>${panjang}</p>`), "teks lengkap tetap di DOM; pemotongan hanya lewat CSS");
  });

  it("tetap satu <a> ke tujuan yang sama (seluruh baris area klik)", () => {
    const html = renderBaris({ href: hrefKelasMentor(ID), kiri: NAMA, kanan: jadwalPanjang });
    assert.match(html, /^<a /);
    assert.equal((html.match(/<a /g) ?? []).length, 1);
    assert.ok(html.includes(`href="/kelas-saya/${ID}"`));
    assert.ok(html.includes("cursor-pointer") && html.includes("hover:bg-[#F3F4FF]"));
    assert.ok(html.includes("py-2.5 sm:py-3"));
  });

  it("tanpa tujuan tetap dirender (bukan link)", () => {
    const html = renderBaris({ href: null, kiri: NAMA, kanan: "Senin, 17:00 WIB" });
    assert.ok(!html.includes("<a ") && !html.includes("href="));
    assert.ok(html.includes(NAMA));
  });

  it("jadwal kosong tetap dirender tanpa galat (placeholder dari helper, atau teks kosong)", () => {
    const placeholder = formatJadwal(null);
    assert.equal(placeholder, "Jadwal belum diatur");
    assert.ok(renderBaris({ href: hrefKelasMentor(ID), kiri: NAMA, kanan: placeholder }).includes(placeholder));
    const kosong = renderBaris({ href: hrefKelasMentor(ID), kiri: NAMA, kanan: "" });
    assert.ok(kosong.includes(NAMA));
  });

  it("tata letak: dua kolom minmax(0,1fr) di >=480px, ditumpuk di bawahnya; nama line-clamp-2; jadwal rata kanan", () => {
    const html = renderBaris({ href: hrefKelasMentor(ID), kiri: NAMA, kanan: jadwalPanjang });
    assert.ok(html.includes("grid-cols-1"), "tumpuk di layar sempit");
    assert.ok(html.includes("min-[480px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"));
    assert.ok(html.includes("line-clamp-2"));
    assert.ok(html.includes("min-[480px]:text-right") && html.includes("text-left"));
    assert.ok(html.includes("break-words") && html.includes("min-w-0"));
    assert.ok(!html.includes("truncate"), "tidak lagi satu baris + titik-titik");
    assert.ok(!html.includes("shrink-0"), "jadwal tidak lagi menghabiskan lebar baris");
  });

  it("warna & ukuran font tidak berubah (nama hitam, jadwal abu-abu, text-base); warna kanan bisa diganti", () => {
    const html = renderBaris({ href: null, kiri: NAMA, kanan: "x" });
    assert.ok(html.includes("text-base text-black"));
    assert.ok(html.includes("text-[#7E7C7C]"));
    assert.ok(renderBaris({ href: null, kiri: NAMA, kanan: "x", kananClass: "text-[#E70A0A]" }).includes("text-[#E70A0A]"));
  });
});

describe("dashboard memakai komponen bersama untuk Kelas Terdaftar (tidak menyalin gaya)", () => {
  const mentor = readFileSync("components/dashboard/MentorDashboardOverview.tsx", "utf8");
  const siswa = readFileSync("components/dashboard/DashboardOverview.tsx", "utf8");

  it("mentor: baris Kelas Terdaftar = BarisKlik + IsiBarisDuaKolom, isi jadwal tetap formatJadwal(k.jadwal)", () => {
    assert.ok(mentor.includes('import IsiBarisDuaKolom from "@/components/dashboard/IsiBarisDuaKolom"'));
    assert.ok(mentor.includes("<IsiBarisDuaKolom kiri={k.nama} kanan={formatJadwal(k.jadwal)} />"));
    assert.ok(mentor.includes("href={hrefKelasMentor(k.id)}"));
  });

  it("siswa: ListCard punya mode duaKolom dan hanya Kelas Terdaftar yang memakainya", () => {
    assert.ok(siswa.includes("<IsiBarisDuaKolom"));
    const blok = siswa.slice(siswa.indexOf('title="Kelas Terdaftar"'), siswa.indexOf('title="Info Beasiswa & Event"'));
    assert.ok(/\bduaKolom\b/.test(blok));
    assert.ok(blok.includes("hrefKelasSiswa(k.kelasId)"));
    assert.ok(!/duaKolom/.test(siswa.slice(siswa.indexOf('title="Info Beasiswa & Event"'))));
  });
});
