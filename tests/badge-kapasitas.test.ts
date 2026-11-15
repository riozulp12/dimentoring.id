/**
 * Test badge kapasitas (tampilan saja): "Hampir habis · sisa N" hanya bila sisa <= BATAS_HAMPIR_HABIS (5),
 * "Penuh" bila sisa 0, tidak ada badge untuk kelas tanpa batas, dan semua angka dari hasil
 * hitungKapasitasKelas. Komponen DIRENDER sungguhan di proses terpisah (react-dom/server menolak kondisi
 * "react-server" yang dipakai runner tes), sama seperti tests/program-mahasiswa.test.ts.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { BATAS_HAMPIR_HABIS, hitungKapasitasKelas, type KapasitasKelas } from "@/lib/shared/kapasitasKelas";

function render(modul: string, props: unknown): string {
  const kode = `
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import(${JSON.stringify(modul)});
    const Komponen = typeof mod.default === "function" ? mod.default : mod.default.default;
    process.stdout.write(renderToStaticMarkup(React.createElement(Komponen, JSON.parse(process.argv[1]))));
  `;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode, JSON.stringify(props)], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
}

const manual = (kapasitas: number, lunas: number): KapasitasKelas => hitungKapasitasKelas({ kapasitasManual: kapasitas, lunas, otomatis: null });
const tanpaBatas = hitungKapasitasKelas({ kapasitasManual: null, lunas: 80, otomatis: null });

const badge = (info: KapasitasKelas | null | undefined) => render("@/components/ui/BadgeKapasitas", { info });
const kartu = (info: KapasitasKelas | null | undefined) =>
  render("@/components/ui/KelasCardVisual", {
    namaKelas: "Matematika TKA Intensif",
    index: 0,
    kapasitasInfo: info,
    programKategori: "tka",
    tingkatKelas: "kelas_12",
    subtesNama: "Matematika",
  });

describe("BadgeKapasitas (render sungguhan)", () => {
  it("BATAS_HAMPIR_HABIS = 5", () => {
    assert.equal(BATAS_HAMPIR_HABIS, 5);
  });

  it("sisa 6 -> tidak ada badge; sisa 5 -> 'Hampir habis · sisa 5'", () => {
    assert.equal(badge(manual(20, 14)), "");
    assert.match(badge(manual(20, 15)), /Hampir habis · sisa 5/);
  });

  it("angka pada badge selalu = sisa dari hasil fungsi (sisa 1..5), tidak ada angka karangan", () => {
    for (const sisa of [1, 2, 3, 4, 5]) {
      const info = manual(20, 20 - sisa);
      assert.equal(info.sisa, sisa);
      const html = badge(info);
      assert.match(html, new RegExp(`Hampir habis · sisa ${sisa}<`));
      assert.ok(!/Penuh/.test(html));
    }
  });

  it("sisa 0 -> 'Penuh' (bukan 'Hampir habis'); melebihi kapasitas juga 'Penuh'", () => {
    for (const lunas of [20, 25]) {
      const html = badge(manual(20, lunas));
      assert.match(html, />Penuh</);
      assert.ok(!/Hampir habis/.test(html));
    }
  });

  it("kelas tanpa batas, atau tanpa info: TIDAK ada badge sama sekali", () => {
    assert.equal(badge(tanpaBatas), "");
    assert.equal(badge(null), "");
    assert.equal(badge(undefined), "");
  });

  it("private otomatis: sisa kursi slot kosong dipakai apa adanya (sisa 3 -> badge sisa 3; sisa 0 -> Penuh)", () => {
    const hampir = hitungKapasitasKelas({ kapasitasManual: null, lunas: 6, otomatis: { kapasitas: 9, sisa: 3 } });
    assert.match(badge(hampir), /Hampir habis · sisa 3/);
    const penuh = hitungKapasitasKelas({ kapasitasManual: null, lunas: 9, otomatis: { kapasitas: 9, sisa: 0 } });
    assert.match(badge(penuh), />Penuh</);
  });
});

describe("KelasCardVisual (kartu program) memakai hasil kapasitasKelas", () => {
  it("hampir habis: badge 'Hampir habis · sisa N' + ajakan menipis; tanpa teks lama 'Tersisa ... Slot!!!'", () => {
    const html = kartu(manual(20, 17));
    assert.match(html, /Hampir habis · sisa 3/);
    assert.match(html, /jangan sampai kehabisan/i);
    assert.ok(!/Tersisa/.test(html));
    assert.ok(!/Slot!!!/.test(html));
  });

  it("penuh: badge 'Penuh' + ajakan 'sudah penuh'", () => {
    const html = kartu(manual(20, 20));
    assert.match(html, />Penuh</);
    assert.match(html, /sudah penuh/i);
  });

  it("sisa 6 dan kelas tanpa batas: tidak ada badge kapasitas dan tidak ada ajakan menipis/penuh", () => {
    for (const info of [manual(20, 14), tanpaBatas, null]) {
      const html = kartu(info);
      assert.ok(!/Hampir habis/.test(html));
      assert.ok(!/>Penuh</.test(html));
      assert.ok(!/sudah penuh/i.test(html));
      assert.ok(!/jangan sampai kehabisan/i.test(html));
    }
  });
});

describe("tampilan hanya memakai satu sumber (sumber kode)", () => {
  const baca = (berkas: string) => readFileSync(berkas, "utf8");

  it("KelasCardVisual tidak punya aturan ambang sendiri (persentase 0.3, sisaSlot, 'Tersisa') — hanya kapasitasKelas", () => {
    const visual = baca("components/ui/KelasCardVisual.tsx");
    assert.ok(!/0\.3\b/.test(visual));
    assert.ok(!/sisaSlot/.test(visual));
    assert.ok(!/Tersisa/.test(visual));
    assert.match(visual, /teksBadgeKapasitas/);
  });

  it("BATAS_HAMPIR_HABIS hanya didefinisikan SATU kali dan tidak ada angka ambang lain di kode tampilan", () => {
    const berkas = [
      "lib/shared/kapasitasKelas.ts",
      "components/ui/BadgeKapasitas.tsx",
      "components/ui/KelasCardVisual.tsx",
      "components/program/KelasCardFrame.tsx",
      "components/program/KelasCardMeta.tsx",
      "lib/dashboard/getProgramData.ts",
    ];
    const definisi = berkas.filter((f) => /BATAS_HAMPIR_HABIS\s*=/.test(baca(f)));
    assert.deepEqual(definisi, ["lib/shared/kapasitasKelas.ts"]);
    for (const f of berkas.filter((x) => x !== "lib/shared/kapasitasKelas.ts")) {
      assert.ok(!/sisa\s*<=\s*\d/.test(baca(f)), f);
    }
  });

  it("kartu, banner detail, tombol, dan checkout membaca kapasitasInfo (tidak ada lagi sisaSlot/kapasitas mentah di kartu)", () => {
    for (const f of [
      "components/program/KelasCardFrame.tsx",
      "components/program/KategoriKelasGrid.tsx",
      "app/program/page.tsx",
      "app/(protected)/(siswa)/kelas/page.tsx",
      "app/program/kelas/[kelasId]/page.tsx",
    ]) {
      const sumber = baca(f);
      assert.match(sumber, /kapasitasInfo/, f);
      assert.ok(!/sisaSlot=\{/.test(sumber), f);
    }
    assert.match(baca("app/program/kelas/[kelasId]/page.tsx"), /<BadgeKapasitas info=\{kelas\.kapasitasInfo\}/);
    assert.match(baca("app/(protected)/(siswa)/kelas/[kelasId]/page.tsx"), /<BadgeKapasitas info=\{kelasPublic\.kapasitasInfo\}/);
    assert.match(baca("app/(protected)/(siswa)/checkout/[kelasId]/page.tsx"), /<BadgeKapasitas info=\{kapasitasInfo\}/);
  });

  it("checkout: kelas penuh -> pesan dan tombol Bayar nonaktif; tombol daftar mengikuti KapasitasKelas.penuh", () => {
    const form = baca("components/siswa/CheckoutForm.tsx");
    assert.match(form, /Kelas ini sudah penuh/);
    assert.match(form, /semuaJadwalPenuh \|\|\s*kelasPenuh \|\|/);
    assert.match(baca("components/program/KelasCardMeta.tsx"), /penuh=\{item\.kapasitasInfo\.penuh\}/);
    assert.match(baca("app/(protected)/(siswa)/checkout/[kelasId]/page.tsx"), /kelasPenuh=\{kelasPenuh\}/);
  });
});
