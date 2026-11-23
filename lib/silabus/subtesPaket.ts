/**
 * Daftar nama subtes untuk "Peta Materi" di detail kelas. Murni (tanpa server-only).
 * Kelas PAKET memakai aturan yang SAMA dengan checkout ("Pilih Subtes", components/siswa/CheckoutForm.tsx):
 * bukan offline dan pool subtes (getKelasSubtesOptions, lib/payment/getKelasForCheckout.ts) > 1 — dengan urutan pool
 * yang sama. Selain itu tetap satu subtes (kelas.subtesNama, chip di header).
 */
export function namaSubtesPetaMateri(input: {
  modePembelajaran: string | null | undefined;
  subtesNama: string | null | undefined;
  pool: { nama: string }[] | null | undefined;
}): string[] {
  const pool = input.pool ?? [];
  if (input.modePembelajaran !== "offline" && pool.length > 1) return pool.map((s) => s.nama);
  return input.subtesNama ? [input.subtesNama] : [];
}
