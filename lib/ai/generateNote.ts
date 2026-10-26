import "server-only";
import { GoogleGenAI } from "@google/genai";
import { CATATAN_CADANGAN, rapikanCatatan } from "@/lib/shared/catatanAssessment";

/**
 * Generate section "Note" — PRD Bagian 7.4.3 accordion #4 (direvisi), BR-30.
 *
 * Dipanggil dari app/api/assessment/snbp/route.ts (Sesi 1) setelah Keketatan &
 * Peluang selesai dihitung, SEBELUM response dikirim ke frontend. Hasilnya
 * disimpan ke assessments.note_ai supaya konsisten & tidak digenerate ulang
 * tiap halaman hasil dibuka.
 *
 * BR-30 (WAJIB, bukan opsional): prompt yang dikirim ke Gemini hanya berisi
 * data numerik/kategorikal anonim, TIDAK PERNAH nama/email/no. WA siswa.
 *
 * Worst-case ~25 detik (12s timeout + ~1s jeda + 12s timeout retry) kalau
 * kedua percobaan sama-sama timeout — caller (app/api/assessment/snbp)
 * WAJIB pastikan UI submit tetap ada loading indicator yang jelas selama
 * itu, jangan sampai terasa nge-hang.
 */

const MODEL = "gemini-3.5-flash-lite";
const GENERATE_TIMEOUT_MS = 12000;
const RETRY_DELAY_MS = 900;

// Teks cadangan & penyaring gaya ada di modul murni supaya bisa dites dan
// dipakai juga oleh halaman hasil (data lama yang note_ai-nya masih NULL).
const FALLBACK_NOTE = CATATAN_CADANGAN;

// Aturan inti PRD Bagian 7.4.3 #6 (tidak memberi kepastian, nada hangat tapi
// jujur, sebut angka/label, tanpa salam, maksimal 4 kalimat) tetap dipertahankan.
// Revisi v2: tambahan aturan gaya bahasa + contoh benar vs salah.
const SYSTEM_PROMPT = `Kamu adalah asisten Dimentoring, platform bimbingan masuk PTN untuk siswa SMA Indonesia. Tulis catatan singkat (2-4 kalimat) untuk siswa berdasarkan hasil Assessment Prediksi PTN mereka.

ATURAN KETAT:
- JANGAN PERNAH memberi kepastian soal kelulusan (dilarang: 'pasti keterima', 'dijamin lolos', 'aman banget'). Selalu bingkai sebagai estimasi/kemungkinan.
- Nada hangat dan mendorong, tapi jujur, bukan basa-basi kosong.
- Sebutkan angka/label spesifik yang diberikan supaya terasa personal.
- JANGAN sertakan salam pembuka/penutup ('Halo!', 'Semangat ya!' di akhir), langsung isi catatannya saja.
- Maksimal 4 kalimat, jangan bertele-tele.

GAYA BAHASA:
- Tulis seperti kakak kelas yang ngobrol biasa: bahasa Indonesia sehari-hari, kalimat pendek, mudah dipahami.
- JANGAN pakai tanda pisah atau strip sebagai jeda kalimat (—, –, atau -). Pakai titik atau koma saja. Strip hanya boleh untuk kata ulang (kira-kira) atau nama resmi.
- JANGAN pakai bullet, daftar, atau format tebal. Cukup satu paragraf.
- JANGAN buka dengan kalimat klise seperti 'Berikut adalah', 'Berdasarkan data yang diberikan', 'Sebagai asisten'.
- Hindari kata yang kaku atau berlebihan seperti 'optimal', 'signifikan', 'mengoptimalkan', 'luar biasa', 'perjalanan akademik'.

CONTOH SALAH:
"Berdasarkan data yang diberikan, Nilai Akhir kamu 88 (Tinggi) — ini menunjukkan potensi yang signifikan untuk mengoptimalkan peluangmu di Pilihan 1 yang Sangat Ketat."

CONTOH BENAR:
"Nilai Akhir kamu 88, sudah masuk kategori Tinggi. Tapi Pilihan 1 kamu Sangat Ketat, jadi peluangnya masih Sedang. Coba siapkan pilihan cadangan yang sedikit lebih longgar, sambil terus jaga nilai rapormu."`;

interface PilihanNoteInput {
  jenjang: string;
  jurusan: string;
  keketatanLabel: string;
  peluangLabel: string;
}

interface GenerateAssessmentNoteInput {
  nilaiAkhir: number;
  nilaiAkhirLabel: string;
  pilihan: PilihanNoteInput[];
}

function buildUserPrompt(data: GenerateAssessmentNoteInput): string {
  const pilihanLines = data.pilihan
    .map(
      (p, index) =>
        `Pilihan ${index + 1}: ${p.jenjang} ${p.jurusan}. Keketatan: ${p.keketatanLabel}, Peluang: ${p.peluangLabel}`,
    )
    .join("\n");

  return [`Nilai Akhir: ${data.nilaiAkhir} (${data.nilaiAkhirLabel})`, pilihanLines]
    .filter(Boolean)
    .join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(ai: GoogleGenAI, data: GenerateAssessmentNoteInput): Promise<string | null> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildUserPrompt(data),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      abortSignal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
    },
  });

  // Penyaring pasca-proses: buang sisa tanda pisah/strip yang tidak pada
  // tempatnya walau model tidak patuh instruksi gaya di atas.
  const text = rapikanCatatan(response.text?.trim() ?? "");
  return text ? text : null;
}

export async function generateAssessmentNote(
  data: GenerateAssessmentNoteInput,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[generateAssessmentNote] GEMINI_API_KEY belum diset di .env.local.");
    return FALLBACK_NOTE;
  }

  const ai = new GoogleGenAI({ apiKey });

  // Ditemukan lewat testing (Agustus 2026): kegagalan didominasi AbortError
  // (timeout kena batas sebelum Gemini sempat jawab) dan ApiError 503
  // UNAVAILABLE (model lagi overload di sisi Google) — bukan rate limit/quota.
  // SATU retry setelah jeda singkat cukup buat model yang overload sempat
  // pulih, tanpa bikin percobaan berkali-kali yang justru menambah beban.
  try {
    const text = await callGemini(ai, data);
    if (text) return text;
  } catch (error) {
    console.error("[generateAssessmentNote] Percobaan pertama gagal, retry sekali setelah jeda:", error);
    await sleep(RETRY_DELAY_MS);
    try {
      const text = await callGemini(ai, data);
      if (text) return text;
    } catch (retryError) {
      console.error("[generateAssessmentNote] Percobaan retry juga gagal:", retryError);
    }
  }

  return FALLBACK_NOTE;
}
