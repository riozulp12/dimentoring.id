/**
 * Halaman "Soal dengan bacaan" (Studio Soal UX-3): bacaan di atas, kartu-kartu
 * soal di bawahnya, satu tombol "Simpan semua". Modul MURNI — pemanggilan API
 * disuntikkan (`put`) supaya alurnya bisa diuji terhadap route yang sama.
 *
 * Aturan simpan:
 *   - bacaan dulu (PUT /api/studio-soal/stimulus/:id, idempoten per id), dan
 *     hanya bila berubah / belum pernah tersimpan;
 *   - lalu soal satu per satu, berurutan (PUT /api/studio-soal/soal/:id),
 *     memakai id kartu yang tetap — coba ulang tidak menggandakan;
 *   - kartu yang sama sekali belum diisi, tidak berubah, atau terkunci dilewati;
 *   - bila bacaan gagal, soal tidak disimpan (soal baru butuh bacaannya ada).
 */
import { formAwal, type FormSoal, type FormStimulus } from "./formSoal";
import type { ErrorValidasi } from "./validasi";

export type HasilKartu = { ok: true } | { ok: false; alasan: string; errors: ErrorValidasi[] };

export interface KartuSoal {
  /** Id soal (UUID) — dibuat sekali, tetap sampai tersimpan dan sesudahnya. */
  id: string;
  form: FormSoal;
  status: string;
  versi: number;
  alasanTolak: string | null;
  pernahDiajukan: boolean;
  /** JSON form terakhir yang tersimpan di server; null = belum pernah tersimpan. */
  jejakTersimpan: string | null;
  terbuka: boolean;
  /** Hasil simpan/kirim terakhir untuk kartu ini. */
  hasil: HasilKartu | null;
}

export const bisaDiubah = (status: string) => status === "draf" || status === "ditolak";

/** Status bacaan yang masih boleh ditambah soal (sama dengan RPC simpan soal). */
export const bacaanBolehTambahSoal = (status: string) => ["draf", "ditolak", "terpublikasi"].includes(status);

/** Kartu baru yang sama sekali belum diisi (boleh ganti tipe — tetap dianggap kosong). */
export function isKartuKosong(form: FormSoal): boolean {
  return JSON.stringify(form) === JSON.stringify(formAwal(form.subtes_id, form.tipe, form.stimulus_id));
}

export const jejak = (form: FormSoal | FormStimulus) => JSON.stringify(form);

export type KeadaanKartu = "kosong" | "tersimpan" | "belum" | "terkunci";

export function keadaanKartu(k: Pick<KartuSoal, "form" | "status" | "jejakTersimpan">): KeadaanKartu {
  if (k.jejakTersimpan === null) return isKartuKosong(k.form) ? "kosong" : "belum";
  if (!bisaDiubah(k.status)) return "terkunci";
  return k.jejakTersimpan === jejak(k.form) ? "tersimpan" : "belum";
}

export const LABEL_KEADAAN: Record<KeadaanKartu, string> = {
  kosong: "Belum diisi",
  tersimpan: "Tersimpan",
  belum: "Belum tersimpan",
  terkunci: "Terkunci",
};

/** Kartu ini perlu dikirim ke server saat "Simpan semua"? */
export function perluDisimpan(k: Pick<KartuSoal, "form" | "status" | "jejakTersimpan">, bolehEdit = true): boolean {
  return bolehEdit && bisaDiubah(k.status) && keadaanKartu(k) === "belum";
}

/** Soal selalu memakai subtes & id bacaannya (subtes bacaan baru bisa berganti sebelum disimpan). */
export const formSoalUntukBacaan = (form: FormSoal, bacaan: { id: string; subtes_id: string }): FormSoal => ({
  ...form,
  subtes_id: bacaan.subtes_id,
  stimulus_id: bacaan.id,
});

type Put = (url: string, body: unknown) => Promise<{ ok: boolean; json: Record<string, unknown> }>;

export interface HasilSimpanSemua {
  bacaan: "dilewati" | "tersimpan" | { gagal: string; errors: ErrorValidasi[] };
  /** Per id kartu yang dicoba; kartu yang dilewati tidak ada di sini. */
  soal: Map<string, { ok: true; jejak: string } | { ok: false; alasan: string; errors: ErrorValidasi[] }>;
}

const errorsDari = (json: Record<string, unknown>) => (Array.isArray(json.errors) ? (json.errors as ErrorValidasi[]) : []);

export async function simpanSemua(opsi: {
  bacaan: { id: string; form: FormStimulus; perlu: boolean };
  kartu: Pick<KartuSoal, "id" | "form" | "status" | "jejakTersimpan">[];
  /** false bila soal tidak boleh diubah (mis. tidak ditugaskan / bacaan sedang dicek). */
  soalBolehEdit: boolean;
  put: Put;
  saatProses?: (ke: number, dari: number) => void;
}): Promise<HasilSimpanSemua> {
  const hasil: HasilSimpanSemua = { bacaan: "dilewati", soal: new Map() };
  const antre = opsi.kartu.filter((k) => perluDisimpan(k, opsi.soalBolehEdit));
  const total = antre.length + (opsi.bacaan.perlu ? 1 : 0);
  let ke = 0;

  if (opsi.bacaan.perlu) {
    opsi.saatProses?.(++ke, total);
    const r = await opsi.put(`/api/studio-soal/stimulus/${opsi.bacaan.id}`, opsi.bacaan.form);
    if (!r.ok) {
      hasil.bacaan = { gagal: String(r.json.error ?? "Bacaan belum tersimpan. Coba lagi."), errors: errorsDari(r.json) };
      return hasil;
    }
    hasil.bacaan = "tersimpan";
  }

  const bacaan = { id: opsi.bacaan.id, subtes_id: opsi.bacaan.form.subtes_id };
  for (const k of antre) {
    opsi.saatProses?.(++ke, total);
    const form = formSoalUntukBacaan(k.form, bacaan);
    const r = await opsi.put(`/api/studio-soal/soal/${k.id}`, form);
    hasil.soal.set(
      k.id,
      r.ok
        ? { ok: true, jejak: jejak(form) }
        : { ok: false, alasan: String(r.json.error ?? "Soal belum tersimpan. Coba lagi."), errors: errorsDari(r.json) },
    );
  }
  return hasil;
}

/**
 * Terapkan hasil "Simpan semua" ke kartu: yang tersimpan mencatat jejaknya
 * (jadi tidak dikirim ulang), yang gagal dibuka dan diberi alasan.
 */
export function terapkanHasilSimpan<K extends KartuSoal>(kartu: K[], h: HasilSimpanSemua, bacaan: { id: string; subtes_id: string }): K[] {
  return kartu.map((k) => {
    const r = h.soal.get(k.id);
    if (!r) return k;
    return r.ok
      ? { ...k, form: formSoalUntukBacaan(k.form, bacaan), jejakTersimpan: r.jejak, hasil: { ok: true } }
      : { ...k, terbuka: true, hasil: { ok: false, alasan: r.alasan, errors: r.errors } };
  });
}

/** Kalimat ringkas hasil "Simpan semua". */
export function ringkasSimpanSemua(h: HasilSimpanSemua): { ok: boolean; teks: string } {
  if (typeof h.bacaan === "object") return { ok: false, teks: `Bacaan belum tersimpan: ${h.bacaan.gagal} Soal belum disimpan.` };
  const nilai = [...h.soal.values()];
  const ok = nilai.filter((x) => x.ok).length;
  const gagal = nilai.length - ok;
  const bagian: string[] = [];
  if (h.bacaan === "tersimpan") bagian.push(ok > 0 ? `Bacaan dan ${ok} soal tersimpan.` : "Bacaan tersimpan.");
  else if (ok > 0) bagian.push(`${ok} soal tersimpan.`);
  if (gagal > 0) bagian.push(`${gagal} soal belum tersimpan — lihat kartu yang ditandai, perbaiki, lalu simpan lagi.`);
  if (bagian.length === 0) bagian.push("Tidak ada perubahan untuk disimpan.");
  return { ok: gagal === 0, teks: bagian.join(" ") };
}
