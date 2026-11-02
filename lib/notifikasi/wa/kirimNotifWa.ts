import { normalisasiNoWa } from "@/lib/shared/noWa";
import { rentangHariWib } from "@/lib/shared/hariWib";
import { bersihkanGalat, samarkanNomor } from "@/lib/notifikasi/logAman";
import { batasHarianWa, waNotifAktif, type EnvLike } from "./config";
import type { LogWaStore, PenyediaWa } from "./types";

/**
 * Kirim SATU notifikasi WhatsApp ke satu penerima, dengan semua pengaman:
 *
 *   1. bendera WA_NOTIF_ENABLED persis "true"  (kalau tidak: berhenti, nol DB, nol penyedia)
 *   2. penerima sudah setuju (users.notif_wa_setuju)
 *   3. nomor valid (normalisasiNoWa -> 628…)   (tidak valid: dicatat "dilewati")
 *   4. batas harian (bawaan 50)                (lewat batas: dicatat "dilewati")
 *   5. klaim idempoten di notifikasi_wa_log    (kunci sama = tidak dikirim lagi)
 *   6. baru kirim lewat penyedia, hasilnya dicatat
 *
 * TIDAK PERNAH melempar galat: hasilnya selalu salah satu HasilNotifWa.
 * Yang dicatat/di-log hanya kode singkat dan nomor yang disamarkan, tidak
 * pernah isi pesan atau token.
 */

export type HasilNotifWa =
  | "mati"
  | "penyedia_belum_diatur"
  | "tanpa_persetujuan"
  | "nomor_tidak_valid"
  | "batas_harian"
  | "tabel_belum_ada"
  | "duplikat"
  | "terkirim"
  | "gagal";

export interface InputNotifWa {
  /** Unik per kejadian + penerima, mis. `siswa_baru:<payment id>:<user id>`. */
  kunciKejadian: string;
  jenis: string;
  userId: string;
  /** Nomor apa adanya dari users.no_wa (dinormalisasi di sini). */
  noWa: string | null | undefined;
  setuju: boolean;
  pesan: string;
}

export interface DepsNotifWa {
  env: EnvLike;
  /** Dipanggil hanya setelah semua pengaman lolos. null = token belum diset. */
  ambilPenyedia: () => PenyediaWa | null;
  store: LogWaStore;
  sekarang?: () => Date;
}

export async function kirimNotifWa(input: InputNotifWa, deps: DepsNotifWa): Promise<HasilNotifWa> {
  if (!waNotifAktif(deps.env)) return "mati";
  if (!input.setuju) return "tanpa_persetujuan";

  try {
    const baris = { kunci_kejadian: input.kunciKejadian, user_id: input.userId, jenis: input.jenis };
    const noWa = normalisasiNoWa(input.noWa);

    if (!noWa) {
      const klaim = await deps.store.klaim({ ...baris, status: "dilewati", error: "nomor_tidak_valid" });
      if (klaim === "tabel_tidak_ada") return logTabelBelumAda();
      console.warn(`[notifikasi-wa] dilewati: nomor tidak valid (user ${input.userId}).`);
      return "nomor_tidak_valid";
    }

    const penyedia = deps.ambilPenyedia();
    if (!penyedia) {
      console.warn("[notifikasi-wa] FONNTE_TOKEN belum diset — WhatsApp dilewati.");
      return "penyedia_belum_diatur";
    }

    const sejak = rentangHariWib((deps.sekarang ?? (() => new Date()))()).mulai;
    const terpakai = await deps.store.hitungSejak(sejak);
    if (terpakai === null) return logTabelBelumAda();
    if (terpakai >= batasHarianWa(deps.env)) {
      await deps.store.klaim({ ...baris, status: "dilewati", error: "batas_harian" });
      console.warn(`[notifikasi-wa] dilewati: batas harian ${batasHarianWa(deps.env)} pesan tercapai.`);
      return "batas_harian";
    }

    const klaim = await deps.store.klaim({ ...baris, status: "pending" });
    if (klaim === "tabel_tidak_ada") return logTabelBelumAda();
    if (klaim === "duplikat") return "duplikat";

    const token = deps.env.FONNTE_TOKEN;
    const hasil = await penyedia.kirim(noWa, input.pesan);
    if (hasil.ok) {
      await deps.store.perbarui(input.kunciKejadian, { status: "terkirim", provider_ref: hasil.ref });
      return "terkirim";
    }

    const galat = bersihkanGalat(hasil.error, [token]);
    await deps.store.perbarui(input.kunciKejadian, { status: "gagal", error: galat });
    console.error(`[notifikasi-wa] gagal kirim ke ${samarkanNomor(noWa)}: ${galat}`);
    return "gagal";
  } catch (error) {
    const galat = bersihkanGalat(error, [deps.env.FONNTE_TOKEN]);
    console.error(`[notifikasi-wa] galat tak terduga: ${galat}`);
    try {
      await deps.store.perbarui(input.kunciKejadian, { status: "gagal", error: galat });
    } catch {
      // abaikan: pencatatan tambahan, bukan alur utama
    }
    return "gagal";
  }
}

let sudahDilaporkanTabelBelumAda = false;
function logTabelBelumAda(): HasilNotifWa {
  if (!sudahDilaporkanTabelBelumAda) {
    sudahDilaporkanTabelBelumAda = true;
    console.warn("[notifikasi-wa] tabel notifikasi_wa_log belum ada (db/add_notifikasi_wa.sql belum dijalankan) — WhatsApp dilewati.");
  }
  return "tabel_belum_ada";
}
