import "server-only";
import { bersihkanGalat } from "@/lib/notifikasi/logAman";
import type { HasilKirimWa, PenyediaWa } from "./types";

/**
 * Penyedia WhatsApp: Fonnte (https://docs.fonnte.com/api-send-message/).
 *
 *   POST https://api.fonnte.com/send
 *   Header  Authorization: <token>        (tanpa "Bearer")
 *   Body    target  = nomor (string)       message = teks (string)
 *   Respons {status:true,id:[...],process,requestid,...}  atau
 *           {status:false,reason:"...",requestid}  — HTTP-nya tetap 200,
 *           jadi keberhasilan SELALU dibaca dari field `status`, bukan kode HTTP.
 *
 * Token hanya dipegang di sini (sisi server), dikirim lewat header, dan tidak
 * pernah masuk log, galat, atau hasil yang dikembalikan.
 *
 * Satu pesan per panggilan: pesannya dipersonalisasi per mentor, jadi
 * parameter `delay` Fonnte (jeda antar BANYAK target dalam satu panggilan) tidak
 * dipakai; jeda antar mentor diatur pemanggil lewat sleep().
 */

const ENDPOINT = "https://api.fonnte.com/send";
const TIMEOUT_MS = 10_000;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function buatPenyediaFonnte(opsi: { token: string; fetchFn?: FetchLike; timeoutMs?: number }): PenyediaWa {
  const { token } = opsi;
  const fetchFn: FetchLike = opsi.fetchFn ?? ((input, init) => fetch(input, init));
  const timeoutMs = opsi.timeoutMs ?? TIMEOUT_MS;

  return {
    nama: "fonnte",
    async kirim(target: string, pesan: string): Promise<HasilKirimWa> {
      let response: Response;
      try {
        response = await fetchFn(ENDPOINT, {
          method: "POST",
          headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
          // target & message wajib string (angka ditolak Fonnte)
          body: new URLSearchParams({ target: String(target), message: String(pesan) }).toString(),
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });
      } catch (error) {
        const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        return { ok: false, error: timeout ? "timeout" : "gagal terhubung ke Fonnte" };
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        return { ok: false, error: `respons Fonnte bukan JSON (HTTP ${response.status})` };
      }

      const badan = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
      // Dokumentasi menulis `status` dan (di sebagian contoh) `Status`.
      const status = badan.status ?? badan.Status;
      if (status === true) {
        const id = Array.isArray(badan.id) ? badan.id[0] : badan.id;
        // requestid di dokumentasi berupa angka; terima angka maupun string.
        const requestId = typeof badan.requestid === "string" || typeof badan.requestid === "number" ? String(badan.requestid) : null;
        const ref = id != null ? String(id) : requestId;
        return { ok: true, ref };
      }

      const alasan = typeof badan.reason === "string" ? badan.reason : `HTTP ${response.status}`;
      return { ok: false, error: bersihkanGalat(alasan, [token]) };
    },
  };
}
