/**
 * Test presensi (PRD 7.5.5, BR-34) — status efektif sesi
 * (lib/shared/statusSesi.ts) dan batas hari kalender WIB (lib/shared/hariWib.ts).
 * Murni fungsi, tanpa database.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hitungStatusSesi, type SesiWaktuRow } from "@/lib/shared/statusSesi";
import { rentangHariWib, tanggalWib } from "@/lib/shared/hariWib";
import { hitungSesiTerkonfirmasi } from "@/lib/shared/progresSesi";

// Ditandai mentor 17 Okt 2026 10:00 WIB = 03:00 UTC.
const DITANDAI = "2026-10-17T03:00:00.000Z";
const BATAS = "2026-10-18T03:00:00.000Z";

function row(extra: Partial<SesiWaktuRow> = {}): SesiWaktuRow {
  return {
    dikonfirmasi_mentor: true,
    dikonfirmasi_mentor_pada: DITANDAI,
    status_siswa: "belum",
    dikonfirmasi_siswa_pada: null,
    ...extra,
  };
}

const at = (iso: string) => new Date(iso);

describe("hitungStatusSesi", () => {
  it("belum ditandai mentor → belum_terjadi, tanpa waktu terkonfirmasi", () => {
    const info = hitungStatusSesi(row({ dikonfirmasi_mentor: false, dikonfirmasi_mentor_pada: null }), at(BATAS));
    assert.deepEqual(info, { status: "belum_terjadi", waktuTerkonfirmasi: null, batasRespons: null });
  });

  it("23:59 sesudah ditandai → masih menunggu_siswa, batasRespons = +24 jam", () => {
    const info = hitungStatusSesi(row(), at("2026-10-18T02:59:00.000Z"));
    assert.deepEqual(info, { status: "menunggu_siswa", waktuTerkonfirmasi: null, batasRespons: BATAS });
  });

  it("1 milidetik sebelum 24 jam → masih menunggu_siswa", () => {
    assert.equal(hitungStatusSesi(row(), at("2026-10-18T02:59:59.999Z")).status, "menunggu_siswa");
  });

  it("tepat 24:00 → terkonfirmasi_otomatis, waktuTerkonfirmasi = penandaan + 24 jam", () => {
    const info = hitungStatusSesi(row(), at(BATAS));
    assert.deepEqual(info, { status: "terkonfirmasi_otomatis", waktuTerkonfirmasi: BATAS, batasRespons: null });
  });

  it("jauh sesudah 24 jam → waktuTerkonfirmasi tetap penandaan + 24 jam (bukan waktu dibaca)", () => {
    const info = hitungStatusSesi(row(), at("2026-11-30T00:00:00.000Z"));
    assert.equal(info.status, "terkonfirmasi_otomatis");
    assert.equal(info.waktuTerkonfirmasi, BATAS);
  });

  it("siswa sudah mengonfirmasi → terkonfirmasi_siswa, waktuTerkonfirmasi = waktu jawaban siswa", () => {
    const dijawab = "2026-10-17T05:30:00.000Z";
    const r = row({ status_siswa: "dikonfirmasi", dikonfirmasi_siswa_pada: dijawab });
    for (const now of ["2026-10-17T06:00:00.000Z", "2026-12-01T00:00:00.000Z"]) {
      assert.deepEqual(hitungStatusSesi(r, at(now)), {
        status: "terkonfirmasi_siswa",
        waktuTerkonfirmasi: dijawab,
        batasRespons: null,
      });
    }
  });

  it("disangkal → disangkal_menunggu_review, tidak pernah jadi otomatis walau lewat 24 jam", () => {
    const r = row({ status_siswa: "disangkal", dikonfirmasi_siswa_pada: "2026-10-17T04:00:00.000Z" });
    assert.deepEqual(hitungStatusSesi(r, at("2026-10-25T00:00:00.000Z")), {
      status: "disangkal_menunggu_review",
      waktuTerkonfirmasi: null,
      batasRespons: null,
    });
  });

  it("ditandai tapi waktu penandaan kosong (data manual) → fail-closed: menunggu_siswa, tidak otomatis", () => {
    const info = hitungStatusSesi(row({ dikonfirmasi_mentor_pada: null }), at("2027-01-01T00:00:00.000Z"));
    assert.deepEqual(info, { status: "menunggu_siswa", waktuTerkonfirmasi: null, batasRespons: null });
  });

  it("aturan progress tidak berubah: menunggu & otomatis terhitung, disangkal & belum ditandai tidak", () => {
    const rows = [
      row(),
      row({ dikonfirmasi_mentor_pada: "2026-10-01T00:00:00.000Z" }),
      row({ status_siswa: "dikonfirmasi", dikonfirmasi_siswa_pada: DITANDAI }),
      row({ status_siswa: "disangkal" }),
      row({ dikonfirmasi_mentor: false, dikonfirmasi_mentor_pada: null }),
    ];
    assert.equal(hitungSesiTerkonfirmasi(rows), 3);
  });
});

describe("hari kalender WIB (batas satu penandaan per hari)", () => {
  it("23:59 WIB dan 00:00 WIB keesokannya beda hari", () => {
    assert.equal(tanggalWib(at("2026-10-17T16:59:59.999Z")), "2026-10-17"); // 23:59:59.999 WIB
    assert.equal(tanggalWib(at("2026-10-17T17:00:00.000Z")), "2026-10-18"); // 00:00 WIB
  });

  it("dini hari WIB (masih tanggal kemarin di UTC) tetap tanggal WIB", () => {
    assert.equal(tanggalWib(at("2026-10-17T20:30:00.000Z")), "2026-10-18"); // 03:30 WIB
  });

  it("rentang hari = [00:00 WIB, 00:00 WIB besok) dalam UTC", () => {
    assert.deepEqual(rentangHariWib(at("2026-10-18T02:00:00.000Z")), {
      mulai: "2026-10-17T17:00:00.000Z",
      akhir: "2026-10-18T17:00:00.000Z",
    });
  });

  it("penandaan 23:59 WIB tidak memblokir penandaan 00:00 WIB berikutnya", () => {
    const penandaan = Date.parse("2026-10-17T16:59:00.000Z"); // 17 Okt 23:59 WIB
    const besok = rentangHariWib(at("2026-10-17T17:00:00.000Z")); // 18 Okt 00:00 WIB
    assert.ok(penandaan < Date.parse(besok.mulai));
    const hariSama = rentangHariWib(at("2026-10-17T16:59:30.000Z"));
    assert.ok(penandaan >= Date.parse(hariSama.mulai) && penandaan < Date.parse(hariSama.akhir));
  });
});
