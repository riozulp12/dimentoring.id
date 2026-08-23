/**
 * Validasi body request Tambah/Edit Info Beasiswa/Internship/Event — dipakai
 * bersama oleh app/api/kelola-konten/info/route.ts (POST) dan
 * app/api/kelola-konten/info/[infoId]/route.ts (PATCH), pola sama dengan
 * lib/admin/validateKelasInput.ts. Tanpa "server-only" — validasi murni
 * (tidak ada query DB), aman diimport dari client kalau suatu saat perlu
 * validasi awal di form juga.
 */

const VALID_TIPE = ["beasiswa", "internship", "event"];
const VALID_STATUS = ["aktif", "ditutup"];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export interface KontenInfoInputBody {
  tipe?: string;
  judul?: string;
  deskripsi?: string;
  deskripsiLengkap?: string;
  deadline?: string;
  linkPendaftaran?: string;
  status?: string;
}

export interface ValidatedKontenInfoInput {
  tipe: string;
  judul: string;
  deskripsi: string | null;
  deskripsi_lengkap: string | null;
  link_pendaftaran: string | null;
  deadline: string | null;
  status: string;
}

export type ValidateKontenInfoResult =
  | { ok: true; data: ValidatedKontenInfoInput }
  | { ok: false; error: string };

export function validateKontenInfoInput(body: KontenInfoInputBody): ValidateKontenInfoResult {
  if (!body.tipe || !VALID_TIPE.includes(body.tipe)) {
    return { ok: false, error: "Tipe tidak valid." };
  }

  const judul = typeof body.judul === "string" ? body.judul.trim() : "";
  if (!judul) return { ok: false, error: "Judul wajib diisi." };

  if (!body.status || !VALID_STATUS.includes(body.status)) {
    return { ok: false, error: "Status tidak valid." };
  }

  const deskripsi = typeof body.deskripsi === "string" && body.deskripsi.trim() ? body.deskripsi.trim() : null;
  const deskripsiLengkap =
    typeof body.deskripsiLengkap === "string" && body.deskripsiLengkap.trim()
      ? body.deskripsiLengkap.trim()
      : null;

  let linkPendaftaran: string | null = null;
  if (typeof body.linkPendaftaran === "string" && body.linkPendaftaran.trim()) {
    const trimmed = body.linkPendaftaran.trim();
    if (!isValidUrl(trimmed)) {
      return { ok: false, error: "Link Pendaftaran harus berupa URL yang valid (diawali http:// atau https://)." };
    }
    linkPendaftaran = trimmed;
  }

  let deadline: string | null = null;
  if (typeof body.deadline === "string" && body.deadline.trim()) {
    const trimmed = body.deadline.trim();
    if (!DATE_REGEX.test(trimmed)) {
      return { ok: false, error: "Deadline tidak valid." };
    }
    deadline = trimmed;
  }

  return {
    ok: true,
    data: {
      tipe: body.tipe,
      judul,
      deskripsi,
      deskripsi_lengkap: deskripsiLengkap,
      link_pendaftaran: linkPendaftaran,
      deadline,
      status: body.status,
    },
  };
}
