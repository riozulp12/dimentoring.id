import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { isUuid } from "@/lib/shared/studio-soal/formSoal";
import { BATAS_TERBIT_IMPOR } from "@/lib/shared/studio-soal/impor";

/**
 * Terbitkan semua DRAF sebuah batch unggahan Buatan Sendiri (Admin) lewat RPC
 * studio_soal_terbitkan_admin (db/add_impor_soal.sql): hanya draf sumber
 * 'buatan_sendiri' yang berubah jadi terpublikasi, tiap soal dicatat di
 * soal_tinjauan_log ('terbit_admin_buatan_sendiri'). RPC menerima maks. 200 id per
 * panggilan, jadi batch besar dibagi bergiliran; draf yang sudah terbit tidak
 * disentuh lagi, sehingga mengulang permintaan ini aman.
 *
 * POST { batchId, catatan? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body request harus JSON yang valid." }, { status: 400 });
  }
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (!isUuid(b.batchId)) return NextResponse.json({ success: false, error: "Batch impor tidak valid." }, { status: 400 });
  const catatan = typeof b.catatan === "string" ? b.catatan.trim().slice(0, 500) : "";

  const { data: batch, error: errBatch } = await supabaseServer
    .from("soal_impor_batch")
    .select("id, nama_berkas")
    .eq("id", b.batchId)
    .maybeSingle();
  if (errBatch) {
    console.error("[admin/studio-soal/impor/terbitkan] gagal membaca batch:", errBatch);
    return NextResponse.json({ success: false, error: "Batch belum bisa dibaca. Coba lagi sebentar lagi." }, { status: 500 });
  }
  if (!batch) return NextResponse.json({ success: false, error: "Batch impor tidak ditemukan." }, { status: 404 });

  const { data: draf, error: errDraf } = await supabaseServer
    .from("soal_bank")
    .select("id")
    .eq("impor_batch_id", batch.id)
    .eq("status", "draf")
    .eq("sumber", "buatan_sendiri")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1000);
  if (errDraf) {
    console.error("[admin/studio-soal/impor/terbitkan] gagal membaca draf:", errDraf);
    return NextResponse.json({ success: false, error: "Draf batch belum bisa dibaca. Coba lagi sebentar lagi." }, { status: 500 });
  }
  const ids = (draf ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) {
    return NextResponse.json({ success: true, diterbitkan: 0, bacaanDiterbitkan: 0, dilewati: [], pesan: "Tidak ada draf yang menunggu di batch ini." });
  }

  const catatanLengkap = `Buatan Sendiri: ${batch.nama_berkas || "soal.csv"}${catatan ? ` — ${catatan}` : ""}`;
  let diterbitkan = 0;
  let bacaanDiterbitkan = 0;
  const dilewati: { id: string; alasan: string }[] = [];

  for (let i = 0; i < ids.length; i += BATAS_TERBIT_IMPOR) {
    const potong = ids.slice(i, i + BATAS_TERBIT_IMPOR);
    const { data, error } = await supabaseServer.rpc("studio_soal_terbitkan_admin", {
      p_admin_id: auth.adminId,
      p_ids: potong,
      p_catatan: catatanLengkap,
    });
    if (error) {
      console.error("[admin/studio-soal/impor/terbitkan] studio_soal_terbitkan_admin failed:", error);
      return NextResponse.json(
        { success: false, error: "Penerbitan terhenti di tengah jalan. Muat ulang lalu coba lagi — soal yang sudah terbit tidak terbit ganda.", diterbitkan, dilewati },
        { status: 500 },
      );
    }
    const r = (data ?? {}) as { status?: unknown; diterbitkan?: unknown; stimulus_diterbitkan?: unknown; dilewati?: unknown };
    if (r.status === "bukan_admin") {
      return NextResponse.json({ success: false, error: "Cuma Admin yang bisa menerbitkan soal." }, { status: 403 });
    }
    if (r.status !== "selesai") {
      return NextResponse.json({ success: false, error: "Permintaan terbit tidak valid.", diterbitkan, dilewati }, { status: 400 });
    }
    diterbitkan += Array.isArray(r.diterbitkan) ? r.diterbitkan.length : 0;
    bacaanDiterbitkan += Array.isArray(r.stimulus_diterbitkan) ? r.stimulus_diterbitkan.length : 0;
    if (Array.isArray(r.dilewati)) {
      for (const d of r.dilewati as { id?: unknown; alasan?: unknown }[]) {
        dilewati.push({ id: String(d.id ?? ""), alasan: String(d.alasan ?? "") });
      }
    }
  }

  return NextResponse.json({ success: true, diterbitkan, bacaanDiterbitkan, dilewati });
}
