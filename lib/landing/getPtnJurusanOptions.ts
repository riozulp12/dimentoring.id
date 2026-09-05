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

function fetchPage(from: number) {
  return supabaseServer
    .from("ptn_jurusan")
    .select("id, nama_universitas, nama_jurusan, jenjang, jalur")
    // nama_universitas saja tidak unik (banyak baris jurusan per universitas)
    // — tiebreaker "id" wajib supaya urutan antar-halaman deterministik saat
    // di-fetch BARENGAN (tanpa ini, halaman paralel bisa tumpang tindih/
    // bolong kalau PostgREST menata baris kembar secara berbeda per request).
    .order("nama_universitas", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
}

export async function getPtnJurusanOptions(): Promise<PtnJurusanOptionRow[]> {
  // 7700+ baris jelas lewat batas 1000/request, jadi tetap wajib paginate —
  // tapi HALAMANNYA independen satu sama lain, jadi tidak perlu ditunggu
  // bergantian (dulu ~8 round-trip berurutan). Ambil total baris dulu (count
  // head-only, murah), baru tembak semua halaman via Promise.all.
  const { count, error: countError } = await supabaseServer
    .from("ptn_jurusan")
    .select("id", { count: "exact", head: true });

  if (countError || count === null) {
    console.error("[getPtnJurusanOptions] count query failed:", countError);
    return [];
  }

  const pageCount = Math.ceil(count / PAGE_SIZE);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => fetchPage(i * PAGE_SIZE)),
  );

  const rows: RawRow[] = [];
  for (const { data, error } of pages) {
    if (error) {
      console.error("[getPtnJurusanOptions] query ptn_jurusan failed:", error);
      continue;
    }
    if (data) rows.push(...(data as RawRow[]));
  }

  return rows.map((row) => ({
    id: row.id,
    namaUniversitas: row.nama_universitas,
    namaJurusan: row.nama_jurusan,
    jenjang: row.jenjang,
    jalur: row.jalur as PtnJurusanOptionRow["jalur"],
  }));
}
