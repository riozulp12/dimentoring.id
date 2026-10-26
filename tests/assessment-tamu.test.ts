/**
 * Test alur tamu untuk saran Kelas & Try Out di hasil Assessment
 * (lib/shared/saranProdukAssessment.ts) + tombol beli di detail kelas
 * (lib/shared/kelasDaftarTarget.ts). Modul murni, tanpa DB.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aksiKartuKelas,
  aksiTryout,
  hrefLoginKembali,
  pilihKelasUmum,
} from "@/lib/shared/saranProdukAssessment";
import { resolveKelasDaftarAction } from "@/lib/shared/kelasDaftarTarget";
import { safeInternalPath } from "@/lib/auth/safeInternalPath";

const KELAS_ID = "7d3c1a2b-0000-4000-8000-000000000001";

function returnToDari(href: string): string | null {
  const url = new URL(href, "https://dimentoring.id");
  assert.equal(url.pathname, "/login");
  return url.searchParams.get("returnTo");
}

describe("kartu saran kelas", () => {
  it("tamu hanya dibawa sampai halaman detail publik, bukan checkout", () => {
    const aksi = aksiKartuKelas(KELAS_ID, null);
    assert.equal(aksi.href, `/program/kelas/${KELAS_ID}`);
    assert.equal(aksi.label, "Lihat Kelas");
    assert.equal(aksi.status, null);
    assert.doesNotMatch(aksi.href, /checkout/);
  });

  it("sudah lunas: tidak ditawari beli ulang, langsung buka kelas", () => {
    const aksi = aksiKartuKelas(KELAS_ID, "lunas");
    assert.equal(aksi.href, `/kelas/${KELAS_ID}`);
    assert.equal(aksi.label, "Buka Kelas");
    assert.equal(aksi.status, "Sudah kamu ikuti");
  });

  it("menunggu pembayaran: tetap ke detail dengan penanda status", () => {
    const aksi = aksiKartuKelas(KELAS_ID, "menunggu");
    assert.equal(aksi.href, `/program/kelas/${KELAS_ID}`);
    assert.equal(aksi.status, "Menunggu pembayaran");
  });

  it("batal diperlakukan seperti belum punya", () => {
    assert.equal(aksiKartuKelas(KELAS_ID, "batal").status, null);
  });
});

describe("tombol beli di detail kelas untuk tamu", () => {
  it("mengarah ke login dengan returnTo ke detail kelas yang sama", () => {
    const aksi = resolveKelasDaftarAction({
      kelasId: KELAS_ID,
      sisaSlot: 5,
      linkPendaftaran: null,
      sessionRole: null,
      isCheckoutInternalReady: true,
    });
    assert.equal(aksi.kind, "internal");
    if (aksi.kind !== "internal") return;
    const returnTo = returnToDari(aksi.href);
    assert.equal(returnTo, `/program/kelas/${KELAS_ID}`);
    assert.equal(safeInternalPath(returnTo), returnTo);
  });

  it("siswa yang sudah login langsung ke checkout", () => {
    const aksi = resolveKelasDaftarAction({
      kelasId: KELAS_ID,
      sisaSlot: 5,
      linkPendaftaran: null,
      sessionRole: "student",
      isCheckoutInternalReady: true,
    });
    assert.deepEqual(aksi, { kind: "internal", href: `/checkout/${KELAS_ID}` });
  });
});

describe("hrefLoginKembali", () => {
  it("membawa path internal sebagai returnTo", () => {
    assert.equal(returnToDari(hrefLoginKembali("/program/kelas/abc")), "/program/kelas/abc");
    assert.equal(returnToDari(hrefLoginKembali("/tryout")), "/tryout");
  });

  it("menolak tujuan luar situs (open redirect)", () => {
    for (const jahat of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "evil.com/login",
      "/redirect?u=https://evil.com",
      "/a\nb",
      "",
      null,
      undefined,
    ]) {
      assert.equal(hrefLoginKembali(jahat), "/login", `harus ditolak: ${String(jahat)}`);
    }
  });
});

describe("saran try out", () => {
  it("tamu diarahkan ke login lalu kembali ke /tryout", () => {
    const aksi = aksiTryout(false);
    assert.equal(returnToDari(aksi.href), "/tryout");
  });
  it("yang sudah login langsung ke /tryout", () => {
    assert.deepEqual(aksiTryout(true), { href: "/tryout", label: "Mulai Try Out" });
  });
});

describe("pilihKelasUmum", () => {
  const k = (id: string, programKategori: string, tingkatKelas: string) => ({ id, nama: id, programKategori, tingkatKelas });
  it("hanya program persiapan PTN, kelas 12/gap year dulu, maksimal 3", () => {
    const hasil = pilihKelasUmum([
      k("konsul", "konsultasi", "kelas_12"),
      k("tka10", "tka", "kelas_10"),
      k("mandiri12", "ujian_mandiri", "kelas_12"),
      k("tka12", "tka", "kelas_12"),
      k("snbt12", "snbt", "kelas_12"),
      k("mhs", "pendampingan_mahasiswa", "gap_year"),
    ]);
    assert.deepEqual(
      hasil.map((x) => x.id),
      ["snbt12", "tka12", "mandiri12"],
    );
  });
  it("kosong kalau katalog kosong", () => {
    assert.deepEqual(pilihKelasUmum([]), []);
  });
});
