import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import {
  PER_HALAMAN,
  ringkasBatch,
  type BacaanBatchBaris,
  type BatchBaris,
  type BatchRingkas,
  type FilterBank,
  type SoalBatchBaris,
} from "@/lib/shared/studio-soal/bankSoal";
import { penandaGambar } from "@/lib/shared/studio-soal/gambar";
import { cuplikRedaksi } from "@/lib/shared/studio-soal/studioMentor";
import { KATEGORI_SUBTES_SNBT, type BlokStimulus, type TipeSoal } from "@/lib/shared/studio-soal/tipe";

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
    semuaBarisBatch<SoalBatchBaris>("soal_bank", "id, impor_batch_id, status, stimulus_id, menggantikan_id", ids),
    semuaBarisBatch<BacaanBatchBaris>("soal_stimulus", "id, impor_batch_id, status", ids),
  ]);
  if (soal === "gagal" || bacaan === "gagal") return "gagal";
  return ringkasBatch(batch, soal, bacaan);
}

// ---------------------------------------------------------------------------
// Daftar & detail soal
// ---------------------------------------------------------------------------

export interface OpsiFilterBank {
  subtes: { id: string; nama: string }[];
  topik: { id: string; subtes_id: string; nama: string }[];
  batch: { id: string; nama_berkas: string; dibuat_pada: string }[];
}

export async function getOpsiFilter(): Promise<OpsiFilterBank | "gagal"> {
  const [subtes, topik, batch] = await Promise.all([
    supabaseServer.from("subtes").select("id, nama").in("kategori", [...KATEGORI_SUBTES_SNBT]).order("nama"),
    supabaseServer.from("soal_topik").select("id, subtes_id, nama").order("nama"),
    supabaseServer.from("soal_impor_batch").select("id, nama_berkas, dibuat_pada").order("dibuat_pada", { ascending: false }).limit(200),
  ]);
  const galat = subtes.error ?? topik.error ?? batch.error;
  if (galat) {
    console.error("[admin/bank-soal] baca referensi gagal:", galat);
    return "gagal";
  }
  return {
    subtes: (subtes.data ?? []) as OpsiFilterBank["subtes"],
    topik: (topik.data ?? []) as OpsiFilterBank["topik"],
    batch: (batch.data ?? []) as OpsiFilterBank["batch"],
  };
}

export interface SoalDaftar {
  id: string;
  subtes: string;
  topik: string | null;
  tipe: string;
  kesulitan: string;
  status: string;
  sumber: string;
  versi: number;
  redaksi: string;
  batch: string | null;
  dibuatPada: string;
}
export interface DaftarBankSoal {
  baris: SoalDaftar[];
  total: number;
  hal: number;
  jumlahHalaman: number;
}

interface BarisDaftarDb {
  id: string;
  subtes_id: string;
  topik_id: string | null;
  tipe: string;
  tingkat_kesulitan: string;
  status: string;
  sumber: string;
  versi: number;
  redaksi: string;
  impor_batch_id: string | null;
  created_at: string;
}

/** % _ \ dicari harfiah; * adalah alias % di PostgREST, jadi diganti spasi. */
const polaCari = (q: string) => `%${q.replace(/\*/g, " ").replace(/[\\%_]/g, "\\$&")}%`;

async function queryDaftar(filter: FilterBank, hal: number) {
  let q = supabaseServer
    .from("soal_bank")
    .select("id, subtes_id, topik_id, tipe, tingkat_kesulitan, status, sumber, versi, redaksi, impor_batch_id, created_at", {
      count: "exact",
    });
  const sama: [string, string][] = [
    ["subtes_id", filter.subtes],
    ["topik_id", filter.topik],
    ["tipe", filter.jenis],
    ["tingkat_kesulitan", filter.kesulitan],
    ["status", filter.status],
    ["impor_batch_id", filter.batch],
  ];
  for (const [kolom, nilai] of sama) if (nilai) q = q.eq(kolom, nilai);
  if (filter.q) q = q.ilike("redaksi", polaCari(filter.q));
  const dari = (hal - 1) * PER_HALAMAN;
  return q.order("created_at", { ascending: false }).order("id").range(dari, dari + PER_HALAMAN - 1);
}

export async function getBankSoal(filter: FilterBank): Promise<DaftarBankSoal | "gagal"> {
  const referensi = await getOpsiFilter();
  if (referensi === "gagal") return "gagal";
  let hal = filter.hal;
  let hasil = await queryDaftar(filter, hal);
  // Halaman di luar jangkauan (mis. sesudah menghapus): kembali ke halaman 1.
  if (hasil.error?.code === "PGRST103" || (!hasil.error && hal > 1 && (hasil.data?.length ?? 0) === 0)) {
    hal = 1;
    hasil = await queryDaftar(filter, hal);
  }
  if (hasil.error) {
    console.error("[admin/bank-soal] baca soal gagal:", hasil.error);
    return "gagal";
  }
  const rows = (hasil.data ?? []) as BarisDaftarDb[];
  const nama = (daftar: { id: string; nama: string }[], id: string | null) => daftar.find((x) => x.id === id)?.nama ?? null;
  // Batch di luar 200 pilihan terbaru tetap diberi nama.
  const namaBatch = new Map(referensi.batch.map((b) => [b.id, b.nama_berkas]));
  const kurang = [...new Set(rows.flatMap((r) => (r.impor_batch_id && !namaBatch.has(r.impor_batch_id) ? [r.impor_batch_id] : [])))];
  if (kurang.length > 0) {
    const { data } = await supabaseServer.from("soal_impor_batch").select("id, nama_berkas").in("id", kurang);
    for (const b of (data ?? []) as { id: string; nama_berkas: string }[]) namaBatch.set(b.id, b.nama_berkas);
  }
  const total = hasil.count ?? rows.length;
  return {
    total,
    hal,
    jumlahHalaman: Math.max(1, Math.ceil(total / PER_HALAMAN)),
    baris: rows.map((r) => ({
      id: r.id,
      subtes: nama(referensi.subtes, r.subtes_id) ?? "—",
      topik: nama(referensi.topik, r.topik_id),
      tipe: r.tipe,
      kesulitan: r.tingkat_kesulitan,
      status: r.status,
      sumber: r.sumber,
      versi: r.versi,
      redaksi: cuplikRedaksi(penandaGambar(r.redaksi).reduce((t, kode) => t.replace(`{{${kode}}}`, "[gambar]"), r.redaksi)),
      batch: r.impor_batch_id ? (namaBatch.get(r.impor_batch_id) ?? "—") : null,
      dibuatPada: r.created_at,
    })),
  };
}

export interface DetailSoalAdmin {
  soal: {
    id: string;
    keluarga_id: string;
    versi: number;
    menggantikan_id: string | null;
    subtes_id: string;
    topik_id: string | null;
    stimulus_id: string | null;
    tipe: TipeSoal;
    redaksi: string;
    konten: Record<string, unknown>;
    kunci: Record<string, unknown>;
    pembahasan: string;
    sumber_rujukan: string | null;
    tingkat_kesulitan: string;
    level_kognitif: number | null;
    estimasi_waktu_detik: number | null;
    status: string;
    sumber: string;
    updated_at: string;
  };
  subtes: { id: string; nama: string; kategori: string };
  topik: string | null;
  bacaan: { id: string; judul: string; status: string; blok: BlokStimulus[] } | null;
  /** Draf versi lain dari soal yang sama, bila ada. */
  versiTerbuka: string | null;
}

/** null = soal tidak ada. */
export async function getDetailSoalAdmin(id: string): Promise<DetailSoalAdmin | null | "gagal"> {
  const gagal = (galat: unknown) => {
    console.error("[admin/bank-soal] baca detail gagal:", galat);
    return "gagal" as const;
  };
  const { data: soal, error } = await supabaseServer
    .from("soal_bank")
    .select(
      "id, keluarga_id, versi, menggantikan_id, subtes_id, topik_id, stimulus_id, tipe, redaksi, konten, kunci, pembahasan, sumber_rujukan, tingkat_kesulitan, level_kognitif, estimasi_waktu_detik, status, sumber, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return gagal(error);
  if (!soal) return null;
  const s = soal as DetailSoalAdmin["soal"];
  const [subtes, topik, bacaan, terbuka] = await Promise.all([
    supabaseServer.from("subtes").select("id, nama, kategori").eq("id", s.subtes_id).maybeSingle(),
    s.topik_id ? supabaseServer.from("soal_topik").select("nama").eq("id", s.topik_id).maybeSingle() : null,
    s.stimulus_id
      ? supabaseServer.from("soal_stimulus").select("id, judul_internal, status, konten").eq("id", s.stimulus_id).maybeSingle()
      : null,
    supabaseServer.from("soal_bank").select("id").eq("keluarga_id", s.keluarga_id).eq("status", "draf").neq("id", s.id).limit(1),
  ]);
  const galat = subtes.error ?? topik?.error ?? bacaan?.error ?? terbuka.error;
  if (galat || !subtes.data) return gagal(galat);
  const b = bacaan?.data as { id: string; judul_internal: string; status: string; konten?: { blok?: BlokStimulus[] } } | null | undefined;
  return {
    soal: s,
    subtes: subtes.data as DetailSoalAdmin["subtes"],
    topik: (topik?.data as { nama: string } | null | undefined)?.nama ?? null,
    bacaan: b ? { id: b.id, judul: b.judul_internal, status: b.status, blok: Array.isArray(b.konten?.blok) ? b.konten.blok : [] } : null,
    versiTerbuka: (terbuka.data?.[0] as { id: string } | undefined)?.id ?? null,
  };
}
