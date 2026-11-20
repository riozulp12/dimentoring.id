/**
 * Validasi sebaran sesi per subtes untuk sesi pilihan siswa (kelas private online). Fungsi MURNI.
 * Aturan: subtes yang dikirim persis sama dengan subtes yang dipilih (tanpa tambahan/kurang/ganda),
 * tiap subtes minimal 1 sesi (bilangan bulat), dan jumlahnya tepat N. Satu subtes: boleh dikosongkan (= N).
 */
export type HasilSebaranSesi =
  | { ok: true; perSubtes: { subtesId: string; jumlahSesi: number }[] }
  | { ok: false; error: string };

export function validasiSebaranSesi(input: {
  subtesIds: string[];
  sesiTotal: number;
  /** Isi mentah dari klien: [{ subtesId, jumlahSesi }]. */
  sesiPerSubtes: unknown;
}): HasilSebaranSesi {
  const { subtesIds, sesiTotal, sesiPerSubtes } = input;

  if (sesiPerSubtes === undefined || sesiPerSubtes === null) {
    if (subtesIds.length === 1) return { ok: true, perSubtes: [{ subtesId: subtesIds[0], jumlahSesi: sesiTotal }] };
    if (subtesIds.length === 0) return { ok: true, perSubtes: [] };
    return { ok: false, error: "Atur dulu pembagian sesi untuk tiap subtes yang kamu pilih." };
  }
  if (!Array.isArray(sesiPerSubtes)) return { ok: false, error: "Pembagian sesi per subtes tidak valid." };

  const peta = new Map<string, number>();
  for (const baris of sesiPerSubtes) {
    const b = baris as { subtesId?: unknown; jumlahSesi?: unknown } | null;
    if (!b || typeof b.subtesId !== "string" || typeof b.jumlahSesi !== "number" || !Number.isInteger(b.jumlahSesi)) {
      return { ok: false, error: "Pembagian sesi per subtes tidak valid." };
    }
    if (peta.has(b.subtesId)) return { ok: false, error: "Pembagian sesi per subtes tidak valid." };
    peta.set(b.subtesId, b.jumlahSesi);
  }
  if (peta.size !== subtesIds.length || !subtesIds.every((id) => peta.has(id))) {
    return { ok: false, error: "Pembagian sesi harus mencakup tepat subtes yang kamu pilih." };
  }
  const perSubtes = subtesIds.map((subtesId) => ({ subtesId, jumlahSesi: peta.get(subtesId) as number }));
  if (perSubtes.some((p) => p.jumlahSesi < 1)) {
    return { ok: false, error: "Tiap subtes yang dipilih minimal mendapat 1 sesi." };
  }
  if (perSubtes.reduce((a, p) => a + p.jumlahSesi, 0) !== sesiTotal) {
    return { ok: false, error: `Jumlah sesi semua subtes harus pas ${sesiTotal}.` };
  }
  return { ok: true, perSubtes };
}
