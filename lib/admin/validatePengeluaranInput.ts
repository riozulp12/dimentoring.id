import "server-only";

/**
 * Validasi body request Tambah Pengeluaran — PRD Bagian 13 (pengeluaran_bisnis
 * — BARU), dipakai app/api/analytics/pengeluaran/route.ts.
 */

const VALID_KATEGORI = ["operasional", "gaji_honor", "lainnya"];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface PengeluaranInputBody {
  kategori?: string;
  deskripsi?: string;
  jumlah?: number | string;
  tanggal?: string;
}

export interface ValidatedPengeluaranInput {
  kategori: string;
  deskripsi: string;
  jumlah: number;
  tanggal: string;
}

export type ValidatePengeluaranResult =
  | { ok: true; data: ValidatedPengeluaranInput }
  | { ok: false; error: string };

export function validatePengeluaranInput(body: PengeluaranInputBody): ValidatePengeluaranResult {
  if (!body.kategori || !VALID_KATEGORI.includes(body.kategori)) {
    return { ok: false, error: "Kategori tidak valid." };
  }

  const deskripsi = typeof body.deskripsi === "string" ? body.deskripsi.trim() : "";
  if (!deskripsi) return { ok: false, error: "Deskripsi wajib diisi." };

  if (body.jumlah === undefined || body.jumlah === null || body.jumlah === "") {
    return { ok: false, error: "Jumlah wajib diisi." };
  }
  const jumlah = Number(body.jumlah);
  if (!Number.isFinite(jumlah) || jumlah <= 0) {
    return { ok: false, error: "Jumlah tidak valid." };
  }

  if (!body.tanggal || !DATE_REGEX.test(body.tanggal)) {
    return { ok: false, error: "Tanggal tidak valid." };
  }

  return {
    ok: true,
    data: {
      kategori: body.kategori,
      deskripsi,
      jumlah,
      tanggal: body.tanggal,
    },
  };
}
