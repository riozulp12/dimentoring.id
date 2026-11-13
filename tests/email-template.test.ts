/**
 * Test template email Dimentoring (layout bersama + isi per event). Murni
 * tampilan: tidak ada pengiriman, tidak ada jaringan, tidak butuh env.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";
import { describe, it } from "node:test";
import { CONTOH_EVENT_EMAIL } from "@/lib/email/contohEmail";
import {
  TAUTAN_INSTAGRAM,
  TAUTAN_TIKTOK,
  TAUTAN_WA,
  jadikanTautanAbsolut,
  renderEmailLayout,
} from "@/lib/email/layoutEmail";
import {
  buatEmailPembayaranBerhasil,
  buatEmailResetPassword,
  buatEmailSiswaBaru,
} from "@/lib/email/templateEmail";

/** Semua nilai href="..." di HTML. */
function semuaHref(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
}

interface PngRgba {
  lebar: number;
  tinggi: number;
  /** [r, g, b, a] di (x, y). */
  piksel: (x: number, y: number) => [number, number, number, number];
}

/** Dekoder PNG minimal (RGBA 8-bit, tanpa interlace) — cukup untuk memeriksa ikon tanpa dependensi baru. */
function bacaPng(berkas: string): PngRgba {
  const buf = readFileSync(path.join(process.cwd(), "public", "email", berkas));
  assert.equal(buf.subarray(1, 4).toString("latin1"), "PNG", berkas);
  const lebar = buf.readUInt32BE(16);
  const tinggi = buf.readUInt32BE(20);
  assert.equal(buf[24], 8, `${berkas}: bit depth`);
  assert.equal(buf[25], 6, `${berkas}: harus RGBA`);
  assert.equal(buf[28], 0, `${berkas}: tanpa interlace`);
  const idat: Buffer[] = [];
  for (let i = 8; i < buf.length; ) {
    const panjang = buf.readUInt32BE(i);
    const jenis = buf.subarray(i + 4, i + 8).toString("latin1");
    if (jenis === "IDAT") idat.push(buf.subarray(i + 8, i + 8 + panjang));
    i += 12 + panjang;
  }
  const mentah = inflateSync(Buffer.concat(idat));
  const baris = lebar * 4;
  const data = Buffer.alloc(tinggi * baris);
  for (let y = 0; y < tinggi; y++) {
    const filter = mentah[y * (baris + 1)];
    for (let x = 0; x < baris; x++) {
      const nilai = mentah[y * (baris + 1) + 1 + x];
      const kiri = x >= 4 ? data[y * baris + x - 4] : 0;
      const atas = y > 0 ? data[(y - 1) * baris + x] : 0;
      const kiriAtas = y > 0 && x >= 4 ? data[(y - 1) * baris + x - 4] : 0;
      let hasil = nilai;
      if (filter === 1) hasil = nilai + kiri;
      else if (filter === 2) hasil = nilai + atas;
      else if (filter === 3) hasil = nilai + ((kiri + atas) >> 1);
      else if (filter === 4) {
        const pa = Math.abs(atas - kiriAtas);
        const pb = Math.abs(kiri - kiriAtas);
        const pc = Math.abs(kiri + atas - 2 * kiriAtas);
        hasil = nilai + (pa <= pb && pa <= pc ? kiri : pb <= pc ? atas : kiriAtas);
      }
      data[y * baris + x] = hasil & 255;
    }
  }
  return { lebar, tinggi, piksel: (x, y) => [data[y * baris + x * 4], data[y * baris + x * 4 + 1], data[y * baris + x * 4 + 2], data[y * baris + x * 4 + 3]] };
}

describe("email template: tautan medsos & bantuan", () => {
  it("setiap event memuat tautan wa.me, Instagram, dan TikTok yang benar (HTML dan teks)", () => {
    assert.equal(TAUTAN_WA, "https://wa.me/6282225982026");
    assert.equal(TAUTAN_INSTAGRAM, "https://instagram.com/dimentoring.id");
    assert.equal(TAUTAN_TIKTOK, "https://tiktok.com/@dimentoring.id");
    for (const event of CONTOH_EVENT_EMAIL) {
      const { html, teks } = event.buat();
      const href = semuaHref(html);
      for (const tautan of [TAUTAN_WA, TAUTAN_INSTAGRAM, TAUTAN_TIKTOK]) {
        assert.ok(href.includes(tautan), `${event.kunci}: href ${tautan} tidak ada di HTML`);
        assert.ok(teks.includes(tautan), `${event.kunci}: ${tautan} tidak ada di teks`);
      }
      assert.ok(html.includes("0822-2598-2026"), event.kunci);
      assert.match(html, /Butuh bantuan atau punya pertanyaan\? Hubungi WhatsApp Tim Dimentoring di/);
    }
  });

  it("footer: slogan, catatan otomatis, dan ikon medsos berupa PNG (bukan SVG) yang bisa diklik", () => {
    for (const event of CONTOH_EVENT_EMAIL) {
      const { html } = event.buat();
      assert.ok(html.includes("Bertumbuh Bersama, Dimentorin Sampai Berhasil"), event.kunci);
      assert.ok(html.includes("Email ini dikirim otomatis oleh sistem Dimentoring. Mohon tidak membalas email ini."), event.kunci);
      for (const berkas of ["ikon-whatsapp.png", "ikon-instagram.png", "ikon-tiktok.png"]) {
        assert.match(html, new RegExp(`<a href="[^"]+"[^>]*><img src="https://dimentoring\\.id/email/${berkas}"`), `${event.kunci}: ${berkas}`);
      }
      const gambar = [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
      assert.ok(gambar.length >= 5, event.kunci);
      for (const src of gambar) {
        assert.match(src, /^https:\/\/dimentoring\.id\/email\/[a-z-]+\.png$/, `${event.kunci}: gambar ${src}`);
      }
    }
  });

  it("aset PNG yang dirujuk template ada di public/email", () => {
    for (const berkas of ["logo-putih.png", "logo-biru.png", "ikon-whatsapp.png", "ikon-instagram.png", "ikon-tiktok.png"]) {
      assert.ok(existsSync(path.join(process.cwd(), "public", "email", berkas)), berkas);
    }
  });

  it("ikon medsos: PNG 96px (2x), lingkaran putih bertepi abu-abu, logo berwarna asli (bukan putih)", () => {
    const putih = (p: number[]) => p[0] > 250 && p[1] > 250 && p[2] > 250 && p[3] === 255;
    const hitung = (png: PngRgba, uji: (p: number[]) => boolean) => {
      let n = 0;
      for (let y = 0; y < png.tinggi; y++) for (let x = 0; x < png.lebar; x++) if (uji(png.piksel(x, y))) n++;
      return n;
    };
    const warna: Record<string, (p: number[]) => boolean> = {
      "ikon-whatsapp.png": (p) => p[3] === 255 && p[1] > 180 && p[0] < 90 && p[2] < 140, // hijau #25D366
      "ikon-instagram.png": (p) => p[3] === 255 && p[0] > 200 && p[1] < 100, // magenta/oranye gradien
      "ikon-tiktok.png": (p) => p[3] === 255 && p[0] < 40 && p[1] < 40 && p[2] < 40, // not hitam
    };
    for (const [berkas, uji] of Object.entries(warna)) {
      const png = bacaPng(berkas);
      assert.deepEqual([png.lebar, png.tinggi], [96, 96], berkas);
      assert.equal(png.piksel(0, 0)[3], 0, `${berkas}: sudut harus transparan (bentuk lingkaran)`);
      assert.ok(putih(png.piksel(10, 48)) && putih(png.piksel(85, 48)), `${berkas}: latar lingkaran harus putih`);
      const tepi = png.piksel(48, 1);
      assert.ok(tepi[3] > 200 && tepi[0] > 200 && tepi[0] < 245 && Math.abs(tepi[0] - tepi[2]) < 12, `${berkas}: tepi abu-abu muda, dapat ${tepi}`);
      assert.ok(hitung(png, uji) > 150, `${berkas}: logo berwarna asli tidak ditemukan`);
    }
    // TikTok punya aksen cyan #25F4EE dan merah #FE2C55; Instagram punya ungu (bagian gradien)
    const tt = bacaPng("ikon-tiktok.png");
    assert.ok(hitung(tt, (p) => p[3] > 200 && p[0] < 90 && p[1] > 200 && p[2] > 200) > 5, "aksen cyan TikTok");
    assert.ok(hitung(tt, (p) => p[3] > 200 && p[0] > 200 && p[1] < 100 && p[2] > 50 && p[2] < 140) > 5, "aksen merah TikTok");
    const ig = bacaPng("ikon-instagram.png");
    assert.ok(hitung(ig, (p) => p[3] === 255 && p[0] > 90 && p[0] < 170 && p[1] < 80 && p[2] > 140) > 5, "ungu Instagram");
  });

  it("HTML menunjuk ikon baru: WhatsApp dipakai di footer DAN kotak bantuan, tampil 40px (footer) / 32px (bantuan)", () => {
    for (const event of CONTOH_EVENT_EMAIL) {
      const { html } = event.buat();
      const wa = html.match(/src="https:\/\/dimentoring\.id\/email\/ikon-whatsapp\.png"[^>]*>/g) ?? [];
      assert.equal(wa.length, 2, `${event.kunci}: ikon WhatsApp harus muncul di kotak bantuan + footer`);
      assert.ok(wa.some((t) => t.includes('width="32"')), `${event.kunci}: ikon kotak bantuan`);
      assert.ok(wa.some((t) => t.includes('width="40"')), `${event.kunci}: ikon footer`);
      for (const berkas of ["ikon-instagram.png", "ikon-tiktok.png"]) {
        assert.ok(html.includes(`src="https://dimentoring.id/email/${berkas}" width="40" height="40"`), `${event.kunci}: ${berkas}`);
      }
      assert.ok(!/ikon-telepon|icons\/footer-/.test(html), event.kunci);
    }
  });
});

describe("email template: header rata tengah", () => {
  it("logo, judul, dan paragraf pendukung rata tengah di semua event (sel align=center + text-align:center)", () => {
    for (const event of CONTOH_EVENT_EMAIL) {
      const { html } = event.buat();
      const mulai = html.indexOf("<td class=\"px\" align=\"center\" bgcolor=\"#081EEA\"");
      const akhir = html.indexOf("Halo <strong>");
      assert.ok(mulai > -1 && akhir > mulai, `${event.kunci}: sel header tidak ditemukan`);
      const header = html.slice(mulai, akhir);
      assert.match(header, /text-align:center;">\s*<table[^>]*align="center"/, event.kunci);
      assert.match(header, /<td align="center" style="text-align:center;">\s*<img[^>]*logo-putih\.png[^>]*margin:0 auto/, `${event.kunci}: logo`);
      assert.match(header, /<h1 class="judul"[^>]*text-align:center/, `${event.kunci}: judul`);
      assert.match(header, /<p style="margin:0;[^"]*text-align:center;">/, `${event.kunci}: paragraf pendukung`);
      assert.ok(!/text-align:left/.test(header), event.kunci);
    }
  });
});

describe("email template: tanpa maskot", () => {
  it("tidak ada kata/gambar maskot di HTML maupun teks", () => {
    for (const event of CONTOH_EVENT_EMAIL) {
      const { html, teks } = event.buat();
      for (const bagian of [html, teks]) {
        assert.ok(!/mascot|maskot|penguin|penguine/i.test(bagian), `${event.kunci} memuat maskot`);
      }
    }
  });
});

describe("email template: escape HTML", () => {
  const JAHAT = `<script>alert("x")</script> & 'Q'`;

  it("nama siswa/kelas/mentor/jadwal berisi < > & \" ter-escape di semua event", () => {
    const hasil = [
      buatEmailSiswaBaru({ namaMentor: JAHAT, namaSiswa: JAHAT, kelasNama: JAHAT, jadwalDisplay: JAHAT, tautan: "https://dimentoring.id/kelas-saya/k" }),
      buatEmailResetPassword({ nama: JAHAT, resetLink: "https://dimentoring.id/reset-password?token=a&b=<c>" }),
      buatEmailPembayaranBerhasil({
        namaSiswa: JAHAT,
        kelasNama: JAHAT,
        namaMentor: JAHAT,
        jadwalDisplay: JAHAT,
        jumlahDibayar: JAHAT,
        kodePromo: JAHAT,
        tanggalPembayaran: JAHAT,
        nomorPesanan: JAHAT,
        tautan: "https://dimentoring.id/kelas/k",
      }),
    ];
    for (const { html } of hasil) {
      assert.ok(!html.includes("<script"), "tag script lolos");
      assert.ok(!html.includes('alert("x")'), "tanda kutip ganda lolos");
      assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;Q&#39;"));
    }
    // URL berisi < > & juga di-escape di atribut href
    assert.ok(!hasil[1].html.includes("b=<c>"));
    assert.ok(hasil[1].html.includes("a&amp;b=&lt;c&gt;"));
  });

  it("parameter layout langsung (judul, paragraf, pembuka, kartu, catatan, tombol) ter-escape", () => {
    const { html } = renderEmailLayout({
      namaEvent: "<b>Judul</b>",
      paragrafPendukung: "<i>pendukung</i>",
      namaPenerima: "<u>Nama</u>",
      pembuka: "<s>pembuka</s>",
      isi: [{ label: "<l>", nilai: "<n>" }],
      tombol: { label: "<t>", url: 'https://dimentoring.id/x?"onmouseover="a' },
      catatan: "<c>",
    });
    for (const tag of ["<b>", "<i>", "<u>", "<s>", "<l>", "<n>", "<t>", "<c>"]) {
      assert.ok(!html.includes(tag), `${tag} lolos`);
    }
    assert.ok(!html.includes('"onmouseover="'), "atribut href bisa disusupi");
  });
});

describe("email template: tombol", () => {
  it("tombol utama memakai URL absolut (http/https) di semua event", () => {
    for (const event of CONTOH_EVENT_EMAIL) {
      const { html } = event.buat();
      const tombol = html.match(/<a class="btn-a" href="([^"]+)"/);
      assert.ok(tombol, `${event.kunci}: tombol tidak ditemukan`);
      assert.match(tombol[1], /^https:\/\//, event.kunci);
    }
  });

  it("tautan relatif dijadikan absolut; skema berbahaya jatuh ke basis", () => {
    assert.equal(jadikanTautanAbsolut("/kelas-saya/k1", "https://dimentoring.id"), "https://dimentoring.id/kelas-saya/k1");
    assert.equal(jadikanTautanAbsolut("/kelas-saya/k1", "https://dimentoring.id/"), "https://dimentoring.id/kelas-saya/k1");
    assert.equal(jadikanTautanAbsolut("https://contoh.id/a", "https://dimentoring.id"), "https://contoh.id/a");
    assert.equal(jadikanTautanAbsolut("javascript:alert(1)", "https://dimentoring.id"), "https://dimentoring.id");
    const { html } = renderEmailLayout({
      namaEvent: "E",
      paragrafPendukung: "p",
      namaPenerima: "N",
      pembuka: "b",
      tombol: { label: "Buka", url: "/kelas-saya/k1" },
    });
    assert.ok(html.includes('class="btn-a" href="https://dimentoring.id/kelas-saya/k1"'));
  });
});

describe("email template: isi per event & versi teks biasa", () => {
  it("semua event punya subjek satu baris dan versi teks biasa yang rapi (tanpa HTML)", () => {
    assert.ok(CONTOH_EVENT_EMAIL.length >= 3);
    for (const event of CONTOH_EVENT_EMAIL) {
      const { subjek, teks, html } = event.buat();
      assert.ok(subjek.trim().length > 0 && !/[\r\n]/.test(subjek), `${event.kunci}: subjek`);
      assert.ok(teks.trim().length > 100, `${event.kunci}: teks kosong`);
      assert.ok(!/<[a-z!/][^>]*>/i.test(teks), `${event.kunci}: teks memuat tag HTML`);
      assert.match(teks, /Halo /, event.kunci);
      assert.match(teks, /https:\/\/dimentoring\.id\//, event.kunci);
      assert.ok(html.includes("<html"), event.kunci);
    }
  });

  it("siswa baru: kartu Siswa/Kelas/Jadwal; jadwal kosong -> baris Jadwal hilang; subjek tetap", () => {
    const dengan = buatEmailSiswaBaru({ namaMentor: "Rina", namaSiswa: "Budi", kelasNama: "Kelas A", jadwalDisplay: "Senin 16.00", tautan: "https://dimentoring.id/kelas-saya/k" });
    for (const nilai of ["Siswa", "Budi", "Kelas A", "Jadwal", "Senin 16.00", "Lihat Detail Kelas", "Siswa Baru di Kelasmu"]) {
      assert.ok(dengan.html.includes(nilai), nilai);
    }
    assert.equal(dengan.subjek, "Ada siswa baru di kelas Kelas A");
    const tanpa = buatEmailSiswaBaru({ namaMentor: "Rina", namaSiswa: "Budi", kelasNama: "Kelas A", jadwalDisplay: null, tautan: "https://dimentoring.id/kelas-saya/k" });
    assert.ok(!tanpa.html.includes("Jadwal"));
    assert.ok(!tanpa.teks.includes("Jadwal"));
  });

  it("reset password: subjek lama dipertahankan, tombol mengarah ke tautan reset", () => {
    const hasil = buatEmailResetPassword({ nama: "Budi", resetLink: "https://dimentoring.id/reset-password?token=abc" });
    assert.equal(hasil.subjek, "Reset Password Dimentoring");
    assert.ok(hasil.html.includes('class="btn-a" href="https://dimentoring.id/reset-password?token=abc"'));
    assert.ok(hasil.teks.includes("https://dimentoring.id/reset-password?token=abc"));
    assert.ok(hasil.html.includes("30 menit"));
  });
});

describe("email reset password: pengiriman ke Resend", () => {
  it("permintaan ke Resend memuat text (tidak kosong) di samping html; from, to, dan subjek tidak berubah", async () => {
    const fetchAsli = globalThis.fetch;
    const apiKeyAsli = process.env.RESEND_API_KEY;
    const log = { log: console.log, error: console.error };
    const diterima: { url: string; body: Record<string, unknown> }[] = [];
    process.env.RESEND_API_KEY = "re_kunci_tiruan_untuk_tes";
    console.log = () => {};
    console.error = () => {};
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      diterima.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify({ id: "email-uji-1" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const { kirimEmailResetPassword } = await import("@/lib/email/kirimEmailResetPassword");
      const hasil = await kirimEmailResetPassword({
        email: "budi@contoh.id",
        nama: "Budi <Santoso>",
        resetLink: "https://dimentoring.id/reset-password?token=abc123",
      });
      assert.deepEqual(hasil, { success: true });
      assert.equal(diterima.length, 1, "harus tepat satu permintaan ke Resend");
      const { url, body } = diterima[0];
      assert.match(url, /^https:\/\/api\.resend\.com\/emails/);
      // text terkirim, tidak kosong, dan teks biasa (bukan HTML)
      assert.equal(typeof body.text, "string");
      const teks = String(body.text);
      assert.ok(teks.trim().length > 100, "text kosong/terlalu pendek");
      assert.ok(teks.includes("https://dimentoring.id/reset-password?token=abc123"), "text tanpa tautan reset");
      assert.ok(teks.includes("Budi <Santoso>"), "text memuat nama apa adanya (teks biasa tidak di-escape HTML)");
      assert.ok(!/<(html|table|a |p )/i.test(teks), "text memuat tag HTML");
      // html tetap terkirim dan di-escape
      assert.ok(String(body.html).includes("&lt;Santoso&gt;"));
      // bagian lain di jalur pengiriman tidak berubah
      assert.equal(body.from, "Dimentoring <noreply@dimentoring.id>");
      assert.deepEqual(body.to, ["budi@contoh.id"]);
      assert.equal(body.subject, "Reset Password Dimentoring");
    } finally {
      globalThis.fetch = fetchAsli;
      if (apiKeyAsli === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = apiKeyAsli;
      console.log = log.log;
      console.error = log.error;
    }
  });

  it("tanpa RESEND_API_KEY: tidak ada permintaan ke Resend (perilaku lama tetap)", async () => {
    const fetchAsli = globalThis.fetch;
    const apiKeyAsli = process.env.RESEND_API_KEY;
    const errAsli = console.error;
    let dipanggil = 0;
    delete process.env.RESEND_API_KEY;
    console.error = () => {};
    globalThis.fetch = (async () => {
      dipanggil++;
      return new Response("{}");
    }) as typeof fetch;
    try {
      const { kirimEmailResetPassword } = await import("@/lib/email/kirimEmailResetPassword");
      const hasil = await kirimEmailResetPassword({ email: "budi@contoh.id", nama: "Budi", resetLink: "https://dimentoring.id/reset-password?token=x" });
      assert.equal(hasil.success, false);
      assert.equal(dipanggil, 0);
    } finally {
      globalThis.fetch = fetchAsli;
      if (apiKeyAsli !== undefined) process.env.RESEND_API_KEY = apiKeyAsli;
      console.error = errAsli;
    }
  });
});
