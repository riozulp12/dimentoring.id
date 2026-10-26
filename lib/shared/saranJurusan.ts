import { getKeketatanLabel } from "@/lib/assessment/calculatePeluang";

/**
 * Saran Jurusan & Universitas di hasil Assessment SNBP (revisi v2).
 * Fungsi murni: tanpa DB, tanpa React. Route API cukup mengambil kandidat
 * sesuai `filterKandidat()` lalu memanggil `hitungSaranJurusan()`.
 *
 * Aturan (per pilihan, relatif ke keketatan pilihan itu sendiri):
 * a) Pilihan 1 & 2 universitasnya sama (jurusan beda): universitas yang sama,
 *    jurusan lain di luar kedua input. Diutamakan serumpun; kalau tidak ada
 *    yang serumpun dalam batas keketatan, boleh rumpun lain.
 * b) Jurusannya sama (universitas beda): jurusan yang sama di universitas lain.
 * c) Beda jurusan & beda universitas (atau cuma 1 pilihan): serumpun dengan
 *    pilihan itu (saintek dapat saintek, soshum dapat soshum). Supaya tetap
 *    masuk akal, jurusan yang sama di kampus lain diutamakan, lalu jurusan
 *    lain di kampus yang sama, baru sisanya.
 * d) Kedua pilihan identik: diperlakukan seperti (a).
 * e) Tidak pernah menyarankan prodi yang sudah diinput siswa.
 * f) Saran hanya 1 sampai 2 tingkat lebih longgar, tidak lebih.
 * g) Tidak ada kandidat dalam batas itu: tidak ada saran (bukan loncat ke
 *    yang jauh lebih longgar). Pilihan yang sudah paling longgar tidak
 *    dicarikan yang lebih longgar.
 *
 * Tingkat keketatan memakai getKeketatanLabel (satu-satunya sumber ambang),
 * tidak ada ambang baru di sini.
 */

export type Rumpun = "saintek" | "soshum";

export interface ProdiSaran {
  id: string;
  namaUniversitas: string;
  namaJurusan: string;
  jenjang: string;
  rumpun: Rumpun | string;
  keketatanScore: number;
}

export type ModeSaran = "universitas_sama" | "jurusan_sama" | "rumpun_sama";

export type AlasanTanpaSaran = "sudah_paling_longgar" | "tidak_ada_kandidat";

export interface HasilSaranPilihan {
  urutanPilihan: number;
  mode: ModeSaran;
  saran: ProdiSaran | null;
  /** Diisi kalau `saran` null. */
  alasanKosong: AlasanTanpaSaran | null;
}

/** Urutan tingkat dari paling ketat (0) ke paling longgar (4). */
export const URUTAN_TINGKAT = ["Sangat Ketat", "Ketat", "Sedang", "Longgar", "Sangat Longgar"] as const;

export const JARAK_TINGKAT_MAKS = 2;

export function tingkatKeketatan(score: number): number {
  return URUTAN_TINGKAT.indexOf(getKeketatanLabel(score) as (typeof URUTAN_TINGKAT)[number]);
}

/** Titik tengah tiap tingkat, cuma dipakai untuk MENGURUTKAN kandidat (bukan
 * ambang): saran yang "khas" tingkat itu lebih diutamakan daripada yang
 * mepet batas. Diturunkan dari batas getKeketatanLabel (9/17/25/30). Tingkat
 * paling longgar tidak punya batas atas, jadi patokannya batas bawahnya
 * (yang paling dekat, bukan yang paling ekstrem). */
const PATOKAN_TINGKAT = [4.5, 13, 21, 27.5, 30];

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function kunciProdi(p: Pick<ProdiSaran, "namaUniversitas" | "namaJurusan" | "jenjang">): string {
  return `${norm(p.namaUniversitas)}|${norm(p.namaJurusan)}|${norm(p.jenjang)}`;
}

export function tentukanModeSaran(pilihan: ProdiSaran[]): ModeSaran {
  if (pilihan.length < 2) return "rumpun_sama";
  const [p1, p2] = pilihan;
  if (norm(p1.namaUniversitas) === norm(p2.namaUniversitas)) return "universitas_sama";
  if (norm(p1.namaJurusan) === norm(p2.namaJurusan)) return "jurusan_sama";
  return "rumpun_sama";
}

/** Filter query kandidat untuk route API (kolom ptn_jurusan + nilai `.in()`). */
export function filterKandidat(pilihan: ProdiSaran[]): {
  kolom: "nama_universitas" | "nama_jurusan" | "rumpun";
  nilai: string[];
} {
  const mode = tentukanModeSaran(pilihan);
  const unik = (values: string[]) => [...new Set(values)];
  if (mode === "universitas_sama") return { kolom: "nama_universitas", nilai: unik(pilihan.map((p) => p.namaUniversitas)) };
  if (mode === "jurusan_sama") return { kolom: "nama_jurusan", nilai: unik(pilihan.map((p) => p.namaJurusan)) };
  return { kolom: "rumpun", nilai: unik(pilihan.map((p) => String(p.rumpun))) };
}

function cocokMode(mode: ModeSaran, asal: ProdiSaran, semuaPilihan: ProdiSaran[], k: ProdiSaran): boolean {
  if (mode === "universitas_sama") {
    if (norm(k.namaUniversitas) !== norm(asal.namaUniversitas)) return false;
    // Jurusan lain dari KEDUA input (bukan sekadar jenjang lain dari jurusan yang sama).
    return !semuaPilihan.some((p) => norm(p.namaJurusan) === norm(k.namaJurusan));
  }
  if (mode === "jurusan_sama") {
    if (norm(k.namaJurusan) !== norm(asal.namaJurusan)) return false;
    return !semuaPilihan.some((p) => norm(p.namaUniversitas) === norm(k.namaUniversitas));
  }
  return k.rumpun === asal.rumpun;
}

interface KandidatBernilai {
  prodi: ProdiSaran;
  jarak: number;
  serumpun: boolean;
  jenjangSama: boolean;
  /** Mode (c): 0 = jurusan sama (kampus lain), 1 = kampus sama, 2 = lainnya. */
  kedekatan: number;
  selisihPatokan: number;
}

function bandingkan(a: KandidatBernilai, b: KandidatBernilai): number {
  if (a.serumpun !== b.serumpun) return a.serumpun ? -1 : 1;
  if (a.jenjangSama !== b.jenjangSama) return a.jenjangSama ? -1 : 1;
  if (a.kedekatan !== b.kedekatan) return a.kedekatan - b.kedekatan;
  if (a.jarak !== b.jarak) return a.jarak - b.jarak;
  if (a.selisihPatokan !== b.selisihPatokan) return a.selisihPatokan - b.selisihPatokan;
  return kunciProdi(a.prodi).localeCompare(kunciProdi(b.prodi));
}

export function hitungSaranJurusan(pilihan: ProdiSaran[], kandidat: ProdiSaran[]): HasilSaranPilihan[] {
  const mode = tentukanModeSaran(pilihan);
  const kunciInput = new Set(pilihan.map(kunciProdi));
  const idInput = new Set(pilihan.map((p) => p.id));
  const sudahDisarankan = new Set<string>();

  return pilihan.map((asal, index) => {
    const urutanPilihan = index + 1;
    const tingkatAsal = tingkatKeketatan(asal.keketatanScore);

    if (tingkatAsal >= URUTAN_TINGKAT.length - 1) {
      return { urutanPilihan, mode, saran: null, alasanKosong: "sudah_paling_longgar" as const };
    }

    const lolos: KandidatBernilai[] = [];
    const sudahDilihat = new Set<string>();
    for (const k of kandidat) {
      const kunci = kunciProdi(k);
      if (idInput.has(k.id) || kunciInput.has(kunci) || sudahDilihat.has(kunci)) continue;
      if (!cocokMode(mode, asal, pilihan, k)) continue;
      const tingkat = tingkatKeketatan(k.keketatanScore);
      const jarak = tingkat - tingkatAsal;
      if (jarak < 1 || jarak > JARAK_TINGKAT_MAKS) continue;
      sudahDilihat.add(kunci);
      lolos.push({
        prodi: k,
        jarak,
        // Mode (c) sudah pasti serumpun. Mode (a)/(b): serumpun diutamakan.
        serumpun: k.rumpun === asal.rumpun,
        jenjangSama: norm(k.jenjang) === norm(asal.jenjang),
        kedekatan:
          norm(k.namaJurusan) === norm(asal.namaJurusan) ? 0 : norm(k.namaUniversitas) === norm(asal.namaUniversitas) ? 1 : 2,
        selisihPatokan: Math.abs(k.keketatanScore - PATOKAN_TINGKAT[tingkat]),
      });
    }

    lolos.sort(bandingkan);
    // Hindari dua pilihan dapat saran yang sama persis kalau masih ada
    // alternatif yang sama baiknya dari sisi rumpun (rumpun tetap prioritas).
    const terpilih =
      lolos.find((c) => !sudahDisarankan.has(kunciProdi(c.prodi)) && c.serumpun === lolos[0]?.serumpun) ?? lolos[0];
    if (!terpilih) {
      return { urutanPilihan, mode, saran: null, alasanKosong: "tidak_ada_kandidat" as const };
    }
    sudahDisarankan.add(kunciProdi(terpilih.prodi));
    return { urutanPilihan, mode, saran: terpilih.prodi, alasanKosong: null };
  });
}

/** Kalimat pendek penjelas saran (ditampilkan di bawah kartu saran). */
export function kalimatSaran(asal: Pick<ProdiSaran, "namaUniversitas" | "namaJurusan">, saran: Pick<ProdiSaran, "namaUniversitas" | "namaJurusan">): string {
  if (norm(asal.namaUniversitas) === norm(saran.namaUniversitas)) {
    return `Masih di ${saran.namaUniversitas}, tapi persaingan di jurusan ini sedikit lebih longgar.`;
  }
  if (norm(asal.namaJurusan) === norm(saran.namaJurusan)) {
    return `Jurusannya sama, kampusnya beda. Persaingannya sedikit lebih longgar.`;
  }
  return "Masih satu rumpun dengan pilihanmu, dan persaingannya sedikit lebih longgar.";
}

/** Kalimat jujur saat tidak ada saran untuk sebuah pilihan. */
export function kalimatTanpaSaran(alasan: AlasanTanpaSaran): string {
  if (alasan === "sudah_paling_longgar") {
    return "Pilihan ini sudah termasuk yang paling longgar, jadi nggak perlu dicarikan yang lebih longgar lagi.";
  }
  return "Belum ada saran yang pas untuk pilihan ini. Kami cuma menyarankan yang sedikit lebih longgar, bukan yang jauh berbeda.";
}
