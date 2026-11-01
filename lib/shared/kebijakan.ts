/**
 * Halaman gabungan "Kebijakan Privasi & Refund" (/kebijakan) — alamat, versi,
 * tanggal berlaku, dan teks Kebijakan Refund. Dipakai halaman /kebijakan,
 * footer, form daftar, Lead Capture, Pengaturan, dan Checkout supaya alamat &
 * isinya satu sumber. Teks Privasi tetap di app/kebijakan/page.tsx
 * (sumber: docs/legal/kebijakan-privasi-v1.md); teks Refund di bawah
 * (sumber: docs/legal/kebijakan-refund-v1.md).
 *
 * Tanpa "server-only" supaya aman diimpor dari Server maupun Client Component.
 */

export const HREF_KEBIJAKAN = "/kebijakan";
export const HREF_KEBIJAKAN_PRIVASI = "/kebijakan#privasi";
export const HREF_KEBIJAKAN_REFUND = "/kebijakan#refund";

export const KEBIJAKAN_TANGGAL_BERLAKU = "5 November 2026";
export const KEBIJAKAN_PRIVASI_VERSI = "v1";
export const KEBIJAKAN_REFUND_VERSI = "v1";

export const KEBIJAKAN_EMAIL_KONTAK = "info.dimentoring@gmail.com";

export const REFUND_PENGANTAR = "Berlaku untuk pembelian kelas di dimentoring.id.";

export interface PoinRefund {
  judul: string;
  /** Paragraf biasa (urut tampil sebelum `butir`). */
  paragraf?: string[];
  /** Daftar poin (bullet). */
  butir?: string[];
  /** Paragraf penutup setelah `butir`. */
  penutup?: string[];
}

export const KEBIJAKAN_REFUND: PoinRefund[] = [
  {
    judul: "1. Sebelum sesi pertama",
    paragraf: [
      "Kamu bisa membatalkan kelas sebelum sesi pertama berjalan. Uang yang kamu bayar dikembalikan penuh, dikurangi biaya transaksi pembayaran (Rp2.775 per transaksi).",
    ],
  },
  {
    judul: "2. Setelah sesi berjalan",
    paragraf: [
      "Uang yang dikembalikan dihitung dari sesi yang belum terpakai: sisa sesi yang belum terpakai × nilai per sesi − biaya transaksi. Sesi dianggap terpakai kalau sudah terlaksana dan tidak disangkal (dikonfirmasi siswa atau terkonfirmasi otomatis). Sesi yang sudah terpakai tidak dikembalikan. Nilai per sesi dihitung dari harga yang benar-benar kamu bayar.",
      "Contoh: kelas private 10 sesi seharga Rp1.000.000 (Rp100.000 per sesi). Kamu berhenti setelah 3 sesi terpakai. Sisa 7 sesi × Rp100.000 = Rp700.000, dikurangi Rp2.775 = Rp697.225 dikembalikan.",
    ],
  },
  {
    judul: "3. Kelas grup",
    paragraf: ["Hitungannya sama, memakai bagian kursimu. Kalau kamu keluar, anggota lain tetap melanjutkan kelas."],
  },
  {
    judul: "4. Kalau kami yang membatalkan",
    paragraf: [
      "Kalau kelas tidak jadi dibuka (misalnya kelas grup belum cukup siswa) atau kami tidak bisa menyediakan mentor, kamu bisa pindah jadwal atau mentor, atau uangmu dikembalikan penuh termasuk biaya transaksi.",
    ],
  },
  {
    judul: "5. Yang tidak dikembalikan",
    butir: [
      "Sesi yang sudah terpakai.",
      "Sesi yang kamu lewatkan tanpa kabar paling lambat 24 jam sebelum sesi dimulai, kalau mentor sudah hadir pada jadwalnya. Kalau kamu mengabari sebelum batas itu, kamu mendapat satu kali sesi pengganti per paket.",
      "Kelas gratis atau beasiswa.",
    ],
  },
  {
    judul: "6. Pindah online ↔ offline",
    paragraf: [
      "Bisa satu kali per paket untuk sesi yang belum dijadwalkan, dengan pemberitahuan paling lambat 2 hari sebelum sesi dimulai. Dari online ke offline kamu membayar selisih harga sisa sesi. Dari offline ke online selisihnya menjadi saldo kredit (bukan uang tunai) untuk pembelian berikutnya, berlaku 6 bulan. Offline di Yogyakarta tergantung ketersediaan mentor.",
    ],
  },
  {
    judul: "7. Cara mengajukan",
    paragraf: [
      `Kirim permintaan ke ${KEBIJAKAN_EMAIL_KONTAK} atau WhatsApp 0822-2598-2026 dengan menyebut nama, kelas, dan alasan. Kalau kamu di bawah 18 tahun, orang tua atau wali boleh mengajukan. Kami menanggapi dalam 3 hari kerja, dan uang dikembalikan ke metode pembayaran asal atau rekening atas nama pembeli paling lambat 14 hari kerja setelah disetujui.`,
    ],
  },
];

/** Ringkasan 3 baris di Checkout (baris ke-3 diberi tautan ke bagian Refund). */
export const RINGKASAN_REFUND_CHECKOUT = [
  "Batal sebelum sesi pertama: dana kembali penuh (dikurangi biaya transaksi).",
  "Setelah kelas berjalan: dana kembali untuk sesi yang belum terpakai.",
] as const;
