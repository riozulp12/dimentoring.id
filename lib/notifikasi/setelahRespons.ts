import "server-only";
import { after } from "next/server";

/**
 * Jalankan pekerjaan sampingan (email, WhatsApp) SETELAH respons dikirim, supaya
 * webhook pembayaran / pendaftaran tidak menunggu layanan luar dan tidak pernah
 * gagal gara-gara layanan itu.
 *
 * Di dalam request Next.js: dijadwalkan lewat after() (di Vercel dijaga tetap
 * hidup sampai selesai). Di luar request (skrip, tes): dijalankan langsung dan
 * ditunggu, supaya perilakunya deterministik.
 *
 * `tugas` TIDAK PERNAH melempar galat ke pemanggil: semua galat ditangkap dan
 * dicatat tanpa detail (label saja).
 */
export async function jalankanSetelahRespons(label: string, tugas: () => Promise<void>): Promise<void> {
  const aman = async () => {
    try {
      await tugas();
    } catch (error) {
      const nama = error instanceof Error ? error.name : "galat";
      console.error(`[${label}] tugas latar gagal (${nama}).`);
    }
  };

  try {
    after(aman);
    return;
  } catch {
    // di luar lingkup request -> jalankan langsung
  }
  await aman();
}
