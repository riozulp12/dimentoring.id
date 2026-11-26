import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { terjemahkanRpcAdmin, type SoalDilewati } from "@/lib/shared/studio-soal/bankSoal";
import { isUuid } from "@/lib/shared/studio-soal/formSoal";
import { BATAS_TERBIT_IMPOR } from "@/lib/shared/studio-soal/impor";
import { cekSoalLengkap, pesanUnik } from "@/lib/shared/studio-soal/kelengkapan";
import type { TipeSoal } from "@/lib/shared/studio-soal/tipe";

/**
 * Terbitkan DRAF Buatan Sendiri (Admin): satu batch unggahan { batchId, catatan? }
 * atau satu soal dari Bank Soal { soalId, updatedAt? }.
 *
 * Tiap draf divalidasi ulang di sini (mode "ajukan" + rumus) karena draf hasil
 * suntingan bisa belum lengkap; yang tidak lolos dilaporkan, tidak dikirim ke RPC.
 *
 * Draf pertama -> studio_soal_terbitkan_admin (db/add_impor_soal.sql): hanya draf
 * sumber 'buatan_sendiri', dicatat di soal_tinjauan_log. Maks. 200 id per panggilan,
 * jadi batch besar dibagi bergiliran; draf yang sudah terbit tidak disentuh lagi,
 * sehingga mengulang permintaan ini aman. Draf versi baru: satu per satu lewat
 * studio_soal_admin_terbitkan_versi (versi lama -> 'digantikan'); pada terbit batch
 * dilewati supaya suntingan soal terbit tidak ikut terbit tanpa sengaja.
 */

const KOLOM_ISI = [
  "subtes_id",
  "tipe",
  "stimulus_id",
  "redaksi",
  "konten",
  "kunci",
  "pembahasan",
  "sumber_rujukan",
  "tingkat_kesulitan",
  "level_kognitif",
  "estimasi_waktu_detik",
] as const;
const KOLOM_DRAF = ["id", "menggantikan_id", "status", "sumber", "updated_at", ...KOLOM_ISI].join(", ");

interface DrafDb {
  id: string;
  menggantikan_id: string | null;
  status: string;
  sumber: string;
  updated_at: string;
  subtes_id: string;
  tipe: TipeSoal;
  stimulus_id: string | null;
  redaksi: string;
  konten: Record<string, unknown>;
  kunci: Record<string, unknown>;
  pembahasan: string;
  sumber_rujukan: string | null;
  tingkat_kesulitan: string;
  level_kognitif: number | null;
  estimasi_waktu_detik: number | null;
}

const gagal = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status });
const selesai = (diterbitkan: number, bacaanDiterbitkan: number, dilewati: SoalDilewati[], pesan?: string) =>
  NextResponse.json({ success: true, diterbitkan, bacaanDiterbitkan, dilewati, ...(pesan ? { pesan } : {}) });

/** Pesan kekurangan per draf (id tanpa entri = lolos). */
async function periksaKelengkapan(draf: DrafDb[]): Promise<Map<string, string[]> | "gagal"> {
  const kurang = new Map<string, string[]>();
  if (draf.length === 0) return kurang;
  const { data, error } = await supabaseServer
    .from("subtes")
    .select("id, kategori")
    .in("id", [...new Set(draf.map((d) => d.subtes_id))]);
  if (error) {
    console.error("[admin/studio-soal/impor/terbitkan] gagal membaca subtes:", error);
    return "gagal";
  }
  const kategori = new Map(((data ?? []) as { id: string; kategori: string }[]).map((s) => [s.id, s.kategori]));
  for (const d of draf) {
    const errors = cekSoalLengkap(d, kategori.get(d.subtes_id) ?? null);
    if (errors.length > 0) kurang.set(d.id, pesanUnik(errors));
  }
  return kurang;
}

/** Kirim draf pertama yang sudah lolos ke RPC terbit, per potongan; `dilewati` sudah berisi yang gugur. */
async function terbitkanDrafPertama(adminId: string, ids: string[], catatan: string, dilewati: SoalDilewati[]) {
  let diterbitkan = 0;
  let bacaanDiterbitkan = 0;
  for (let i = 0; i < ids.length; i += BATAS_TERBIT_IMPOR) {
    const { data, error } = await supabaseServer.rpc("studio_soal_terbitkan_admin", {
      p_admin_id: adminId,
      p_ids: ids.slice(i, i + BATAS_TERBIT_IMPOR),
      p_catatan: catatan,
    });
    if (error) {
      console.error("[admin/studio-soal/impor/terbitkan] studio_soal_terbitkan_admin failed:", error);
      return gagal(500, "Penerbitan terhenti di tengah jalan. Muat ulang lalu coba lagi — soal yang sudah terbit tidak terbit ganda.", {
        diterbitkan,
        dilewati,
      });
    }
    const r = (data ?? {}) as { status?: unknown; diterbitkan?: unknown; stimulus_diterbitkan?: unknown; dilewati?: unknown };
    if (r.status === "bukan_admin") return gagal(403, "Cuma Admin yang bisa menerbitkan soal.");
    if (r.status !== "selesai") return gagal(400, "Permintaan terbit tidak valid.", { diterbitkan, dilewati });
    diterbitkan += Array.isArray(r.diterbitkan) ? r.diterbitkan.length : 0;
    bacaanDiterbitkan += Array.isArray(r.stimulus_diterbitkan) ? r.stimulus_diterbitkan.length : 0;
    if (Array.isArray(r.dilewati)) {
      for (const d of r.dilewati as { id?: unknown; alasan?: unknown }[]) {
        dilewati.push({ id: String(d.id ?? ""), alasan: String(d.alasan ?? "") });
      }
    }
  }
  return selesai(diterbitkan, bacaanDiterbitkan, dilewati);
}

async function terbitkanSatu(adminId: string, soalId: string, updatedAt: unknown) {
  const { data, error } = await supabaseServer.from("soal_bank").select(KOLOM_DRAF).eq("id", soalId).maybeSingle();
  if (error) {
    console.error("[admin/studio-soal/impor/terbitkan] gagal membaca soal:", error);
    return gagal(500, "Soal belum bisa dibaca. Coba lagi sebentar lagi.");
  }
  const soal = data as unknown as DrafDb | null;
  if (!soal) return gagal(404, "Soal tidak ditemukan. Mungkin sudah dihapus.");
  if (soal.sumber !== "buatan_sendiri") return gagal(403, "Soal buatan mentor hanya bisa dilihat.");
  if (soal.status !== "draf") return gagal(409, "Soal ini sudah bukan draf, jadi tidak bisa diterbitkan lagi. Muat ulang halaman.");
  // Yang diterbitkan harus yang dilihat Admin.
  if (typeof updatedAt === "string" && updatedAt !== soal.updated_at) {
    return gagal(409, terjemahkanRpcAdmin({ status: "sudah_berubah" }).pesan);
  }
  const kurang = await periksaKelengkapan([soal]);
  if (kurang === "gagal") return gagal(500, "Soal belum bisa diperiksa. Coba lagi sebentar lagi.");
  const rincian = kurang.get(soal.id);
  if (rincian) return selesai(0, 0, [{ id: soal.id, alasan: "belum_lengkap", rincian }]);
  if (soal.menggantikan_id === null) return terbitkanDrafPertama(adminId, [soal.id], "Buatan Sendiri: Bank Soal", []);

  const versi = await supabaseServer.rpc("studio_soal_admin_terbitkan_versi", {
    p_admin_id: adminId,
    p_soal_id: soal.id,
    p_updated_at: soal.updated_at,
    p_data: Object.fromEntries(KOLOM_ISI.map((k) => [k, soal[k]])),
  });
  if (versi.error) {
    console.error("[admin/studio-soal/impor/terbitkan] studio_soal_admin_terbitkan_versi failed:", versi.error);
    return gagal(500, "Versi baru belum terbit. Coba lagi sebentar lagi.");
  }
  const t = terjemahkanRpcAdmin((versi.data ?? {}) as Record<string, unknown>);
  return t.success ? selesai(1, 0, [], t.pesan) : gagal(t.httpStatus, t.pesan);
}

async function terbitkanBatch(adminId: string, batchId: string, catatan: string) {
  const { data: batch, error: errBatch } = await supabaseServer
    .from("soal_impor_batch")
    .select("id, nama_berkas")
    .eq("id", batchId)
    .maybeSingle();
  if (errBatch) {
    console.error("[admin/studio-soal/impor/terbitkan] gagal membaca batch:", errBatch);
    return gagal(500, "Batch belum bisa dibaca. Coba lagi sebentar lagi.");
  }
  if (!batch) return gagal(404, "Batch impor tidak ditemukan.");

  const { data, error } = await supabaseServer
    .from("soal_bank")
    .select(KOLOM_DRAF)
    .eq("impor_batch_id", batch.id)
    .eq("status", "draf")
    .eq("sumber", "buatan_sendiri")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1000);
  if (error) {
    console.error("[admin/studio-soal/impor/terbitkan] gagal membaca draf:", error);
    return gagal(500, "Draf batch belum bisa dibaca. Coba lagi sebentar lagi.");
  }
  const draf = (data ?? []) as unknown as DrafDb[];
  if (draf.length === 0) return selesai(0, 0, [], "Tidak ada draf yang menunggu di batch ini.");

  const kurang = await periksaKelengkapan(draf.filter((d) => d.menggantikan_id === null));
  if (kurang === "gagal") return gagal(500, "Draf batch belum bisa diperiksa. Coba lagi sebentar lagi.");
  const lolos: string[] = [];
  const dilewati: SoalDilewati[] = [];
  for (const d of draf) {
    const rincian = kurang.get(d.id);
    if (d.menggantikan_id !== null) dilewati.push({ id: d.id, alasan: "versi_baru" });
    else if (rincian) dilewati.push({ id: d.id, alasan: "belum_lengkap", rincian });
    else lolos.push(d.id);
  }
  const catatanLengkap = `Buatan Sendiri: ${batch.nama_berkas || "soal.csv"}${catatan ? ` — ${catatan}` : ""}`;
  return terbitkanDrafPertama(adminId, lolos, catatanLengkap, dilewati);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return gagal(auth.status, auth.error);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return gagal(400, "Body request harus JSON yang valid.");
  }
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (b.soalId !== undefined) {
    if (!isUuid(b.soalId)) return gagal(400, "Alamat soal tidak valid.");
    return terbitkanSatu(auth.adminId, b.soalId, b.updatedAt);
  }
  if (!isUuid(b.batchId)) return gagal(400, "Batch impor tidak valid.");
  const catatan = typeof b.catatan === "string" ? b.catatan.trim().slice(0, 500) : "";
  return terbitkanBatch(auth.adminId, b.batchId, catatan);
}
