import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validatePtnJurusanInput } from "@/lib/admin/validatePtnJurusanInput";
import { parseCsv } from "@/lib/admin/parseCsv";

/**
 * Import Massal data PTN lewat CSV — PRD Bagian 7.4.2/BR-28 (Admin, Kelola
 * Assessment). Selama ini data ptn_jurusan diinput manual satu-satu lewat SQL
 * Editor — endpoint ini jalur pertama untuk input massal. Validasi tiap baris
 * pakai aturan yang SAMA dengan form manual (lib/admin/validatePtnJurusanInput),
 * insert yang valid satu-satu (bukan bulk insert) supaya baris yang gagal
 * tidak menggagalkan baris lain, lalu laporkan ringkasan per kategori.
 *
 * Kolom header CSV yang diharapkan (urutan bebas, header wajib ada persis):
 * nama_universitas, nama_jurusan, jenjang, provinsi, kuota_tahun_berjalan,
 * jumlah_peminat_tahun_lalu, jalur, rumpun (saintek/soshum), tahun_data,
 * sumber_data (opsional), rata_rata_nilai_diterima (opsional).
 */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

const REQUIRED_HEADERS = [
  "nama_universitas",
  "nama_jurusan",
  "jenjang",
  "provinsi",
  "kuota_tahun_berjalan",
  "jumlah_peminat_tahun_lalu",
  "jalur",
  "rumpun",
  "tahun_data",
];

type FailCategory = "duplikat" | "provinsi_tidak_ditemukan" | "lainnya";

interface FailedRow {
  row: number;
  reason: string;
  category: FailCategory;
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa mengelola data PTN.", 403);
  }

  let csvText: string;
  try {
    const body = await request.json();
    if (typeof body?.csvText !== "string" || !body.csvText.trim()) {
      return errorResponse("File CSV kosong atau tidak valid.", 400);
    }
    csvText = body.csvText;
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return errorResponse("File CSV kosong.", 400);
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missingHeaders.length > 0) {
    return errorResponse(`Header CSV tidak lengkap, kolom hilang: ${missingHeaders.join(", ")}.`, 400);
  }

  const colIndex = (name: string) => header.indexOf(name);
  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== ""));

  const { data: provinsiRows, error: provinsiError } = await supabaseServer.from("provinsi").select("id, nama");
  if (provinsiError) {
    console.error("[import-csv] query provinsi failed:", provinsiError);
    return errorResponse("Gagal memuat data provinsi. Coba lagi nanti.", 500);
  }
  const provinsiMap = new Map((provinsiRows ?? []).map((p) => [String(p.nama).trim().toLowerCase(), p.id as string]));

  let successCount = 0;
  const failed: FailedRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2; // +1 untuk header, +1 untuk 1-indexed
    const cells = dataRows[i];
    const get = (name: string) => (colIndex(name) >= 0 ? (cells[colIndex(name)] ?? "").trim() : "");

    const provinsiNama = get("provinsi");
    const provinsiId = provinsiMap.get(provinsiNama.toLowerCase());
    if (!provinsiId) {
      failed.push({ row: rowNumber, reason: `Provinsi "${provinsiNama}" tidak ditemukan.`, category: "provinsi_tidak_ditemukan" });
      continue;
    }

    const validated = await validatePtnJurusanInput({
      namaUniversitas: get("nama_universitas"),
      namaJurusan: get("nama_jurusan"),
      jenjang: get("jenjang"),
      provinsiId,
      kuotaTahunBerjalan: get("kuota_tahun_berjalan"),
      jumlahPeminatTahunLalu: get("jumlah_peminat_tahun_lalu"),
      jalur: get("jalur").toLowerCase(),
      rumpun: get("rumpun").toLowerCase(),
      tahunData: get("tahun_data"),
      sumberData: get("sumber_data") || "input_manual_admin",
      rataRataNilaiDiterima: get("rata_rata_nilai_diterima") || null,
    });

    if (!validated.ok) {
      failed.push({ row: rowNumber, reason: validated.error, category: "lainnya" });
      continue;
    }

    const { error: insertError } = await supabaseServer.from("ptn_jurusan").insert(validated.data);
    if (insertError) {
      if (insertError.code === "23505") {
        failed.push({ row: rowNumber, reason: "Kombinasi universitas+jurusan+jenjang+jalur+tahun data sudah ada.", category: "duplikat" });
      } else {
        console.error("[import-csv] insert failed on row", rowNumber, insertError);
        failed.push({ row: rowNumber, reason: "Gagal menyimpan baris ini ke database.", category: "lainnya" });
      }
      continue;
    }

    successCount++;
  }

  return NextResponse.json({
    success: true,
    totalRows: dataRows.length,
    successCount,
    failed,
  });
}
