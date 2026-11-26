import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { ringkasBatch, type BacaanBatchBaris, type BatchBaris, type BatchRingkas, type SoalBatchBaris } from "@/lib/shared/studio-soal/bankSoal";

/** Data halaman Admin "Bank Soal" (hanya baca; semua tulis lewat RPC studio_soal_admin_*). */

export const BATAS_BATCH_TAMPIL = 50;
/** Sama dengan max-rows PostgREST: ambil per halaman sampai habis. */
const UKURAN_HALAMAN_QUERY = 1000;

async function semuaBarisBatch<T>(tabel: "soal_bank" | "soal_stimulus", kolom: string, batchIds: string[]): Promise<T[] | "gagal"> {
  const hasil: T[] = [];
  for (let dari = 0; ; dari += UKURAN_HALAMAN_QUERY) {
    const { data, error } = await supabaseServer
      .from(tabel)
      .select(kolom)
      .in("impor_batch_id", batchIds)
      .order("id")
      .range(dari, dari + UKURAN_HALAMAN_QUERY - 1);
    if (error) {
      console.error(`[admin/bank-soal] baca ${tabel} gagal:`, error);
      return "gagal";
    }
    hasil.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < UKURAN_HALAMAN_QUERY) return hasil;
  }
}

/** Batch impor terbaru beserta jumlah soal per status. */
export async function getBatchImpor(): Promise<BatchRingkas[] | "gagal"> {
  const { data, error } = await supabaseServer
    .from("soal_impor_batch")
    .select("id, nama_berkas, dibuat_pada")
    .order("dibuat_pada", { ascending: false })
    .limit(BATAS_BATCH_TAMPIL);
  if (error) {
    console.error("[admin/bank-soal] baca batch gagal:", error);
    return "gagal";
  }
  const batch = (data ?? []) as BatchBaris[];
  if (batch.length === 0) return [];
  const ids = batch.map((b) => b.id);
  const [soal, bacaan] = await Promise.all([
    semuaBarisBatch<SoalBatchBaris>("soal_bank", "id, impor_batch_id, status, stimulus_id", ids),
    semuaBarisBatch<BacaanBatchBaris>("soal_stimulus", "id, impor_batch_id, status", ids),
  ]);
  if (soal === "gagal" || bacaan === "gagal") return "gagal";
  return ringkasBatch(batch, soal, bacaan);
}
