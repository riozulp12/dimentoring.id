import { bersihkanGalat } from "@/lib/notifikasi/logAman";

/**
 * Ringkasan galat penyedia AI (Gemini) yang AMAN dicatat di log server
 * (Vercel Logs): hanya jenis galat, status HTTP, kode status Gemini
 * (mis. UNAVAILABLE / RESOURCE_EXHAUSTED / NOT_FOUND / PERMISSION_DENIED)
 * dan pesan pendek. API key, email, dan nomor telepon dibuang; isi prompt
 * (data siswa/kelas) tidak pernah ikut. Murni (tanpa server-only) supaya
 * mudah dites.
 */

const POLA_KUNCI_GOOGLE = /AIza[0-9A-Za-z_-]{20,}/g;

export function ringkasGalatAi(galat: unknown, apiKey?: string): string {
  const nama = galat instanceof Error ? galat.name : typeof galat;
  const status =
    galat && typeof galat === "object" && "status" in galat && typeof galat.status === "number"
      ? galat.status
      : null;
  const mentah =
    galat && typeof galat === "object" && "message" in galat && typeof galat.message === "string"
      ? galat.message
      : "";
  // Gemini mengemas galat sebagai JSON: {"error":{"code":503,"message":"...","status":"UNAVAILABLE"}}
  const kodeGemini = /"status"\s*:\s*"([A-Z_]+)"/.exec(mentah)?.[1] ?? null;
  const pesan = bersihkanGalat(mentah.replace(POLA_KUNCI_GOOGLE, "[disembunyikan]"), [apiKey]);

  return [`jenis=${nama}`, status !== null ? `http=${status}` : null, kodeGemini ? `gemini=${kodeGemini}` : null, `pesan=${pesan}`]
    .filter(Boolean)
    .join(" ");
}

/** Alasan respons kosong (diblokir filter keamanan / berhenti dini), tanpa isi teks apa pun. */
export function ringkasResponsKosong(respons: {
  promptFeedback?: { blockReason?: unknown } | null;
  candidates?: Array<{ finishReason?: unknown }> | null;
}): string {
  const blokir = respons.promptFeedback?.blockReason;
  const selesai = respons.candidates?.[0]?.finishReason;
  return [
    `blockReason=${blokir ? String(blokir) : "-"}`,
    `finishReason=${selesai ? String(selesai) : "-"}`,
    `jumlahKandidat=${respons.candidates?.length ?? 0}`,
  ].join(" ");
}
