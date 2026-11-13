import {
  buatEmailPembayaranBerhasil,
  buatEmailResetPassword,
  buatEmailSiswaBaru,
  type HasilEmail,
  type OpsiTampilanEmail,
} from "./templateEmail";

/**
 * Daftar SEMUA event email beserta data contohnya. Dipakai skrip pratinjau
 * (scripts/render-email-contoh.ts) dan tes (tests/email-template.test.ts) —
 * event baru wajib didaftarkan di sini supaya ikut terpratinjau dan terkena
 * tes (HTML aman, ada versi teks, dst). Data fiktif, tidak ada pengiriman.
 */

export interface ContohEmail {
  kunci: string;
  judul: string;
  buat: (opsi?: OpsiTampilanEmail) => HasilEmail;
}

export const CONTOH_EVENT_EMAIL: readonly ContohEmail[] = [
  {
    kunci: "siswa-baru",
    judul: "Siswa baru -> Mentor",
    buat: (opsi) =>
      buatEmailSiswaBaru(
        {
          namaMentor: "Rina Mentor",
          namaSiswa: "Budi Santoso",
          kelasNama: "Intensif UTBK 2027",
          jadwalDisplay: "Senin & Rabu, 16.00 - 17.30 WIB",
          tautan: "https://dimentoring.id/kelas-saya/contoh-kelas-id",
        },
        opsi,
      ),
  },
  {
    kunci: "siswa-baru-tanpa-jadwal",
    judul: "Siswa baru -> Mentor (jadwal belum diatur)",
    buat: (opsi) =>
      buatEmailSiswaBaru(
        {
          namaMentor: "Rina Mentor",
          namaSiswa: "Budi Santoso",
          kelasNama: "Intensif UTBK 2027",
          jadwalDisplay: null,
          tautan: "https://dimentoring.id/kelas-saya/contoh-kelas-id",
        },
        opsi,
      ),
  },
  {
    kunci: "reset-password",
    judul: "Reset password",
    buat: (opsi) =>
      buatEmailResetPassword(
        { nama: "Budi Santoso", resetLink: "https://dimentoring.id/reset-password?token=contoh-token-fiktif" },
        opsi,
      ),
  },
  {
    kunci: "pembayaran-berhasil",
    judul: "Pembayaran berhasil -> Siswa (bukti pembayaran)",
    buat: (opsi) =>
      buatEmailPembayaranBerhasil(
        {
          namaSiswa: "Budi Santoso",
          kelasNama: "Intensif UTBK 2027",
          namaMentor: "Rina Mentor",
          jadwalDisplay: "Senin & Rabu, 16.00 - 17.30 WIB",
          jumlahDibayar: "Rp90.000",
          kodePromo: "MERDEKA17",
          tanggalPembayaran: "14 November 2026 01.44 WIB",
          nomorPesanan: "DMT-20261114-0001",
          tautan: "https://dimentoring.id/kelas/contoh-kelas-id",
        },
        opsi,
      ),
  },
];
