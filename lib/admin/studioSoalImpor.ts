import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { olahDocx, type GambarSiap, type HasilOlahDocx } from "@/lib/admin/docxIsi";
import { berawalanZip } from "@/lib/admin/docxZip";
import { BUCKET_MEDIA, BUCKET_STAGING, hapusBerkas, unggahGambar, type BarisMedia } from "@/lib/admin/mediaSoal";
import { mediaDariKonten } from "@/lib/shared/studio-soal/gambar";
import {
  bisaSimpan,
  susunImpor,
  type HasilImpor,
  type MasukanImpor,
  type SubtesImpor,
  type TopikImpor,
} from "@/lib/shared/studio-soal/impor";
import { BATAS_BYTE_DOCX } from "@/lib/shared/studio-soal/imporDocx";

/**
 * Sisi server unggah soal massal "Buatan Sendiri" (Admin), jalur CSV dan DOCX.
 * Hasil pratinjau dari klien TIDAK dipercaya: pratinjau & simpan sama-sama
 * menyusun ulang dari berkas yang diunggah, lewat susunImpor() yang sama.
 */

export const BATAS_BYTE_CSV = 2 * 1024 * 1024;
const BATAS_REDAKSI_BANK = 20000;
const MAKS_PESAN = 500;
const POLA_NAMA_STAGING = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.docx$/;

export interface BodyImpor {
  soalCsv: string;
  bacaanCsv: string | null;
  namaBerkas: string;
  lewatiGalat: boolean;
}

export function parseBodyImpor(body: unknown): { ok: true; data: BodyImpor } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "Permintaan tidak valid." };
  const b = body as Record<string, unknown>;
  if (typeof b.soalCsv !== "string" || b.soalCsv.trim() === "") return { ok: false, error: "Berkas soal.csv belum diunggah." };
  if (b.bacaanCsv !== undefined && b.bacaanCsv !== null && typeof b.bacaanCsv !== "string") {
    return { ok: false, error: "Berkas bacaan.csv tidak valid." };
  }
  const bacaanCsv = typeof b.bacaanCsv === "string" && b.bacaanCsv.trim() !== "" ? b.bacaanCsv : null;
  for (const [nama, isi] of [["soal.csv", b.soalCsv], ["bacaan.csv", bacaanCsv]] as const) {
    if (isi === null) continue;
    if (Buffer.byteLength(isi, "utf8") > BATAS_BYTE_CSV) return { ok: false, error: `${nama} terlalu besar (maks. 2 MB).` };
    if (isi.includes("�")) {
      return { ok: false, error: `${nama} bukan UTF-8. Di Excel pilih "CSV UTF-8 (Comma delimited)" saat menyimpan.` };
    }
  }
  const namaBerkas = typeof b.namaBerkas === "string" ? b.namaBerkas.trim().slice(0, 200) : "";
  return { ok: true, data: { soalCsv: b.soalCsv, bacaanCsv, namaBerkas: namaBerkas || "soal.csv", lewatiGalat: b.lewatiGalat === true } };
}

type MasukanBerkas = Pick<
  MasukanImpor,
  "soalCsv" | "bacaanCsv" | "soalBaris" | "bacaanBaris" | "bacaanBlok" | "soalGambar" | "galatTambahan"
>;

/** Susun ulang dari berkas yang diunggah memakai data referensi terbaru dari database. */
export async function susunImporDariDb(masukan: Partial<MasukanBerkas>): Promise<{ ok: true; hasil: HasilImpor } | { ok: false }> {
  const [subtesRes, topikRes, bankRes] = await Promise.all([
    supabaseServer.from("subtes").select("id, nama, kategori"),
    supabaseServer.from("soal_topik").select("id, subtes_id, nama"),
    supabaseServer.from("soal_bank").select("redaksi").neq("status", "diarsipkan").limit(BATAS_REDAKSI_BANK),
  ]);
  if (subtesRes.error || topikRes.error || bankRes.error) {
    console.error("[admin/studio-soal/impor] gagal memuat referensi:", subtesRes.error ?? topikRes.error ?? bankRes.error);
    return { ok: false };
  }
  const hasil = susunImpor({
    soalCsv: masukan.soalCsv ?? "",
    bacaanCsv: masukan.bacaanCsv,
    soalBaris: masukan.soalBaris,
    bacaanBaris: masukan.bacaanBaris,
    bacaanBlok: masukan.bacaanBlok,
    soalGambar: masukan.soalGambar,
    galatTambahan: masukan.galatTambahan,
    subtes: (subtesRes.data ?? []) as SubtesImpor[],
    topik: (topikRes.data ?? []) as TopikImpor[],
    redaksiAda: (bankRes.data ?? []).map((r) => String((r as { redaksi: unknown }).redaksi ?? "")),
  });
  return { ok: true, hasil };
}

export const gagalReferensi = () =>
  NextResponse.json({ success: false, error: "Data subtes belum bisa dimuat. Coba lagi sebentar lagi." }, { status: 500 });

/** Respons pratinjau (kunci jawaban ikut karena hanya Admin yang melihat layar ini). */
export function responsPratinjau(hasil: HasilImpor) {
  const cek = bisaSimpan(hasil, false);
  const cekLewati = bisaSimpan(hasil, true);
  return NextResponse.json({
    success: true,
    ringkasan: hasil.ringkasan,
    gambarBacaan: hasil.gambarBacaan,
    pratinjau: hasil.pratinjau,
    galat: hasil.galat.slice(0, MAKS_PESAN),
    peringatan: hasil.peringatan.slice(0, MAKS_PESAN),
    galatTerpotong: hasil.galat.length > MAKS_PESAN,
    bisaSimpan: cek.ok,
    bisaSimpanLewatiGalat: cekLewati.ok,
    alasanTidakBisa: cek.ok ? null : cek.alasan,
  });
}

/**
 * Simpan hasil susunImpor sebagai DRAF lewat RPC studio_soal_impor_admin (satu
 * transaksi). Gambar yang dipakai soal/bacaan yang disimpan diunggah ke Storage
 * dulu; bila RPC gagal, unggahannya dihapus lagi (best-effort).
 */
export async function simpanBatch(
  adminId: string,
  hasil: HasilImpor,
  namaBerkas: string,
  lewatiGalat: boolean,
  gambar: GambarSiap[] = [],
) {
  const cek = bisaSimpan(hasil, lewatiGalat);
  if (!cek.ok) return NextResponse.json({ success: false, error: cek.alasan }, { status: 422 });

  const dipakai = new Set([...hasil.soal, ...hasil.stimulus].flatMap((x) => mediaDariKonten(x.konten)));
  let media: BarisMedia[] = [];
  if (dipakai.size > 0) {
    const unggahan = await unggahGambar(gambar.filter((g) => dipakai.has(g.media_id)));
    if (!unggahan) {
      return NextResponse.json({ success: false, error: "Gambar belum bisa disimpan. Coba lagi sebentar lagi." }, { status: 500 });
    }
    media = unggahan;
  }

  const { data, error } = await supabaseServer.rpc("studio_soal_impor_admin", {
    p_admin_id: adminId,
    p_batch: {
      nama_berkas: namaBerkas,
      jumlah_baris: hasil.ringkasan.jumlahBaris,
      jumlah_gagal: hasil.ringkasan.jumlahGalat,
      stimulus: hasil.stimulus,
      soal: hasil.soal,
      ...(media.length > 0 ? { media } : {}),
    },
  });
  const tersimpan = !error && (data as { status?: unknown } | null)?.status === "disimpan";
  if (!tersimpan) await hapusBerkas(BUCKET_MEDIA, media.map((m) => m.path));
  if (error) {
    console.error("[admin/studio-soal/impor/simpan] studio_soal_impor_admin failed:", error);
    return NextResponse.json({ success: false, error: "Soal belum tersimpan. Coba lagi sebentar lagi." }, { status: 500 });
  }

  const r = (data ?? {}) as { status?: unknown; batch_id?: unknown; jumlah_soal?: unknown; jumlah_stimulus?: unknown };
  switch (r.status) {
    case "disimpan":
      return NextResponse.json({
        success: true,
        batchId: r.batch_id,
        jumlahSoal: r.jumlah_soal,
        jumlahBacaan: r.jumlah_stimulus,
        jumlahDilewati: hasil.ringkasan.jumlahGalat,
        jumlahBacaanDilewati: hasil.ringkasan.jumlahBacaanDilewati,
        jumlahGambar: media.length,
        namaBerkas,
      });
    case "bukan_admin":
      return NextResponse.json({ success: false, error: "Cuma Admin yang bisa mengunggah soal." }, { status: 403 });
    case "terlalu_banyak":
      return NextResponse.json({ success: false, error: "Maksimal 300 soal per unggahan." }, { status: 422 });
    case "data_tidak_valid":
      console.error("[admin/studio-soal/impor/simpan] data ditolak database:", r);
      return NextResponse.json(
        { success: false, error: "Database menolak data unggahan, tidak ada soal yang tersimpan. Periksa berkasnya lalu coba lagi." },
        { status: 422 },
      );
    default:
      return NextResponse.json({ success: false, error: "Permintaan unggah tidak valid." }, { status: 400 });
  }
}

// ---------------------------------------------------------------------------
// DOCX (berkas diambil dari bucket impor-staging, bukan dari body permintaan)
// ---------------------------------------------------------------------------

export interface MasukanDocx {
  /** Lokasi berkas di bucket impor-staging. */
  path: string;
  namaBerkas: string;
  lewatiGalat: boolean;
  masukan: Extract<HasilOlahDocx, { ok: true }>["masukan"];
  gambar: GambarSiap[];
}

/** Berkas staging hanya milik admin pembuatnya: "<adminId>/<uuid>.docx". */
export function pathStagingMilik(path: unknown, adminId: string): path is string {
  if (typeof path !== "string") return false;
  const [pemilik, nama, ...sisa] = path.split("/");
  return pemilik === adminId && sisa.length === 0 && POLA_NAMA_STAGING.test(nama ?? "");
}

/**
 * Body JSON { path, namaBerkas?, lewatiGalat? }: pastikan path milik admin ini,
 * unduh dari Storage, periksa ukuran & tanda ZIP "PK", lalu olahDocx() menolak isi
 * yang tidak didukung dan menguraikannya jadi baris perantara untuk susunImpor().
 * Mengembalikan NextResponse bila ditolak.
 */
export async function siapkanMasukanDocx(
  request: Request,
  adminId: string,
): Promise<{ ok: true; data: MasukanDocx } | { ok: false; respons: NextResponse }> {
  const tolak = (error: string, status: number) => ({ ok: false as const, respons: NextResponse.json({ success: false, error }, { status }) });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return tolak("Permintaan tidak valid.", 400);
  }
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (!pathStagingMilik(b.path, adminId)) return tolak("Berkas unggahan ini bukan milik Anda. Pilih berkasnya lagi.", 403);

  const unduh = await supabaseServer.storage.from(BUCKET_STAGING).download(b.path);
  if (unduh.error || !unduh.data) {
    console.error("[admin/studio-soal/impor] gagal mengunduh berkas staging:", unduh.error);
    return tolak("Berkas unggahan tidak ditemukan. Pilih berkasnya lalu periksa lagi.", 404);
  }
  if (unduh.data.size === 0) return tolak("Berkas kosong.", 400);
  if (unduh.data.size > BATAS_BYTE_DOCX) return tolak("Berkas terlalu besar (maks. 25 MB).", 413);

  const buffer = Buffer.from(await unduh.data.arrayBuffer());
  if (!berawalanZip(buffer)) return tolak("Berkas bukan dokumen Word (.docx) yang valid.", 400);

  const olah = await olahDocx(buffer);
  if (!olah.ok) return tolak(olah.error, olah.status);
  const namaBerkas = typeof b.namaBerkas === "string" ? b.namaBerkas.trim().slice(0, 200) : "";
  return {
    ok: true,
    data: {
      path: b.path,
      namaBerkas: namaBerkas || "soal.docx",
      lewatiGalat: b.lewatiGalat === true,
      masukan: olah.masukan,
      gambar: olah.media,
    },
  };
}
