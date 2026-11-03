/**
 * Antarmuka penyedia WhatsApp. Pemanggil (kirimNotifWa) hanya tahu antarmuka
 * ini, jadi penyedia bisa diganti (mis. WhatsApp Business API resmi) tanpa
 * mengubah pemanggil: cukup tulis implementasi baru dan ubah getPenyediaWa().
 */

export type HasilKirimWa =
  | { ok: true; ref: string | null }
  /** `error` selalu teks pendek yang sudah dibersihkan (tanpa token/nomor). */
  | { ok: false; error: string };

export interface PenyediaWa {
  readonly nama: string;
  /** `target` = nomor format 628xxxxxxxxx (sudah dinormalisasi pemanggil). */
  kirim(target: string, pesan: string): Promise<HasilKirimWa>;
}

export type StatusLogWa = "pending" | "terkirim" | "gagal" | "dilewati";

export interface BarisLogWa {
  kunci_kejadian: string;
  user_id: string;
  jenis: string;
  status: StatusLogWa;
  error?: string | null;
}

/** Penyimpan catatan kiriman (tabel notifikasi_wa_log) — dipisah supaya bisa ditiru di tes. */
export interface LogWaStore {
  /**
   * INSERT ... ON CONFLICT (kunci_kejadian) DO NOTHING.
   * "dibuat" = baris baru (boleh lanjut), "duplikat" = kejadian ini sudah
   * tercatat, "tabel_tidak_ada" = migrasi belum dijalankan.
   */
  klaim(baris: BarisLogWa): Promise<"dibuat" | "duplikat" | "tabel_tidak_ada">;
  perbarui(kunci: string, perubahan: { status: StatusLogWa; provider_ref?: string | null; error?: string | null }): Promise<void>;
  /** Jumlah kiriman (pending + terkirim) sejak `sejakIso`; null bila tabel belum ada / query gagal. */
  hitungSejak(sejakIso: string): Promise<number | null>;
}
