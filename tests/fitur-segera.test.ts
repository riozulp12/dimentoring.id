/**
 * Test statis "Segera hadir": daftar pusat, env pembuka, halaman alert noindex,
 * rute tergembok memanggil pengecekan di server, dan tidak ada endpoint
 * API/webhook/mentor/admin yang ikut tergembok.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  DAFTAR_FITUR_SEGERA,
  PESAN_BAWAAN_SEGERA,
  fiturTerbuka,
  idDibukaLewatEnv,
  pesanFiturSegera,
} from "../lib/shared/fiturSegera";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function semuaFile(dir: string, hasil: string[] = []): string[] {
  for (const nama of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${nama}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) semuaFile(rel, hasil);
    else if (/\.(ts|tsx)$/.test(nama)) hasil.push(rel);
  }
  return hasil;
}

/** Halaman tiap fitur yang digembok. Fitur baru di daftar pusat wajib ditambah di sini. */
const HALAMAN_FITUR: Record<string, string> = {
  tryout: "app/tryout/page.tsx",
};

describe("fitur segera — daftar pusat", () => {
  it("tiap fitur punya id, judul, dan bendera aktif boolean; Try Out digembok", () => {
    for (const [id, f] of Object.entries(DAFTAR_FITUR_SEGERA)) {
      assert.equal(f.id, id);
      assert.ok(f.judul.length > 0);
      assert.equal(typeof f.aktif, "boolean");
    }
    assert.equal(DAFTAR_FITUR_SEGERA.tryout.aktif, false);
  });

  it("pesan bawaan dipakai bila fitur tidak punya pesan sendiri", () => {
    assert.equal(
      PESAN_BAWAAN_SEGERA,
      "Halaman ini sedang kami siapkan. Kami akan kabari begitu sudah bisa dipakai.",
    );
    assert.equal(pesanFiturSegera("tryout"), PESAN_BAWAAN_SEGERA);
  });

  it("setiap fitur di daftar punya halaman terdaftar di test ini", () => {
    assert.deepEqual(Object.keys(HALAMAN_FITUR).sort(), Object.keys(DAFTAR_FITUR_SEGERA).sort());
  });
});

describe("fitur segera — fiturTerbuka & env", () => {
  it("env kosong/tidak ada = ikut daftar pusat", () => {
    assert.equal(fiturTerbuka("tryout", undefined), false);
    assert.equal(fiturTerbuka("tryout", ""), false);
  });

  it("env berisi id (dipisah koma, spasi diabaikan) membuka fitur itu saja", () => {
    assert.equal(fiturTerbuka("tryout", "tryout"), true);
    assert.equal(fiturTerbuka("tryout", " asah , tryout "), true);
    assert.equal(fiturTerbuka("tryout", "asah,battle"), false);
    assert.deepEqual(idDibukaLewatEnv("a, ,b"), ["a", "b"]);
  });

  it("default membaca NEXT_PUBLIC_FITUR_SEGERA_BUKA", () => {
    const src = baca("lib/shared/fiturSegera.ts");
    assert.match(src, /process\.env\.NEXT_PUBLIC_FITUR_SEGERA_BUKA/);
  });
});

describe("fitur segera — halaman alert", () => {
  const src = baca("components/ui/HalamanSegera.tsx");

  it("server component, noindex+nofollow, pakai Mascot dan tombol ke dashboard", () => {
    assert.doesNotMatch(src, /^\s*["']use client["']/m);
    assert.match(src, /robots: \{ index: false, follow: false \}/);
    assert.match(src, /<Mascot variant=/);
    assert.match(src, /Kembali ke Dashboard/);
    assert.match(src, /href="\/dashboard\/siswa"/);
  });

  it("tanpa hex baru di komponen baru", () => {
    for (const f of ["components/ui/HalamanSegera.tsx", "components/ui/LencanaSegera.tsx"]) {
      assert.doesNotMatch(baca(f), /#[0-9A-Fa-f]{3,8}\b/, f);
    }
  });

  it("tidak ada sitemap yang perlu dibersihkan", () => {
    assert.throws(() => statSync(path.join(ROOT, "app/sitemap.ts")));
  });
});

describe("fitur segera — rute tergembok", () => {
  it("tiap halaman tergembok mengecek fiturTerbuka di server dan menampilkan alert + metadata noindex", () => {
    for (const [id, file] of Object.entries(HALAMAN_FITUR)) {
      const src = baca(file);
      assert.doesNotMatch(src, /^\s*["']use client["']/m, file);
      assert.ok(src.includes(`fiturTerbuka("${id}")`), `${file}: fiturTerbuka`);
      assert.ok(src.includes(`<HalamanSegera id="${id}" />`), `${file}: HalamanSegera`);
      assert.ok(src.includes(`metadataFiturSegera("${id}")`), `${file}: metadata`);
    }
  });

  it("menu & tautan ke fitur tergembok memakai lencana Segera hadir", () => {
    assert.match(baca("components/dashboard/sidebarMenuConfig.ts"), /href: "\/tryout", fiturId: "tryout"/);
    assert.match(baca("components/dashboard/sidebar.tsx"), /<LencanaSegera/);
    assert.match(baca("components/sections/TryoutCTA.tsx"), /<LencanaSegera \/>/);
    assert.match(baca("app/assessment/hasil/[id]/AssessmentHasilAccordions.tsx"), /<LencanaSegera \/>/);
    assert.match(baca("app/assessment/hasil/[id]/page.tsx"), /fiturTerbuka\("tryout"\)/);
  });
});

describe("fitur segera — yang TIDAK boleh digembok", () => {
  it("tidak ada route API / webhook yang memanggil fiturSegera", () => {
    const files = semuaFile("app/api");
    assert.ok(files.length > 20);
    for (const f of files) assert.doesNotMatch(baca(f), /fiturSegera|fiturTerbuka|HalamanSegera/, f);
    assert.ok(files.includes("app/api/agensoal/sso-redirect/route.ts"));
    assert.ok(files.includes("app/api/payment/webhook/mayar/route.ts"));
  });

  it("halaman mentor, admin, dan fitur live tidak memanggil pengecekan", () => {
    const dirs = [
      "app/(protected)/(mentor)",
      "app/(protected)/(admin)",
      "app/(protected)/(siswa)",
      "app/leaderboard",
      "app/program",
      "app/beasiswa-event",
    ];
    for (const d of dirs) {
      for (const f of semuaFile(d)) assert.doesNotMatch(baca(f), /fiturTerbuka|HalamanSegera/, f);
    }
    // /assessment (form) tidak berubah; hanya kartu Try Out di halaman hasil.
    for (const f of ["app/assessment/page.tsx", "app/assessment/AssessmentSNBPForm.tsx"]) {
      assert.doesNotMatch(baca(f), /fiturTerbuka|HalamanSegera/, f);
    }
  });
});
