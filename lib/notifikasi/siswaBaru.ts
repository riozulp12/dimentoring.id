import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { kirimEmailMentorSiswaBaru, type KirimEmailMentorSiswaBaruInput, type KirimEmailMentorSiswaBaruResult } from "@/lib/email/kirimEmailMentorSiswaBaru";
import { samarkanEmail } from "@/lib/notifikasi/logAman";
import {
  buatLogWaSupabase,
  buatPesanWaSiswaBaru,
  getPenyediaWa,
  kirimNotifWa,
  waNotifAktif,
  type HasilNotifWa,
  type LogWaStore,
  type PenyediaWa,
} from "@/lib/notifikasi/wa";

/**
 * Saluran LUAR WEB untuk kejadian "siswa baru masuk kelas mentor": email
 * (Resend) dan WhatsApp (Fonnte, bendera mati secara bawaan). Notifikasi di
 * dalam web (lonceng) tetap di notify.ts dan tidak diubah.
 *
 * Dipanggil lewat jalankanSetelahRespons(): berjalan SETELAH webhook /
 * pendaftaran membalas, dan tidak pernah melempar galat ke alur utama.
 *
 * Idempoten — satu kejadian + satu penerima = paling banyak satu email dan satu WA:
 *  - WhatsApp: kunci `siswa_baru:<kejadianId>:<mentorId>` di notifikasi_wa_log
 *    (UNIQUE, INSERT ... ON CONFLICT DO NOTHING) — tahan antar proses/instance.
 *  - Email: kunci yang sama dijaga di memori proses ini, di atas pengaman
 *    utamanya, yaitu fulfillPayment yang hanya memanggil notifikasi dari
 *    pemenang klaim status menunggu -> berhasil. Penjaga lintas-proses khusus
 *    email butuh tabel (SQL), jadi belum dibuat.
 */

export interface MentorPenerima {
  id: string;
  nama: string;
  email: string;
}

export interface KejadianSiswaBaru {
  /** payments.id (checkout) atau enrollments.id (pendaftaran manual Admin). */
  kejadianId: string;
  kelasId: string;
  kelasNama: string;
  jadwalDisplay: string | null;
  /** Nama siswa; null/kosong -> "Seorang siswa". */
  siswaNama: string | null;
  mentors: MentorPenerima[];
}

export interface DepsSiswaBaru {
  env?: Readonly<Record<string, string | undefined>>;
  kirimEmail?: (input: KirimEmailMentorSiswaBaruInput) => Promise<KirimEmailMentorSiswaBaruResult>;
  /** id mentor -> boleh dikirimi email (users.notif_email). Default: baca dari DB, galat = semua boleh. */
  ambilBolehEmail?: (mentorIds: string[]) => Promise<Map<string, boolean>>;
  /** id mentor -> {noWa, setuju}. Default: baca dari DB; kolom belum ada = peta kosong. */
  ambilPenerimaWa?: (mentorIds: string[]) => Promise<Map<string, { noWa: string | null; setuju: boolean }>>;
  ambilPenyediaWa?: () => PenyediaWa | null;
  logWa?: LogWaStore;
  /** Jeda antar penerima (ms). Default 1500 untuk WA, 600 untuk email (batas Resend 2 permintaan/detik). */
  jedaWaMs?: number;
  jedaEmailMs?: number;
  tidur?: (ms: number) => Promise<void>;
}

const JEDA_WA_BAWAAN_MS = 1500;
const JEDA_EMAIL_BAWAAN_MS = 600;

const kunciEmailTerkirim = new Set<string>();
const MAKS_KUNCI_EMAIL = 5000;

/** Hanya untuk tes. */
export function resetPenjagaEmailUntukTes(): void {
  kunciEmailTerkirim.clear();
}

export function kunciKejadianSiswaBaru(kejadianId: string, mentorId: string): string {
  return `siswa_baru:${kejadianId}:${mentorId}`;
}

const tidurBawaan = (ms: number) => new Promise<void>((selesai) => setTimeout(selesai, ms));

export async function ambilBolehEmailDariDb(mentorIds: string[]): Promise<Map<string, boolean>> {
  const hasil = new Map<string, boolean>();
  const { data, error } = await supabaseServer.from("users").select("id, notif_email").in("id", mentorIds);
  if (error) {
    console.warn(`[notifikasi] baca preferensi email gagal (kode ${error.code ?? "?"}) — email dikirim seperti biasa.`);
    return hasil;
  }
  for (const baris of data ?? []) hasil.set(baris.id as string, baris.notif_email !== false);
  return hasil;
}

export async function ambilPenerimaWaDariDb(
  mentorIds: string[],
): Promise<Map<string, { noWa: string | null; setuju: boolean }>> {
  const hasil = new Map<string, { noWa: string | null; setuju: boolean }>();
  const { data, error } = await supabaseServer.from("users").select("id, no_wa, notif_wa_setuju").in("id", mentorIds);
  if (error) {
    // Paling mungkin kolom notif_wa_setuju belum ada (db/add_notifikasi_wa.sql belum dijalankan).
    console.warn(`[notifikasi-wa] kolom persetujuan belum bisa dibaca (kode ${error.code ?? "?"}) — WhatsApp dilewati.`);
    return hasil;
  }
  for (const baris of data ?? []) {
    hasil.set(baris.id as string, { noWa: (baris.no_wa as string | null) ?? null, setuju: baris.notif_wa_setuju === true });
  }
  return hasil;
}

export interface RingkasanKabari {
  email: Record<string, number>;
  wa: Record<string, number>;
}

function tambah(peta: Record<string, number>, kunci: string) {
  peta[kunci] = (peta[kunci] ?? 0) + 1;
}

export async function kabariMentorSiswaBaru(kejadian: KejadianSiswaBaru, deps: DepsSiswaBaru = {}): Promise<RingkasanKabari> {
  const env = deps.env ?? process.env;
  const tidur = deps.tidur ?? tidurBawaan;
  const ringkasan: RingkasanKabari = { email: {}, wa: {} };

  // satu mentor, satu kali (kelas dengan beberapa subtes bisa memberi baris ganda)
  const unik = new Map<string, MentorPenerima>();
  for (const mentor of kejadian.mentors) unik.set(mentor.id, mentor);
  const mentors = Array.from(unik.values());
  if (mentors.length === 0) return ringkasan;

  const ids = mentors.map((mentor) => mentor.id);
  const namaSiswa = kejadian.siswaNama?.trim() || "Seorang siswa";

  // ---- Email ----------------------------------------------------------------
  const kirimEmail = deps.kirimEmail ?? ((input) => kirimEmailMentorSiswaBaru(input, { env }));
  let bolehEmail = new Map<string, boolean>();
  try {
    bolehEmail = await (deps.ambilBolehEmail ?? ambilBolehEmailDariDb)(ids);
  } catch {
    // preferensi tak terbaca -> kirim seperti biasa
  }

  let sudahKirimEmail = false;
  for (const mentor of mentors) {
    try {
      if (bolehEmail.get(mentor.id) === false) {
        tambah(ringkasan.email, "dimatikan_penerima");
        continue;
      }
      if (!mentor.email) {
        tambah(ringkasan.email, "tanpa_email");
        continue;
      }
      const kunci = kunciKejadianSiswaBaru(kejadian.kejadianId, mentor.id);
      if (kunciEmailTerkirim.has(kunci)) {
        tambah(ringkasan.email, "duplikat");
        continue;
      }
      if (kunciEmailTerkirim.size >= MAKS_KUNCI_EMAIL) kunciEmailTerkirim.clear();
      kunciEmailTerkirim.add(kunci);

      if (sudahKirimEmail) await tidur(deps.jedaEmailMs ?? JEDA_EMAIL_BAWAAN_MS);
      sudahKirimEmail = true;

      const hasil = await kirimEmail({
        email: mentor.email,
        namaMentor: mentor.nama,
        namaSiswa,
        kelasId: kejadian.kelasId,
        kelasNama: kejadian.kelasNama,
        jadwalDisplay: kejadian.jadwalDisplay,
      });
      tambah(ringkasan.email, hasil.success ? "terkirim" : hasil.error);
    } catch {
      tambah(ringkasan.email, "gagal");
      console.error(`[email] siswa_baru galat tak terduga untuk ${samarkanEmail(mentor.email ?? "")}.`);
    }
  }

  // ---- WhatsApp -------------------------------------------------------------
  if (!waNotifAktif(env)) {
    tambah(ringkasan.wa, "mati");
    return ringkasan;
  }

  try {
    const penerima = await (deps.ambilPenerimaWa ?? ambilPenerimaWaDariDb)(ids);
    const logWa = deps.logWa ?? buatLogWaSupabase();
    const ambilPenyedia = deps.ambilPenyediaWa ?? (() => getPenyediaWa(env));

    for (const [urutan, mentor] of mentors.entries()) {
      const info = penerima.get(mentor.id);
      const hasil: HasilNotifWa = await kirimNotifWa(
        {
          kunciKejadian: kunciKejadianSiswaBaru(kejadian.kejadianId, mentor.id),
          jenis: "siswa_baru",
          userId: mentor.id,
          noWa: info?.noWa,
          setuju: info?.setuju === true,
          pesan: buatPesanWaSiswaBaru(mentor.nama, kejadian.kelasNama),
        },
        { env, ambilPenyedia, store: logWa },
      );
      tambah(ringkasan.wa, hasil);
      if ((hasil === "terkirim" || hasil === "gagal") && urutan < mentors.length - 1) {
        // beberapa mentor dikirim berurutan dengan jeda, bukan serentak
        await tidur(deps.jedaWaMs ?? JEDA_WA_BAWAAN_MS);
      }
    }
  } catch {
    tambah(ringkasan.wa, "gagal");
    console.error("[notifikasi-wa] galat tak terduga saat menyiapkan pengiriman.");
  }

  return ringkasan;
}
