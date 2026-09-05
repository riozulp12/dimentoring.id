import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Validasi body request Tambah/Edit data PTN (ptn_jurusan) — dipakai bersama
 * oleh app/api/kelola-assessment/route.ts (POST), .../[id]/route.ts (PATCH),
 * dan .../import-csv/route.ts (tiap baris CSV) supaya aturan sama persis di
 * semua jalur, tidak duplikasi logic. PRD Bagian 7.4.2, 7.4.4 FR-3.9, Bagian 13.
 */

const VALID_JENJANG = ["S1", "D3", "D4"];
const VALID_JALUR = ["snbp", "snbt", "mandiri"];
const VALID_RUMPUN = ["saintek", "soshum"];
const CURRENT_YEAR = new Date().getFullYear();

export interface PtnJurusanInputBody {
  namaUniversitas?: string;
  namaJurusan?: string;
  jenjang?: string;
  provinsiId?: string;
  kuotaTahunBerjalan?: number | string;
  jumlahPeminatTahunLalu?: number | string;
  jalur?: string;
  rumpun?: string;
  tahunData?: number | string;
  sumberData?: string;
  rataRataNilaiDiterima?: number | string | null;
}

export interface ValidatedPtnJurusanInput {
  nama_universitas: string;
  nama_jurusan: string;
  jenjang: string;
  provinsi_id: string;
  kuota_tahun_berjalan: number;
  jumlah_peminat_tahun_lalu: number;
  jalur: string;
  rumpun: string;
  tahun_data: number;
  sumber_data: string;
  rata_rata_nilai_diterima: number | null;
}

export type ValidatePtnJurusanResult =
  | { ok: true; data: ValidatedPtnJurusanInput }
  | { ok: false; error: string };

export async function validatePtnJurusanInput(body: PtnJurusanInputBody): Promise<ValidatePtnJurusanResult> {
  const namaUniversitas = typeof body.namaUniversitas === "string" ? body.namaUniversitas.trim() : "";
  if (!namaUniversitas) return { ok: false, error: "Nama universitas wajib diisi." };

  const namaJurusan = typeof body.namaJurusan === "string" ? body.namaJurusan.trim() : "";
  if (!namaJurusan) return { ok: false, error: "Nama jurusan wajib diisi." };

  if (!body.jenjang || !VALID_JENJANG.includes(body.jenjang)) {
    return { ok: false, error: "Jenjang tidak valid (harus S1/D3/D4)." };
  }

  if (!body.jalur || !VALID_JALUR.includes(body.jalur)) {
    return { ok: false, error: "Jalur tidak valid (harus SNBP/SNBT/Mandiri)." };
  }

  if (!body.rumpun || !VALID_RUMPUN.includes(body.rumpun)) {
    return { ok: false, error: "Rumpun tidak valid (harus Saintek/Soshum)." };
  }

  if (!body.provinsiId || typeof body.provinsiId !== "string") {
    return { ok: false, error: "Provinsi wajib dipilih." };
  }
  const { data: provinsi, error: provinsiError } = await supabaseServer
    .from("provinsi")
    .select("id")
    .eq("id", body.provinsiId)
    .maybeSingle();
  if (provinsiError) {
    console.error("[validatePtnJurusanInput] query provinsi failed:", provinsiError);
    return { ok: false, error: "Gagal memvalidasi provinsi. Coba lagi nanti." };
  }
  if (!provinsi) return { ok: false, error: "Provinsi tidak ditemukan." };

  const kuota = Number(body.kuotaTahunBerjalan);
  if (!Number.isInteger(kuota) || kuota <= 0) {
    return { ok: false, error: "Kuota tahun berjalan harus angka bulat lebih dari 0." };
  }

  const peminat = Number(body.jumlahPeminatTahunLalu);
  if (!Number.isInteger(peminat) || peminat < 0) {
    return { ok: false, error: "Jumlah peminat tahun lalu harus angka bulat 0 atau lebih." };
  }

  const tahunData = Number(body.tahunData);
  if (!Number.isInteger(tahunData) || tahunData < 2000 || tahunData > CURRENT_YEAR + 1) {
    return { ok: false, error: "Tahun data tidak valid." };
  }

  const sumberData = typeof body.sumberData === "string" && body.sumberData.trim() ? body.sumberData.trim() : "input_manual_admin";

  let rataRataNilaiDiterima: number | null = null;
  if (body.rataRataNilaiDiterima !== undefined && body.rataRataNilaiDiterima !== null && body.rataRataNilaiDiterima !== "") {
    const parsed = Number(body.rataRataNilaiDiterima);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return { ok: false, error: "Rata-rata nilai diterima harus angka 0-100." };
    }
    rataRataNilaiDiterima = parsed;
  }

  return {
    ok: true,
    data: {
      nama_universitas: namaUniversitas,
      nama_jurusan: namaJurusan,
      jenjang: body.jenjang,
      provinsi_id: body.provinsiId,
      kuota_tahun_berjalan: kuota,
      jumlah_peminat_tahun_lalu: peminat,
      jalur: body.jalur,
      rumpun: body.rumpun,
      tahun_data: tahunData,
      sumber_data: sumberData,
      rata_rata_nilai_diterima: rataRataNilaiDiterima,
    },
  };
}
