"use client";

import type { ErrorValidasi } from "@/lib/shared/studio-soal/validasi";

/** Panggilan API Studio Soal dari browser. Tidak pernah melempar error. */
export async function panggilApi(
  url: string,
  method: "PUT" | "POST" | "DELETE",
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    return { ok: res.ok && json.success === true, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: { error: "Gagal terhubung ke server. Periksa koneksi lalu coba lagi." } };
  }
}

/** Kelompokkan error per field (jalur "konten.opsi.2.teks" dsb.). */
export function petaError(errors: ErrorValidasi[]): Map<string, string[]> {
  const peta = new Map<string, string[]>();
  for (const e of errors) {
    const daftar = peta.get(e.field) ?? [];
    if (!daftar.includes(e.pesan)) daftar.push(e.pesan);
    peta.set(e.field, daftar);
  }
  return peta;
}

/** Error untuk satu field ATAU semua sub-field-nya (awalan + "."). */
export function errorDi(peta: Map<string, string[]>, field: string, termasukAnak = false): string[] | undefined {
  const hasil: string[] = [...(peta.get(field) ?? [])];
  if (termasukAnak) {
    for (const [k, v] of peta) if (k.startsWith(`${field}.`)) hasil.push(...v);
  }
  return hasil.length ? hasil : undefined;
}

export const LABEL_STATUS: Record<string, string> = {
  draf: "Draf",
  diajukan: "Menunggu tinjauan",
  terpublikasi: "Terpublikasi",
  ditolak: "Ditolak",
  digantikan: "Versi lama",
  diarsipkan: "Diarsipkan",
};

export const isBolehEdit = (status: string) => status === "draf" || status === "ditolak";
