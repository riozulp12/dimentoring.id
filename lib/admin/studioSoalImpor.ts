import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { olahDocx, type HasilOlahDocx } from "@/lib/admin/docxIsi";
import { berawalanZip } from "@/lib/admin/docxZip";
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

type MasukanBerkas = Pick<MasukanImpor, "soalCsv" | "bacaanCsv" | "soalBaris" | "bacaanBaris" | "bacaanBlok" | "galatTambahan">;

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
    pratinjau: hasil.pratinjau,
    galat: hasil.galat.slice(0, MAKS_PESAN),
    peringatan: hasil.peringatan.slice(0, MAKS_PESAN),
    galatTerpotong: hasil.galat.length > MAKS_PESAN,
    bisaSimpan: cek.ok,
    bisaSimpanLewatiGalat: cekLewati.ok,
    alasanTidakBisa: cek.ok ? null : cek.alasan,
  });
}

/** Simpan hasil susunImpor sebagai DRAF lewat RPC studio_soal_impor_admin (satu transaksi). */
export async function simpanBatch(adminId: string, hasil: HasilImpor, namaBerkas: string, lewatiGalat: boolean) {
  const cek = bisaSimpan(hasil, lewatiGalat);
  if (!cek.ok) return NextResponse.json({ success: false, error: cek.alasan }, { status: 422 });

  const { data, error } = await supabaseServer.rpc("studio_soal_impor_admin", {
    p_admin_id: adminId,
    p_batch: {
      nama_berkas: namaBerkas,
      jumlah_baris: hasil.ringkasan.jumlahBaris,
      jumlah_gagal: hasil.ringkasan.jumlahGalat,
      stimulus: hasil.stimulus,
      soal: hasil.soal,
    },
  });
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
// DOCX
// ---------------------------------------------------------------------------

export interface MasukanDocx {
  namaBerkas: string;
  lewatiGalat: boolean;
  masukan: Extract<HasilOlahDocx, { ok: true }>["masukan"];
}

/**
 * Baca multipart (field "berkas" = satu .docx, maks. 5 MB), periksa tanda ZIP
 * "PK", lalu olahDocx() menolak isi yang tidak didukung dan menguraikannya jadi
 * baris perantara untuk susunImpor(). Mengembalikan NextResponse bila ditolak.
 */
export async function siapkanMasukanDocx(request: Request): Promise<{ ok: true; data: MasukanDocx } | { ok: false; respons: NextResponse }> {
  const tolak = (error: string, status: number) => ({ ok: false as const, respons: NextResponse.json({ success: false, error }, { status }) });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return tolak("Permintaan harus berupa unggahan berkas (multipart).", 400);
  }
  const berkas = form.get("berkas");
  if (!(berkas instanceof File)) return tolak("Berkas Word (.docx) belum dipilih.", 400);
  if (!berkas.name.toLowerCase().endsWith(".docx")) return tolak("Hanya berkas .docx yang diterima (bukan .doc atau PDF).", 400);
  if (berkas.size === 0) return tolak("Berkas kosong.", 400);
  if (berkas.size > BATAS_BYTE_DOCX) return tolak("Berkas terlalu besar (maks. 5 MB).", 413);

  const buffer = Buffer.from(await berkas.arrayBuffer());
  if (!berawalanZip(buffer)) return tolak("Berkas bukan dokumen Word (.docx) yang valid.", 400);

  const olah = await olahDocx(buffer);
  if (!olah.ok) return tolak(olah.error, olah.status);
  return {
    ok: true,
    data: {
      namaBerkas: berkas.name.slice(0, 200),
      lewatiGalat: form.get("lewatiGalat") === "true",
      masukan: olah.masukan,
    },
  };
}
