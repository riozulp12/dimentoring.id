import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { calculateKeketatan } from "@/lib/assessment/calculatePeluang";

/**
 * Data layer "Kelola Assessment (Data PTN)" (Admin) — PRD Bagian 7.4.2,
 * BR-28, Bagian 13 (ptn_jurusan, provinsi). Selama ini data ptn_jurusan
 * diinput manual satu-satu lewat SQL Editor — halaman ini jadi jalur CRUD +
 * import massal via CSV yang pertama.
 */

export interface PtnJurusanItem {
  id: string;
  namaUniversitas: string;
  namaJurusan: string;
  jenjang: string;
  provinsiId: string;
  provinsiNama: string;
  kuotaTahunBerjalan: number;
  jumlahPeminatTahunLalu: number;
  /** Dihitung on-the-fly (kuota/peminat*100) — TIDAK disimpan sebagai kolom terpisah. */
  keketatanScore: number;
  keketatanLabel: string;
  jalur: string;
  tahunData: number;
  sumberData: string;
  rataRataNilaiDiterima: number | null;
}

export interface ProvinsiOption {
  id: string;
  nama: string;
}

interface PtnJurusanRow {
  id: string;
  nama_universitas: string;
  nama_jurusan: string;
  jenjang: string;
  provinsi_id: string;
  kuota_tahun_berjalan: number;
  jumlah_peminat_tahun_lalu: number;
  jalur: string;
  tahun_data: number;
  sumber_data: string;
  rata_rata_nilai_diterima: number | null;
  provinsi: { nama: string } | { nama: string }[] | null;
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** List semua data PTN — dipakai halaman Kelola Assessment. Filter/search dilakukan di client (data tidak besar, semua di-fetch sekali). */
export async function getPtnJurusanList(): Promise<PtnJurusanItem[]> {
  const { data, error } = await supabaseServer
    .from("ptn_jurusan")
    .select(
      `id, nama_universitas, nama_jurusan, jenjang, provinsi_id, kuota_tahun_berjalan,
       jumlah_peminat_tahun_lalu, jalur, tahun_data, sumber_data, rata_rata_nilai_diterima,
       provinsi:provinsi_id(nama)`,
    )
    .order("nama_universitas", { ascending: true })
    .order("nama_jurusan", { ascending: true });

  if (error) {
    console.error("[getPtnJurusanList] query failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as PtnJurusanRow[]).map((row) => {
    const provinsi = firstOrNull(row.provinsi);
    const keketatan = calculateKeketatan(row.kuota_tahun_berjalan, row.jumlah_peminat_tahun_lalu);

    return {
      id: row.id,
      namaUniversitas: row.nama_universitas,
      namaJurusan: row.nama_jurusan,
      jenjang: row.jenjang,
      provinsiId: row.provinsi_id,
      provinsiNama: provinsi?.nama ?? "-",
      kuotaTahunBerjalan: row.kuota_tahun_berjalan,
      jumlahPeminatTahunLalu: row.jumlah_peminat_tahun_lalu,
      keketatanScore: keketatan.score,
      keketatanLabel: keketatan.label,
      jalur: row.jalur,
      tahunData: row.tahun_data,
      sumberData: row.sumber_data,
      rataRataNilaiDiterima: row.rata_rata_nilai_diterima,
    };
  });
}

/** Opsi dropdown Provinsi — semua provinsi yang ada. */
export async function getProvinsiOptions(): Promise<ProvinsiOption[]> {
  const { data, error } = await supabaseServer.from("provinsi").select("id, nama").order("nama", { ascending: true });

  if (error) {
    console.error("[getProvinsiOptions] query failed:", error);
    return [];
  }
  return (data ?? []).map((row) => ({ id: row.id as string, nama: row.nama as string }));
}

/** Daftar nama universitas unik yang sudah ada di ptn_jurusan — dipakai dropdown "pilih existing atau tambah baru". */
export async function getUniversitasOptions(): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("ptn_jurusan")
    .select("nama_universitas")
    .order("nama_universitas", { ascending: true });

  if (error) {
    console.error("[getUniversitasOptions] query failed:", error);
    return [];
  }
  return Array.from(new Set((data ?? []).map((row) => row.nama_universitas as string)));
}
