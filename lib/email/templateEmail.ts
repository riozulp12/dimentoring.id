import { renderEmailLayout, satuBaris, type BarisKartu } from "./layoutEmail";

/**
 * Isi email per event, di atas layout bersama (layoutEmail.ts). Hanya
 * TAMPILAN/isi — kapan email dikirim dan lewat apa tetap urusan file
 * kirimEmail*.ts / lib/notifikasi. Bebas "server-only" supaya bisa dipakai tes
 * dan skrip pratinjau.
 */

export interface HasilEmail {
  subjek: string;
  html: string;
  teks: string;
}

export interface OpsiTampilanEmail {
  /** Dasar gambar logo/ikon; bawaan produksi. Pratinjau lokal boleh menimpa. */
  asetBaseUrl?: string;
}

// ---- Siswa baru -> Mentor ---------------------------------------------------

export interface IsiEmailSiswaBaru {
  namaMentor: string;
  namaSiswa: string;
  kelasNama: string;
  /** null = jadwal belum diatur -> baris jadwal tidak ditampilkan. */
  jadwalDisplay: string | null;
  tautan: string;
}

export function buatSubjekSiswaBaru(kelasNama: string): string {
  return `Ada siswa baru di kelas ${satuBaris(kelasNama, 100)}`;
}

export function buatEmailSiswaBaru(isi: IsiEmailSiswaBaru, opsi: OpsiTampilanEmail = {}): HasilEmail {
  const baris: BarisKartu[] = [
    { label: "Siswa", nilai: isi.namaSiswa },
    { label: "Kelas", nilai: isi.kelasNama },
    ...(isi.jadwalDisplay ? [{ label: "Jadwal", nilai: isi.jadwalDisplay }] : []),
  ];
  const { html, teks } = renderEmailLayout({
    namaEvent: "Siswa Baru di Kelasmu",
    paragrafPendukung: "Ada siswa yang baru saja bergabung dan menunggu sambutan hangat darimu.",
    namaPenerima: isi.namaMentor,
    pembuka: "Kabar baik! Ada siswa baru yang bergabung di kelas yang kamu ampu. Berikut ringkasannya.",
    isi: baris,
    tombol: { label: "Lihat Detail Kelas", url: isi.tautan },
    catatan: "Penerimaan siswa dilakukan di web, bukan lewat email ini. Buka tombol di atas untuk melihat dan menerimanya.",
    asetBaseUrl: opsi.asetBaseUrl,
  });
  return { subjek: buatSubjekSiswaBaru(isi.kelasNama), html, teks };
}

// ---- Reset password ---------------------------------------------------------

export interface IsiEmailResetPassword {
  nama: string;
  resetLink: string;
}

export const SUBJEK_RESET_PASSWORD = "Reset Password Dimentoring";

export function buatEmailResetPassword(isi: IsiEmailResetPassword, opsi: OpsiTampilanEmail = {}): HasilEmail {
  const { html, teks } = renderEmailLayout({
    namaEvent: "Reset Password",
    paragrafPendukung: "Atur ulang password akun Dimentoring kamu dengan aman.",
    namaPenerima: isi.nama,
    pembuka:
      "Kami menerima permintaan untuk mengatur ulang password akun Dimentoring kamu. Klik tombol di bawah untuk membuat password baru.",
    isi: [{ label: "Masa berlaku tautan", nilai: "30 menit" }],
    tombol: { label: "Buat Password Baru", url: isi.resetLink },
    catatan:
      "Kalau kamu tidak merasa meminta reset password, abaikan saja email ini. Password akun kamu tetap aman dan tidak berubah.",
    asetBaseUrl: opsi.asetBaseUrl,
  });
  return { subjek: SUBJEK_RESET_PASSWORD, html, teks };
}

// ---- Pembayaran berhasil -> Siswa -------------------------------------------
// Template saja: BELUM ada pengiriman email untuk event ini (notifikasi
// pembayaran berhasil sekarang hanya di dalam web). Tidak dipanggil dari alur
// pembayaran/webhook manapun.

export interface IsiEmailPembayaranBerhasil {
  namaSiswa: string;
  kelasNama: string;
  jadwalDisplay: string | null;
  tautan: string;
}

export function buatSubjekPembayaranBerhasil(kelasNama: string): string {
  return `Pembayaran berhasil untuk kelas ${satuBaris(kelasNama, 100)}`;
}

export function buatEmailPembayaranBerhasil(isi: IsiEmailPembayaranBerhasil, opsi: OpsiTampilanEmail = {}): HasilEmail {
  const baris: BarisKartu[] = [
    { label: "Kelas", nilai: isi.kelasNama },
    ...(isi.jadwalDisplay ? [{ label: "Jadwal", nilai: isi.jadwalDisplay }] : []),
  ];
  const { html, teks } = renderEmailLayout({
    namaEvent: "Pembayaran Berhasil",
    paragrafPendukung: "Terima kasih, pembayaran kamu sudah kami terima.",
    namaPenerima: isi.namaSiswa,
    pembuka: "Pembayaran kamu sudah kami konfirmasi dan kamu resmi terdaftar di kelas berikut. Selamat belajar, kami dampingi sampai berhasil!",
    isi: baris,
    tombol: { label: "Lihat Detail Kelas", url: isi.tautan },
    asetBaseUrl: opsi.asetBaseUrl,
  });
  return { subjek: buatSubjekPembayaranBerhasil(isi.kelasNama), html, teks };
}
