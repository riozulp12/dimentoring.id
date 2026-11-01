import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";
import {
  KEBIJAKAN_EMAIL_KONTAK as EMAIL_KONTAK,
  KEBIJAKAN_PRIVASI_VERSI,
  KEBIJAKAN_REFUND,
  KEBIJAKAN_REFUND_VERSI,
  KEBIJAKAN_TANGGAL_BERLAKU as TANGGAL_BERLAKU,
  REFUND_PENGANTAR,
} from "@/lib/shared/kebijakan";

/**
 * Kebijakan Privasi & Refund — SATU halaman publik (statis, tanpa query
 * database), pola sama dengan app/assessment/page.tsx: Navbar landing page
 * yang berubah otomatis sesuai status login. Dua bagian terpisah dengan id
 * "privasi" dan "refund" (alamat lama /kebijakan-privasi & /kebijakan-refund
 * diarahkan permanen ke sini lewat next.config.ts), masing-masing punya
 * "Berlaku sejak" dan "Versi" sendiri.
 *
 * Sumber teks: docs/legal/kebijakan-privasi-v1.md (Privasi) dan
 * docs/legal/kebijakan-refund-v1.md (Refund; teksnya hidup di
 * lib/shared/kebijakan.ts). Kalau isinya berubah, perbarui file itu, naikkan
 * versi, dan ganti tanggal berlaku. Halaman ini sengaja tidak menyebut nama
 * brand penyedia layanan pihak ketiga.
 */

export const metadata: Metadata = {
  title: "Kebijakan Privasi & Refund | dimentoring.id",
  description:
    "Kebijakan privasi dan kebijakan refund pembelian kelas di dimentoring.id: data apa yang kami kumpulkan, hak kamu, dan cara pengembalian dana.",
};

const pClass = "text-sm leading-[1.7] text-black sm:text-base";
const ulClass = "flex list-disc flex-col gap-1.5 pl-5 text-sm leading-[1.7] text-black sm:text-base";
const h2Class = "text-xl font-bold tracking-[-0.02em] text-black sm:text-2xl";
const h3Class = "text-lg font-semibold text-black sm:text-xl";
const metaClass = "text-sm text-[#7E7C7C] sm:text-base";
// Offset supaya judul bagian tidak tertutup Navbar saat lompat ke #privasi / #refund.
const anchorClass = "flex scroll-mt-24 flex-col gap-6 sm:gap-8";

function EmailLink() {
  return (
    <a href={`mailto:${EMAIL_KONTAK}`} className="font-medium text-[#081EEA]">
      {EMAIL_KONTAK}
    </a>
  );
}

export default async function KebijakanPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const navbarProps = await getNavbarProps(session);

  return (
    <div className="flex w-full flex-col">
      <Navbar {...navbarProps} />
      <main className="mx-auto w-full max-w-[900px] flex-1 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:px-0 lg:py-16">
        <div className="mb-8 flex flex-col gap-2 sm:mb-10">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">
            Kebijakan Privasi &amp; Refund
          </h1>
          <p className={metaClass}>dimentoring.id</p>
        </div>

        <nav
          aria-label="Daftar isi"
          className="mb-10 flex flex-col gap-2 rounded-[16px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:mb-12"
        >
          <p className="text-sm font-semibold text-black sm:text-base">Daftar isi</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm sm:text-base">
            <li>
              <Link href="#privasi" className="font-medium text-[#081EEA]">
                Kebijakan Privasi
              </Link>
            </li>
            <li>
              <Link href="#refund" className="font-medium text-[#081EEA]">
                Kebijakan Refund
              </Link>
            </li>
          </ul>
        </nav>

        <div className="flex flex-col gap-12 sm:gap-16">
          <section id="privasi" aria-labelledby="judul-privasi" className={anchorClass}>
            <div className="flex flex-col gap-2">
              <h2 id="judul-privasi" className={h2Class}>
                Kebijakan Privasi dimentoring.id
              </h2>
              <p className={metaClass}>
                Berlaku sejak: {TANGGAL_BERLAKU} · Versi: {KEBIJAKAN_PRIVASI_VERSI}
              </p>
            </div>

            <p className={pClass}>
              Kebijakan ini menjelaskan data apa yang kami kumpulkan di dimentoring.id, untuk apa, dan hak kamu atas
              data itu. Kami menyusunnya mengacu pada Undang-Undang Pelindungan Data Pribadi (UU No. 27 Tahun 2022).
            </p>

            <div className="flex flex-col gap-8 sm:gap-10">
              <section className="flex flex-col gap-2.5">
                <h3 className={h3Class}>1. Siapa kami</h3>
                <p className={pClass}>
                  Layanan di dimentoring.id dikelola oleh tim pengelola dimentoring.id, beralamat di Maguwoharjo, Kec.
                  Depok, Kabupaten Sleman, Daerah Istimewa Yogyakarta 55281. Untuk pertanyaan soal data pribadi,
                  hubungi <EmailLink /> atau 0822-2598-2026.
                </p>
              </section>

              <section className="flex flex-col gap-2.5">
                <h3 className={h3Class}>2. Data yang kami kumpulkan</h3>
                <ul className={ulClass}>
                  <li>
                    <span className="font-semibold">Akun:</span> nama, email, nomor WhatsApp, tingkat kelas, dan data
                    profil yang kamu isi sendiri (mis. sekolah, kota). Untuk mentor: PTN, semester, dan jurusan.
                  </li>
                  <li>
                    <span className="font-semibold">Assessment:</span> nilai rapor, data prestasi, dan pilihan
                    PTN/jurusan yang kamu masukkan, beserta hasil perhitungannya.
                  </li>
                  <li>
                    <span className="font-semibold">Nomor WhatsApp dari formulir hasil Assessment:</span> hanya kalau
                    kamu mengisinya sendiri dan mencentang persetujuan.
                  </li>
                  <li>
                    <span className="font-semibold">Kegiatan belajar:</span> pendaftaran kelas, presensi sesi, dan
                    hasil try out.
                  </li>
                  <li>
                    <span className="font-semibold">Pembayaran:</span> diproses oleh penyedia layanan pembayaran pihak
                    ketiga. Kami tidak menyimpan nomor kartu atau rekening kamu.
                  </li>
                  <li>
                    <span className="font-semibold">Data teknis:</span> cookie sesi login, cookie percobaan Assessment
                    tanpa login, dan cookie atribusi iklan (sumber/kampanye tautan yang kamu klik). Cookie ini tidak
                    berisi nama atau kontak.
                  </li>
                </ul>
              </section>

              <section className="flex flex-col gap-2.5">
                <h3 className={h3Class}>3. Untuk apa kami memakainya</h3>
                <ul className={ulClass}>
                  <li>Menjalankan akun, kelas, presensi, dan pembayaran.</li>
                  <li>Menghitung dan menampilkan hasil Assessment dan rekomendasi belajar.</li>
                  <li>
                    Menghubungi kamu lewat WhatsApp <span className="font-semibold">hanya</span> jika kamu
                    menyetujuinya, untuk membahas hasil Assessment dan informasi layanan kami.
                  </li>
                  <li>
                    Memahami iklan atau tautan mana yang membawa pengunjung, supaya kami bisa memperbaiki layanan.
                  </li>
                  <li>Menjaga keamanan dan mencegah penyalahgunaan.</li>
                </ul>
                <p className={pClass}>Kami tidak menjual data pribadi kamu.</p>
              </section>

              <section className="flex flex-col gap-2.5">
                <h3 className={h3Class}>4. Dasar pemrosesan</h3>
                <p className={pClass}>
                  Persetujuan kamu (misalnya saat mengisi nomor WhatsApp di formulir) dan kebutuhan untuk menjalankan
                  layanan yang kamu daftar.
                </p>
              </section>

              <section className="flex flex-col gap-2.5">
                <h3 className={h3Class}>5. Pengguna di bawah 18 tahun</h3>
                <p className={pClass}>
                  Banyak pengguna kami adalah pelajar SMA. Kalau usiamu di bawah 18 tahun, minta izin orang tua atau
                  wali sebelum mengisi nomor WhatsApp atau mendaftar. Orang tua atau wali boleh menghubungi kami kapan
                  saja untuk meminta data anak dihapus atau persetujuan ditarik.
                </p>
              </section>

              <section className="flex flex-col gap-2.5">
                <h3 className={h3Class}>6. Dengan siapa data dibagikan</h3>
                <ul className={ulClass}>
                  <li>
                    <span className="font-semibold">Penyedia layanan teknis pihak ketiga:</span> penyimpanan data dan
                    hosting, pembayaran, layanan masuk dengan akun pihak ketiga, dan layanan kecerdasan buatan untuk
                    membuat catatan hasil Assessment. Data yang dikirim ke layanan kecerdasan buatan tidak memuat nama
                    atau kontak kamu.
                  </li>
                  <li>
                    <span className="font-semibold">Mentor:</span> hanya melihat data siswa yang mereka bimbing,
                    sebatas yang diperlukan untuk kelas.
                  </li>
                  <li>
                    <span className="font-semibold">Pihak lain:</span> hanya bila diwajibkan hukum.
                  </li>
                </ul>
                <p className={pClass}>
                  Penyedia layanan teknis dapat berubah dari waktu ke waktu. Kami hanya memilih penyedia yang
                  menerapkan pengamanan data yang wajar.
                </p>
              </section>

              <section className="flex flex-col gap-2.5">
                <h3 className={h3Class}>7. Cookie</h3>
                <p className={pClass}>
                  Kami memakai cookie untuk login, membatasi percobaan Assessment tanpa login, dan mencatat sumber
                  kunjungan. Cookie atribusi disimpan paling lama 30 hari. Kamu bisa menghapus cookie lewat pengaturan
                  browser.
                </p>
              </section>

              <section className="flex flex-col gap-2.5">
                <h3 className={h3Class}>8. Penyimpanan dan keamanan</h3>
                <p className={pClass}>
                  Data disimpan di server penyedia layanan kami dengan akses terbatas. Nomor WhatsApp dari formulir
                  kami simpan paling lama 12 bulan sejak kontak terakhir, kecuali kamu mendaftar sebagai pengguna.
                  Setelah itu kami hapus atau anonimkan.
                </p>
              </section>

              <section className="flex flex-col gap-2.5">
                <h3 className={h3Class}>9. Hak kamu</h3>
                <p className={pClass}>
                  Kamu berhak meminta akses, memperbaiki, menghapus data, dan menarik persetujuan kapan saja. Kirim
                  permintaan ke <EmailLink />. Kami berusaha menanggapi dalam 30 hari kerja.
                </p>
              </section>

              <section className="flex flex-col gap-2.5">
                <h3 className={h3Class}>10. Perubahan kebijakan</h3>
                <p className={pClass}>
                  Kalau kebijakan ini berubah, kami memperbarui tanggal dan versi di atas, dan memberi tahu pengguna
                  terdaftar untuk perubahan yang penting.
                </p>
              </section>
            </div>
          </section>

          <section
            id="refund"
            aria-labelledby="judul-refund"
            className={`${anchorClass} border-t border-[#E3E3E3] pt-10 sm:pt-12`}
          >
            <div className="flex flex-col gap-2">
              <h2 id="judul-refund" className={h2Class}>
                Kebijakan Refund
              </h2>
              <p className={metaClass}>
                Berlaku sejak: {TANGGAL_BERLAKU} · Versi: {KEBIJAKAN_REFUND_VERSI}
              </p>
            </div>

            <p className={pClass}>{REFUND_PENGANTAR}</p>

            <div className="flex flex-col gap-8 sm:gap-10">
              {KEBIJAKAN_REFUND.map((poin) => (
                <section key={poin.judul} className="flex flex-col gap-2.5">
                  <h3 className={h3Class}>{poin.judul}</h3>
                  {poin.paragraf?.map((teks) => (
                    <p key={teks} className={pClass}>
                      {teks}
                    </p>
                  ))}
                  {poin.butir ? (
                    <ul className={ulClass}>
                      {poin.butir.map((teks) => (
                        <li key={teks}>{teks}</li>
                      ))}
                    </ul>
                  ) : null}
                  {poin.penutup?.map((teks) => (
                    <p key={teks} className={pClass}>
                      {teks}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
