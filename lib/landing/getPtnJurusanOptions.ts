import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Widget Cek Keketatan (landing page) — PRD Bagian 7.4.5/FR-3.11-12. Data
 * dipakai buat isi 3 dropdown berjenjang (Jalur -> Universitas -> Jurusan),
 * jadi butuh SEMUA baris ptn_jurusan (id, nama, jenjang, jalur), bukan cuma
 * daftar universitas — dropdown Jurusan difilter dari data yang sama di
 * client (lihat components/sections/Prediction.tsx).
 *
 * PENTING: proyek Supabase ini pakai batas default PostgREST (max 1000 baris
 * per request) — kalau di-select tanpa .range(), baris di atas 1000 DIAM-DIAM
 * terpotong (sudah diverifikasi: ptn_jurusan sekarang 7700+ baris). Makanya
 * di sini di-paginate pakai .range() sampai semua baris kebaca, BUKAN sekadar
 * naikkan angka .limit() (limit tunggal tetap kena batas 1000 platform).
 */
const PAGE_SIZE = 1000;

export interface PtnJurusanOptionRow {
  id: string;
  namaUniversitas: string;
  namaJurusan: string;
  jenjang: string;
  jalur: "snbp" | "snbt" | "mandiri";
}

interface RawRow {
  id: string;
  nama_universitas: string;
  nama_jurusan: string;
  jenjang: string;
  jalur: string;
}

export async function getPtnJurusanOptions(): Promise<PtnJurusanOptionRow[]> {
  const rows: RawRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabaseServer
      .from("ptn_jurusan")
      .select("id, nama_universitas, nama_jurusan, jenjang, jalur")
      .order("nama_universitas", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("[getPtnJurusanOptions] query ptn_jurusan failed:", error);
      break;
    }
    if (!data || data.length === 0) break;

    rows.push(...(data as RawRow[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows.map((row) => ({
    id: row.id,
    namaUniversitas: row.nama_universitas,
    namaJurusan: row.nama_jurusan,
    jenjang: row.jenjang,
    jalur: row.jalur as PtnJurusanOptionRow["jalur"],
  }));
}
