import "server-only";
import { GoogleGenAI } from "@google/genai";

/**
 * Generate deskripsi kelas — PRD Bagian 7.5.1 (pola sama dengan
 * lib/ai/generateNote.ts, BR-30). Dipicu Admin dari form Kelola Kelas
 * (app/api/kelola-kelas/generate-deskripsi/route.ts). Beda dari generateNote:
 * TIDAK ada fallback teks generik kalau gagal — deskripsi kelas adalah
 * konten yang Admin kontrol penuh, lebih baik Admin tahu AI gagal (isi
 * manual) daripada diam-diam ke-isi teks generik yang salah konteks.
 */

const MODEL = "gemini-2.5-flash-lite";
const GENERATE_TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = `Kamu adalah asisten Dimentoring, platform bimbingan belajar persiapan masuk PTN untuk siswa SMA Indonesia. Tulis deskripsi singkat (2-3 kalimat) untuk sebuah kelas bimbingan belajar, menjelaskan apa yang akan didapat siswa dari kelas ini.

ATURAN KETAT:
- JANGAN mengarang detail spesifik yang tidak diberikan (jadwal, harga, nama mentor, link).
- Nada menarik dan meyakinkan, tapi jujur — bukan basa-basi kosong.
- Bahasa Indonesia santai tapi sopan, sesuai gaya bicara ke siswa SMA.
- JANGAN sertakan salam pembuka/penutup ('Halo!', dsb) — langsung isi deskripsinya saja.
- Maksimal 3 kalimat, jangan bertele-tele.`;

export interface GenerateKelasDeskripsiInput {
  namaKelas: string;
  tingkatKelasLabel: string;
  tipeKelasLabel: string;
  subtesNama: string;
}

function buildUserPrompt(data: GenerateKelasDeskripsiInput): string {
  return [
    `Nama Kelas: ${data.namaKelas}`,
    `Tingkat: ${data.tingkatKelasLabel}`,
    `Tipe Kelas: ${data.tipeKelasLabel}`,
    `Subtes: ${data.subtesNama}`,
  ].join("\n");
}

/** null = gagal generate (API key belum diset, error, atau respons kosong). */
export async function generateKelasDeskripsi(data: GenerateKelasDeskripsiInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[generateKelasDeskripsi] GEMINI_API_KEY belum diset di .env.local.");
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildUserPrompt(data),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        abortSignal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      },
    });

    const text = response.text?.trim();
    return text || null;
  } catch (error) {
    console.error("[generateKelasDeskripsi] Gagal generate deskripsi AI:", error);
    return null;
  }
}
