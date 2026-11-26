/**
 * Gambar soal — tampilan (TeksKaya/TampilanSoal), alamat bertanda tangan, edit
 * Admin yang mempertahankan gambar, dan pembersihan berkas sesudah hapus/arsip.
 * Aturan "media masih dipakai" & versi baru diuji di
 * db/test_studio_soal_media_DRYRUN.sql.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { masalahPenandaGambar, petaGambarSoal } from "@/lib/shared/studio-soal/gambar";
import { terjemahkanRpcAdmin } from "@/lib/shared/studio-soal/bankSoal";
import { uraiTeksKaya } from "@/lib/shared/studio-soal/teksKaya";
import { validasiSoal } from "@/lib/shared/studio-soal/validasi";
import { ADMIN, db, pasangDbTiruan, penyimpanan, resetDbTiruan, rpc, u, type Row } from "./bantuan/dbTiruanSoal";

const baca = (f: string) => readFileSync(f, "utf8");
const M1 = u(901);
const M2 = u(902);
const M3 = u(903);

describe("penanda gambar di teks kaya", () => {
  const segmen = (teks: string, opsi: Parameters<typeof uraiTeksKaya>[1]) => uraiTeksKaya(teks, opsi).flatMap((p) => p.segmen);

  it("hanya kode yang terdaftar jadi gambar; tanpa daftar hasilnya persis seperti dulu", () => {
    assert.deepEqual(segmen("a {{g1}} b {{g2}}", { gambar: new Set(["g1"]) }), [
      { jenis: "teks", teks: "a ", tebal: false, miring: false },
      { jenis: "gambar", kode: "g1" },
      { jenis: "teks", teks: " b {{g2}}", tebal: false, miring: false },
    ]);
    for (const teks of ["a {{g1}} b", "{{r1}} **x** \\(y\\)", "{{g1}}"]) {
      assert.deepEqual(uraiTeksKaya(teks, { gambar: undefined }), uraiTeksKaya(teks));
      assert.deepEqual(uraiTeksKaya(teks, { rumpang: true, gambar: new Set() }), uraiTeksKaya(teks, { rumpang: true }));
    }
    assert.deepEqual(segmen("{{g1}} {{r1}}", { rumpang: true, gambar: new Set(["g1"]) }).map((s) => s.jenis), ["gambar", "teks", "rumpang"]);
  });

  it("peta gambar soal: undefined untuk soal tanpa gambar; alamat hilang = url null", () => {
    assert.equal(petaGambarSoal({ v: 1 }, {}), undefined);
    assert.deepEqual(petaGambarSoal({ gambar: [{ kode: "g1", media_id: M1, alt: "a" }] }, {}), { g1: { url: null, lebar: 0, tinggi: 0, alt: "a" } });
  });

  it("peringatan editor: penanda hilang atau ganda; galat lain tidak ikut", () => {
    const soal = (redaksi: string) => ({
      tipe: "pilihan_ganda",
      redaksi,
      pembahasan: "",
      konten: { v: 1, opsi: [], gambar: [{ kode: "g1", media_id: M1, alt: "a" }] },
      kunci: { v: 1 },
      tingkat_kesulitan: "sedang",
    });
    assert.match(masalahPenandaGambar(validasiSoal(soal("hilang"), "ajukan")).join(" "), /g1 hilang/);
    assert.match(masalahPenandaGambar(validasiSoal(soal("{{g1}} {{g1}}"), "ajukan")).join(" "), /muncul 2 kali/);
    assert.deepEqual(masalahPenandaGambar(validasiSoal(soal("{{g1}}"), "ajukan")), []);
  });
});

// react-dom/server menolak kondisi "react-server" runner tes: render di proses terpisah.
function render(props: unknown): string {
  const kode = `
    (await import("node:module")).default._extensions[".css"] = () => {};
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import("./components/studio-soal/TampilanSoal.tsx");
    const K = typeof mod.default === "function" ? mod.default : mod.default.default;
    process.stdout.write(renderToStaticMarkup(React.createElement(K, JSON.parse(process.argv[1]))));
  `;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode, JSON.stringify(props)], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
}

describe("TampilanSoal bergambar", () => {
  const konten = {
    v: 1,
    opsi: ["A", "B", "C", "D", "E"].map((label) => ({ label, teks: `opsi ${label}` })),
    gambar: [
      { kode: "g1", media_id: M1, alt: "Grafik soal" },
      { kode: "g2", media_id: M2, alt: "ALT-RAHASIA" },
    ],
  };
  const soal = { tipe: "pilihan_ganda", redaksi: "Lihat {{g1}} ini.", konten };
  const rahasia = { kunci: { v: 1, opsi: "C" }, pembahasan: "RAHASIA {{g2}}" };
  const media = {
    [M1]: { url: "https://x.test/soal.png", lebar: 640, tinggi: 480 },
    [M2]: { url: "https://x.test/bahas-RAHASIA.png", lebar: 10, tinggi: 10 },
    [M3]: { url: "https://x.test/bacaan.png", lebar: 300, tinggi: 200 },
  };
  const stimulus = [
    { jenis: "teks", teks: "Paragraf awal." },
    { jenis: "gambar", media_id: M3, alt: "Peta" },
    { jenis: "teks", teks: "Paragraf akhir." },
  ];
  const metadata = { subtes: "PU", topik: null, kesulitan: "sedang", level: null, estimasiDetik: null, versi: 1, status: "draf" };

  it("mode siswa: gambar soal & bacaan di tempatnya dengan ukuran & alt; gambar pembahasan tidak ikut", () => {
    const html = render({ mode: "siswa", soal: { ...soal, ...rahasia }, stimulus, media });
    assert.match(html, /<img src="https:\/\/x\.test\/soal\.png" alt="Grafik soal" width="640" height="480" class="[^"]*max-w-full/);
    // React 19 juga menaruh <link rel="preload"> di awal; yang diukur posisi <img>-nya.
    const urut = ["Paragraf awal.", '<img src="https://x.test/bacaan.png"', "Paragraf akhir.", "Lihat ", '<img src="https://x.test/soal.png"', " ini."].map((t) => html.indexOf(t));
    assert.equal(urut.every((x, i) => x >= 0 && (i === 0 || x > urut[i - 1])), true, JSON.stringify(urut));
    assert.doesNotMatch(html, /RAHASIA|\{\{g1\}\}/);
  });

  it("mode admin: gambar pembahasan baru tampil bersama pembahasan", () => {
    const tutup = render({ mode: "admin", soal: { ...soal, ...rahasia }, metadata, media });
    assert.match(tutup, /soal\.png/);
    assert.doesNotMatch(tutup, /bahas-RAHASIA/);
    const buka = render({ mode: "admin", soal: { ...soal, ...rahasia }, metadata, media, awalTampilKunci: true });
    assert.match(buka, /<img src="https:\/\/x\.test\/bahas-RAHASIA\.png" alt="ALT-RAHASIA"/);
  });

  it("alamat tidak tersedia = keterangan, bukan gambar rusak", () => {
    const html = render({ mode: "siswa", soal, stimulus });
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /Gambar tidak bisa dimuat: Grafik soal/);
  });

  it("soal lama tanpa gambar: tampilannya sama persis", () => {
    const lama = { tipe: "pilihan_ganda", redaksi: "Teks {{g1}} biasa.", konten: { v: 1, opsi: konten.opsi } };
    const tanpa = render({ mode: "siswa", soal: lama });
    assert.equal(render({ mode: "siswa", soal: lama, media }), tanpa);
    assert.match(tanpa, /Teks \{\{g1\}\} biasa\./);
    assert.doesNotMatch(tanpa, /<img/);
  });

  it("gambar memakai <img> biasa; halaman menyelesaikan alamat sesudah guard admin", () => {
    const komponen = baca("components/studio-soal/GambarSoal.tsx");
    assert.match(komponen, /<img/);
    assert.doesNotMatch(komponen, /from "next\/image"/);
    assert.doesNotMatch(baca("components/studio-soal/TampilanSoal.tsx"), /supabase|urlGambarSoal\(|fetch\(/);
    for (const f of ["[id]/page.tsx", "[id]/edit/page.tsx"]) {
      const isi = baca(`app/(protected)/(admin)/bank-soal/${f}`);
      assert.ok(isi.indexOf("urlGambarSoal(") > isi.indexOf("requireAdminAktif("), f);
    }
  });
});

describe("alamat gambar, edit Admin, dan pembersihan", () => {
  let permintaan: Awaited<ReturnType<typeof pasangDbTiruan>>;
  let media: typeof import("@/lib/admin/mediaSoal");
  let satu: typeof import("@/app/api/admin/studio-soal/bank/[id]/route");
  let aksi: typeof import("@/app/api/admin/studio-soal/bank/[id]/[aksi]/route");
  let batch: typeof import("@/app/api/admin/studio-soal/bank/batch/[id]/route");
  let terbit: typeof import("@/app/api/admin/studio-soal/impor/terbitkan/route");
  before(async () => {
    permintaan = await pasangDbTiruan();
    media = await import("@/lib/admin/mediaSoal");
    satu = await import("@/app/api/admin/studio-soal/bank/[id]/route");
    aksi = await import("@/app/api/admin/studio-soal/bank/[id]/[aksi]/route");
    batch = await import("@/app/api/admin/studio-soal/bank/batch/[id]/route");
    terbit = await import("@/app/api/admin/studio-soal/impor/terbitkan/route");
  });

  const ID = u(1001);
  const PU = u(101);
  const barisSoal = (ubah: Row = {}): Row => ({
    id: ID,
    sumber: "buatan_sendiri",
    status: "draf",
    menggantikan_id: null,
    subtes_id: PU,
    stimulus_id: null,
    tipe: "pilihan_ganda",
    redaksi: "Lihat {{g1}}.",
    konten: { v: 1, opsi: ["A", "B", "C", "D", "E"].map((label) => ({ label, teks: label })), gambar: [{ kode: "g1", media_id: M1, alt: "a" }] },
    kunci: { v: 1, opsi: "C" },
    pembahasan: "Pembahasan yang cukup panjang.",
    sumber_rujukan: null,
    tingkat_kesulitan: "sedang",
    level_kognitif: null,
    estimasi_waktu_detik: null,
    updated_at: "2026-11-20T10:00:00+00:00",
    ...ubah,
  });
  /** RPC tiruan: RPC utama sukses; gambar M2 & M3 yatim. */
  const rpcBersih = (utama: Row) => (_args: Row, nama: string): Row => {
    if (nama === "studio_soal_admin_media_yatim") return { status: "ok", media: [{ id: M2, path: "f/2.png" }, { id: M3, path: "f/3.png" }] };
    if (nama === "studio_soal_admin_hapus_media") return { status: "dihapus", jumlah: 1 };
    return utama;
  };
  beforeEach(() => {
    resetDbTiruan();
    db.subtes = [{ id: PU, nama: "Penalaran Umum", kategori: "tps" }];
    db.soal_bank = [barisSoal()];
    db.soal_media = [
      { id: M1, path: "f/1.png", lebar: 20, tinggi: 10 },
      { id: M2, path: "f/2.png", lebar: 1, tinggi: 1 },
      { id: M3, path: "f/3.png", lebar: 1, tinggi: 1 },
    ];
    for (const n of [1, 2, 3]) penyimpanan.berkas.set(`soal-media/f/${n}.png`, Buffer.from("x"));
  });
  const berkas = () => [...penyimpanan.berkas.keys()].sort();
  const json = async (res: Response) => ({ status: res.status, json: (await res.json()) as Row });
  const ctx = <T,>(p: T) => ({ params: Promise.resolve(p) });
  const hapus = async () => json(await satu.DELETE(permintaan(ADMIN, "admin", "DELETE"), ctx({ id: ID })));
  const dipanggil = () => rpc.panggilan.map((p) => p.nama.replace("studio_soal_admin_", ""));

  it("urlGambarSoal: alamat bertanda tangan 10 menit beserta ukuran; id asing diabaikan", async () => {
    assert.deepEqual(await media.urlGambarSoal([M1, M1, u(999), "../x"]), {
      [M1]: { url: "http://storage.test/soal-media/f/1.png?berlaku=600", lebar: 20, tinggi: 10 },
    });
    assert.deepEqual(await media.urlGambarSoal([]), {});
  });

  it("hapus draf: berkas yatim dihapus lalu barisnya; gambar yang masih dipakai tidak disentuh", async () => {
    rpc.jawab = rpcBersih({ status: "dihapus", jumlah_bacaan: 0 });
    const r = await hapus();
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(dipanggil(), ["hapus_draf", "media_yatim", "hapus_media"]);
    assert.deepEqual(berkas(), ["soal-media/f/1.png"]);
    assert.deepEqual(rpc.panggilan[2].args, { p_admin_id: ADMIN, p_ids: [M2, M3] });
    assert.deepEqual([r.json.gambarGagalDihapus, /belum terhapus/.test(String(r.json.pesan))], [0, false]);
  });

  it("gagal hapus berkas: dilaporkan jumlahnya, barisnya dipertahankan; aksi utama tetap sukses", async () => {
    penyimpanan.gagalHapus.add("f/3.png");
    rpc.jawab = rpcBersih({ status: "dihapus", jumlah_soal: 1, jumlah_bacaan: 0, dipertahankan: 0 });
    const r = await json(await batch.DELETE(permintaan(ADMIN, "admin", "DELETE"), ctx({ id: u(501) })));
    assert.equal(r.status, 200);
    assert.equal(r.json.gambarGagalDihapus, 1);
    assert.match(String(r.json.pesan), /1 berkas gambar belum terhapus/);
    assert.deepEqual(rpc.panggilan.at(-1)?.args.p_ids, [M2]);
    assert.deepEqual(berkas(), ["soal-media/f/1.png", "soal-media/f/3.png"]);
  });

  it("arsip membersihkan juga; RPC utama gagal atau versi baru tidak menyentuh gambar", async () => {
    rpc.jawab = rpcBersih({ status: "diarsipkan" });
    await aksi.POST(permintaan(ADMIN, "admin", "POST"), ctx({ id: ID, aksi: "arsipkan" }));
    assert.deepEqual(dipanggil(), ["arsipkan", "media_yatim", "hapus_media"]);
    for (const [utama, jalankan] of [
      [{ status: "status_tidak_valid" }, hapus],
      [{ status: "versi_dibuat", soal_id: u(2) }, async () => aksi.POST(permintaan(ADMIN, "admin", "POST"), ctx({ id: ID, aksi: "versi-baru" }))],
    ] as const) {
      rpc.panggilan = [];
      rpc.jawab = rpcBersih(utama);
      await jalankan();
      assert.equal(rpc.panggilan.length, 1);
    }
  });

  it("belum ada gambar sama sekali: pembersihan dilewati", async () => {
    db.soal_media = [];
    rpc.jawab = rpcBersih({ status: "dihapus", jumlah_bacaan: 0 });
    await hapus();
    assert.deepEqual(dipanggil(), ["hapus_draf"]);
  });

  it("simpan Admin mengirim daftar gambar yang sama; penanda hilang ditolak sebelum RPC; media asing 400", async () => {
    const isi = (ubah: Row = {}) => {
      const s = barisSoal();
      return Object.fromEntries(["subtes_id", "tipe", "stimulus_id", "redaksi", "konten", "kunci", "pembahasan", "tingkat_kesulitan", "updated_at"].map((k) => [k, k in ubah ? ubah[k] : s[k]]));
    };
    const simpan = async (body: unknown) => json(await satu.PUT(permintaan(ADMIN, "admin", "PUT", body), ctx({ id: ID })));
    rpc.jawab = { status: "disimpan" };
    assert.equal((await simpan(isi({ redaksi: "Sudah diubah {{g1}}." }))).status, 200);
    assert.deepEqual(((rpc.panggilan[0].args.p_data as Row).konten as Row).gambar, [{ kode: "g1", media_id: M1, alt: "a" }]);
    rpc.panggilan = [];
    const hilang = await simpan(isi({ redaksi: "Tanpa tanda." }));
    assert.equal(hilang.status, 400);
    assert.match(JSON.stringify(hilang.json.errors), /g1 hilang/);
    assert.equal(rpc.panggilan.length, 0);
    rpc.jawab = { status: "media_asing" };
    const asing = await simpan(isi({ konten: { ...(barisSoal().konten as Row), gambar: [{ kode: "g1", media_id: u(999), alt: "a" }] } }));
    assert.equal(asing.status, 400);
    assert.match(String(asing.json.error), /gambar yang sudah ada/);
    assert.match(terjemahkanRpcAdmin({ status: "media_asing" }).pesan, /gambar/);
  });

  it("terbit: soal bergambar yang lengkap lolos; penanda lepas ditolak", async () => {
    rpc.jawab = (args) => ({ status: "selesai", diterbitkan: args.p_ids, dilewati: [] });
    const kirim = async () => json(await terbit.POST(permintaan(ADMIN, "admin", "POST", { soalId: ID })));
    assert.equal((await kirim()).json.diterbitkan, 1);
    db.soal_bank = [barisSoal({ redaksi: "lepas" })];
    assert.equal((await kirim()).json.diterbitkan, 0);
  });
});
