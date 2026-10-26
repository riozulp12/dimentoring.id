/**
 * Test saran jurusan/universitas (lib/shared/saranJurusan.ts) dan penyaring
 * catatan (lib/shared/catatanAssessment.ts). Modul murni, tanpa DB.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterKandidat,
  hitungSaranJurusan,
  kalimatSaran,
  kalimatTanpaSaran,
  tentukanModeSaran,
  tingkatKeketatan,
  type ProdiSaran,
} from "@/lib/shared/saranJurusan";
import { CATATAN_CADANGAN, rapikanCatatan } from "@/lib/shared/catatanAssessment";

let seq = 0;
function prodi(
  namaUniversitas: string,
  namaJurusan: string,
  keketatanScore: number,
  ubah: Partial<ProdiSaran> = {},
): ProdiSaran {
  seq += 1;
  return {
    id: `id-${seq}`,
    namaUniversitas,
    namaJurusan,
    jenjang: "S1",
    rumpun: "saintek",
    keketatanScore,
    ...ubah,
  };
}

// Tingkat (ambang dari getKeketatanLabel): <=9 SK(0), <=17 K(1), <=25 S(2), <=30 L(3), >30 SL(4).
describe("tingkatKeketatan", () => {
  it("mengikuti ambang yang sudah ada", () => {
    assert.equal(tingkatKeketatan(2.32), 0);
    assert.equal(tingkatKeketatan(9), 0);
    assert.equal(tingkatKeketatan(9.01), 1);
    assert.equal(tingkatKeketatan(17.01), 2);
    assert.equal(tingkatKeketatan(25.01), 3);
    assert.equal(tingkatKeketatan(30.01), 4);
  });
});

describe("tentukanModeSaran", () => {
  it("(a) universitas sama, jurusan beda", () => {
    assert.equal(tentukanModeSaran([prodi("UI", "Kedokteran", 2), prodi("UI", "Farmasi", 5)]), "universitas_sama");
  });
  it("(b) jurusan sama, universitas beda", () => {
    assert.equal(tentukanModeSaran([prodi("UI", "Kedokteran", 2), prodi("UGM", "Kedokteran", 3)]), "jurusan_sama");
  });
  it("(c) beda keduanya", () => {
    assert.equal(tentukanModeSaran([prodi("UI", "Kedokteran", 2), prodi("UGM", "Hukum", 3)]), "rumpun_sama");
  });
  it("(d) identik diperlakukan seperti (a)", () => {
    assert.equal(tentukanModeSaran([prodi("UI", "Kedokteran", 2), prodi("UI", "Kedokteran", 2)]), "universitas_sama");
  });
  it("satu pilihan memakai aturan rumpun", () => {
    assert.equal(tentukanModeSaran([prodi("UI", "Kedokteran", 2)]), "rumpun_sama");
  });
  it("nama dibandingkan tanpa peduli huruf besar/spasi", () => {
    assert.equal(tentukanModeSaran([prodi("UI", "Kedokteran", 2), prodi(" ui ", "Farmasi", 5)]), "universitas_sama");
  });
});

describe("filterKandidat", () => {
  it("mengarahkan query sesuai mode", () => {
    assert.deepEqual(filterKandidat([prodi("UI", "A", 2), prodi("UI", "B", 2)]), { kolom: "nama_universitas", nilai: ["UI"] });
    assert.deepEqual(filterKandidat([prodi("UI", "A", 2), prodi("UGM", "A", 2)]), { kolom: "nama_jurusan", nilai: ["A"] });
    assert.deepEqual(
      filterKandidat([prodi("UI", "A", 2), prodi("UGM", "B", 2, { rumpun: "soshum" })]),
      { kolom: "rumpun", nilai: ["saintek", "soshum"] },
    );
  });
});

describe("hitungSaranJurusan aturan (a): universitas sama", () => {
  const p1 = prodi("UI", "Kedokteran", 2.32);
  const p2 = prodi("UI", "Farmasi", 12);
  const kandidat = [
    prodi("UI", "Kedokteran", 15, { jenjang: "D3" }), // jurusan input (jenjang lain): dilarang
    prodi("UI", "Farmasi", 20), // jurusan input: dilarang
    prodi("UGM", "Biologi", 12), // universitas lain: bukan mode (a)
    prodi("UI", "Fisika", 13), // K, serumpun
    prodi("UI", "Kimia", 21), // S, serumpun
    prodi("UI", "Statistika", 35), // SL, terlalu longgar untuk p1
    prodi("UI", "Sastra Jawa", 28, { rumpun: "soshum" }), // L, rumpun lain
  ];
  const hasil = hitungSaranJurusan([p1, p2], kandidat);

  it("universitas sama, jurusan di luar kedua input", () => {
    for (const h of hasil) {
      assert.ok(h.saran);
      assert.equal(h.saran.namaUniversitas, "UI");
      assert.ok(!["kedokteran", "farmasi"].includes(h.saran.namaJurusan.toLowerCase()));
    }
  });
  it("pilihan sangat ketat dapat 1 tingkat lebih longgar (ketat) lebih dulu", () => {
    assert.equal(hasil[0].saran?.namaJurusan, "Fisika");
  });
  it("pilihan ketat dapat sedang, serumpun diutamakan, dan tidak sama dengan saran pilihan 1", () => {
    assert.equal(hasil[1].saran?.namaJurusan, "Kimia");
  });
  it("boleh rumpun lain bila serumpun tidak ada dalam batas", () => {
    const h = hitungSaranJurusan(
      [prodi("UI", "Kedokteran", 20), prodi("UI", "Farmasi", 21)],
      [prodi("UI", "Fisika", 18), prodi("UI", "Sastra Jawa", 28, { rumpun: "soshum" })], // Fisika: tingkat sama, tidak lolos,
    );
    assert.equal(h[0].saran?.namaJurusan, "Sastra Jawa");
  });
});

describe("hitungSaranJurusan aturan (b): jurusan sama", () => {
  it("jurusan sama di universitas lain, lebih longgar", () => {
    const p1 = prodi("UI", "Kedokteran", 3);
    const p2 = prodi("UGM", "Kedokteran", 4);
    const hasil = hitungSaranJurusan(
      [p1, p2],
      [
        prodi("UI", "Kedokteran", 3), // sama dengan input (id lain, tahun lain): dilarang
        prodi("UNDIP", "Kedokteran", 8), // SK, belum lebih longgar
        prodi("UNAIR", "Kedokteran", 14), // K
        prodi("UNS", "Kedokteran", 22), // S
        prodi("UNPAD", "Farmasi", 14), // jurusan lain: bukan mode (b)
      ],
    );
    assert.equal(hasil[0].saran?.namaUniversitas, "UNAIR");
    assert.equal(hasil[1].saran?.namaUniversitas, "UNS");
    for (const h of hasil) assert.equal(h.saran?.namaJurusan, "Kedokteran");
  });
});

describe("hitungSaranJurusan aturan (c): beda jurusan & universitas", () => {
  it("tiap pilihan dapat saran serumpun masing-masing", () => {
    const p1 = prodi("UI", "Kedokteran", 3, { rumpun: "saintek" });
    const p2 = prodi("UGM", "Hukum", 4, { rumpun: "soshum" });
    const hasil = hitungSaranJurusan(
      [p1, p2],
      [
        prodi("ITB", "Fisika", 13, { rumpun: "saintek" }),
        prodi("UNPAD", "Ekonomi", 12, { rumpun: "soshum" }),
      ],
    );
    assert.equal(hasil[0].saran?.rumpun, "saintek");
    assert.equal(hasil[1].saran?.rumpun, "soshum");
  });
});

describe("aturan (c): prioritas kedekatan", () => {
  it("jurusan sama di kampus lain, lalu kampus sama, baru lainnya", () => {
    const p = prodi("ITS", "Informatika", 4);
    const lain = prodi("UM", "Biologi", 13);
    const kampusSama = prodi("ITS", "Fisika", 13);
    const jurusanSama = prodi("UB", "Informatika", 14);
    assert.equal(hitungSaranJurusan([p], [lain, kampusSama, jurusanSama])[0].saran?.id, jurusanSama.id);
    assert.equal(hitungSaranJurusan([p], [lain, kampusSama])[0].saran?.id, kampusSama.id);
    assert.equal(hitungSaranJurusan([p], [lain])[0].saran?.id, lain.id);
  });
});

describe("hitungSaranJurusan aturan (d): pilihan identik", () => {
  it("diperlakukan seperti (a): kampus sama, jurusan lain", () => {
    const p = prodi("UI", "Kedokteran", 3);
    const hasil = hitungSaranJurusan([p, { ...p }], [prodi("UI", "Fisika", 13), prodi("ITB", "Fisika", 13)]);
    assert.equal(hasil[0].mode, "universitas_sama");
    assert.equal(hasil[0].saran?.namaUniversitas, "UI");
  });
});

describe("batas jarak keketatan", () => {
  const pool = [
    prodi("A", "J1", 5), // SK
    prodi("A", "J2", 13), // K
    prodi("A", "J3", 21), // S
    prodi("A", "J4", 27), // L
    prodi("A", "J5", 40), // SL
  ];

  it("input sangat ketat tidak pernah dapat longgar atau sangat longgar", () => {
    const hanyaLonggar = [prodi("A", "J4", 27), prodi("A", "J5", 40), prodi("A", "J6", 80)];
    const hasil = hitungSaranJurusan([prodi("X", "Kedokteran", 2.32)], hanyaLonggar);
    assert.equal(hasil[0].saran, null);
    assert.equal(hasil[0].alasanKosong, "tidak_ada_kandidat");
  });

  it("maksimal 2 tingkat lebih longgar untuk tiap tingkat input", () => {
    for (const score of [2.32, 13, 21, 27]) {
      const hasil = hitungSaranJurusan([prodi("X", "Kedokteran", score)], pool);
      const saran = hasil[0].saran;
      assert.ok(saran, `harus ada saran untuk ${score}`);
      const jarak = tingkatKeketatan(saran.keketatanScore) - tingkatKeketatan(score);
      assert.ok(jarak >= 1 && jarak <= 2, `jarak ${jarak} untuk input ${score}`);
    }
  });

  it("tingkat yang sama (walau persentase lebih besar) bukan saran", () => {
    const hasil = hitungSaranJurusan([prodi("X", "Kedokteran", 2)], [prodi("A", "J1", 8.9)]);
    assert.equal(hasil[0].saran, null);
  });

  it("memakai kandidat 2 tingkat bila yang 1 tingkat tidak ada", () => {
    const hasil = hitungSaranJurusan([prodi("X", "Kedokteran", 2)], [prodi("A", "J3", 21), prodi("A", "J5", 40)]);
    assert.equal(hasil[0].saran?.namaJurusan, "J3");
  });

  it("pilihan yang sudah paling longgar tidak dicarikan saran", () => {
    const hasil = hitungSaranJurusan([prodi("X", "Kedokteran", 45)], pool);
    assert.equal(hasil[0].saran, null);
    assert.equal(hasil[0].alasanKosong, "sudah_paling_longgar");
  });

  it("tidak ada kandidat sama sekali", () => {
    const hasil = hitungSaranJurusan([prodi("X", "Kedokteran", 5)], []);
    assert.equal(hasil[0].saran, null);
    assert.equal(hasil[0].alasanKosong, "tidak_ada_kandidat");
  });
});

describe("tidak menyarankan pilihan yang sudah diinput", () => {
  it("menolak id input dan prodi yang sama (beda id)", () => {
    const p1 = prodi("UI", "Kedokteran", 3);
    const p2 = prodi("UI", "Farmasi", 4);
    const hasil = hitungSaranJurusan([p1, p2], [p1, p2, prodi("UI", "Farmasi", 14, { id: "lain" })]);
    for (const h of hasil) assert.equal(h.saran, null);
  });
});

describe("preferensi kandidat", () => {
  it("jenjang sama diutamakan", () => {
    const hasil = hitungSaranJurusan(
      [prodi("X", "Kedokteran", 3)],
      [prodi("A", "Fisika", 13, { jenjang: "D3" }), prodi("B", "Kimia", 21)],
    );
    assert.equal(hasil[0].saran?.namaJurusan, "Kimia");
  });
  it("dalam satu tingkat, yang paling khas diutamakan, bukan yang paling longgar", () => {
    const hasil = hitungSaranJurusan(
      [prodi("X", "Kedokteran", 3)],
      [prodi("A", "J1", 16.9), prodi("A", "J2", 13.2), prodi("A", "J3", 9.1)],
    );
    assert.equal(hasil[0].saran?.namaJurusan, "J2");
  });
});

describe("kalimat saran", () => {
  it("menyesuaikan hubungan dengan pilihan asal dan tanpa strip", () => {
    const a = kalimatSaran({ namaUniversitas: "UI", namaJurusan: "A" }, { namaUniversitas: "UI", namaJurusan: "B" });
    const b = kalimatSaran({ namaUniversitas: "UI", namaJurusan: "A" }, { namaUniversitas: "UGM", namaJurusan: "A" });
    const c = kalimatSaran({ namaUniversitas: "UI", namaJurusan: "A" }, { namaUniversitas: "UGM", namaJurusan: "B" });
    assert.match(a, /Masih di UI/);
    assert.match(b, /Jurusannya sama/);
    assert.match(c, /satu rumpun/);
    for (const t of [a, b, c, kalimatTanpaSaran("sudah_paling_longgar"), kalimatTanpaSaran("tidak_ada_kandidat")]) {
      assert.doesNotMatch(t, /[—–]| - /);
    }
  });
});

describe("rapikanCatatan", () => {
  it("membuang em dash dan en dash sebagai jeda kalimat", () => {
    assert.equal(
      rapikanCatatan("Nilai kamu 88 — sudah Tinggi – tapi pilihannya Sangat Ketat."),
      "Nilai kamu 88, sudah Tinggi, tapi pilihannya Sangat Ketat.",
    );
  });
  it("membuang strip berspasi dan strip ganda", () => {
    assert.equal(rapikanCatatan("Tetap latihan - pelan-pelan saja -- pasti ada hasilnya."), "Tetap latihan, pelan-pelan saja, pasti ada hasilnya.");
  });
  it("strip di akhir kalimat tidak meninggalkan koma", () => {
    assert.equal(rapikanCatatan("Coba latihan dulu —."), "Coba latihan dulu.");
    assert.equal(rapikanCatatan("Coba latihan dulu —"), "Coba latihan dulu");
  });
  it("membuang bullet di awal baris", () => {
    assert.equal(rapikanCatatan("- Latihan rutin.\n• Ikut tryout."), "Latihan rutin.\nIkut tryout.");
  });
  it("aman untuk kata ulang, nama, dan kode", () => {
    const teks = "Kira-kira peluangmu di Al-Azhar dan UIN Syarif Hidayatullah, prodi S1-Terapan, masih terbuka.";
    assert.equal(rapikanCatatan(teks), teks);
  });
  it("aman untuk angka, persen desimal, dan rentang", () => {
    assert.equal(rapikanCatatan("Keketatan 2,32% ke kisaran 7-13% atau 7 - 13%."), "Keketatan 2,32% ke kisaran 7-13% atau 7 - 13%.");
    assert.equal(rapikanCatatan("Data 2025–2026 dipakai."), "Data 2025–2026 dipakai.");
    assert.equal(rapikanCatatan("Skormu turun -5 poin."), "Skormu turun -5 poin.");
  });
  it("idempoten dan teks cadangan sudah bersih", () => {
    const sekali = rapikanCatatan("A — B - C.");
    assert.equal(rapikanCatatan(sekali), sekali);
    assert.equal(rapikanCatatan(CATATAN_CADANGAN), CATATAN_CADANGAN);
    assert.doesNotMatch(CATATAN_CADANGAN, /[—–]| - /);
  });
  it("teks kosong tetap kosong", () => {
    assert.equal(rapikanCatatan(""), "");
  });
});
