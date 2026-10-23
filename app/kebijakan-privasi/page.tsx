import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";

/**
 * Kebijakan Privasi v1 — public route, statis (tanpa query database), pola sama
 * dengan app/assessment/page.tsx & app/beasiswa-event/page.tsx: pakai Navbar
 * landing page yang berubah otomatis sesuai status login.
 *
 * Sumber teks: docs/legal/kebijakan-privasi-v1.md. Kalau isinya berubah,
 * perbarui file itu, naikkan VERSI, dan ganti TANGGAL_BERLAKU. Halaman ini
 * sengaja tidak menyebut nama brand penyedia layanan pihak ketiga.
 */

const PUBLISH_STATUS_DRAFT = false;
const TANGGAL_BERLAKU = "23 Oktober 2026";
const VERSI = "v1";
const EMAIL_KONTAK = "info.dimentoring@gmail.com";

const pClass = "text-sm leading-[1.7] text-black sm:text-base";
const ulClass = "flex list-disc flex-col gap-1.5 pl-5 text-sm leading-[1.7] text-black sm:text-base";
const h2Class = "text-lg font-semibold text-black sm:text-xl";

function EmailLink() {
  return (
    <a href={`mailto:${EMAIL_KONTAK}`} className="font-medium text-[#081EEA]">
      {EMAIL_KONTAK}
    </a>
  );
}

export default async function KebijakanPrivasiPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const navbarProps = await getNavbarProps(session);

  return (
    <div className="flex w-full flex-col">
      <Navbar {...navbarProps} />
      <main className="mx-auto w-full max-w-[900px] flex-1 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:px-0 lg:py-16">
        <div className="mb-8 flex flex-col gap-2 sm:mb-10">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">
            Kebijakan Privasi dimentoring.id
          </h1>
          <p className="text-sm text-[#7E7C7C] sm:text-base">
            Berlaku sejak: {TANGGAL_BERLAKU} · Versi: {VERSI}
          </p>
        </div>

        {PUBLISH_STATUS_DRAFT ? (
          <div className="mb-8 rounded-[16px] border border-[#081EEA]/30 bg-[#F9FAFF] px-5 py-4 sm:mb-10">
            <p className="text-sm leading-[1.6] text-black sm:text-base">
              <span className="font-semibold">Halaman ini masih berupa draf</span> yang sedang direview tim kami,
              belum menjadi kebijakan resmi final. Isinya bisa berubah sebelum dipublikasikan.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-8 sm:gap-10">
          <p className={pClass}>
            Kebijakan ini menjelaskan data apa yang kami kumpulkan di dimentoring.id, untuk apa, dan hak kamu atas
            data itu. Kami menyusunnya mengacu pada Undang-Undang Pelindungan Data Pribadi (UU No. 27 Tahun 2022).
          </p>

          <section className="flex flex-col gap-2.5">
            <h2 className={h2Class}>1. Siapa kami</h2>
            <p className={pClass}>
              Layanan di dimentoring.id dikelola oleh tim pengelola dimentoring.id, beralamat di Maguwoharjo, Kec.
              Depok, Kabupaten Sleman, Daerah Istimewa Yogyakarta 55281. Untuk pertanyaan soal data pribadi, hubungi{" "}
              <EmailLink /> atau 0822-2598-2026.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className={h2Class}>2. Data yang kami kumpulkan</h2>
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
                <span className="font-semibold">Kegiatan belajar:</span> pendaftaran kelas, presensi sesi, dan hasil
                try out.
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
            <h2 className={h2Class}>3. Untuk apa kami memakainya</h2>
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
            <h2 className={h2Class}>4. Dasar pemrosesan</h2>
            <p className={pClass}>
              Persetujuan kamu (misalnya saat mengisi nomor WhatsApp di formulir) dan kebutuhan untuk menjalankan
              layanan yang kamu daftar.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className={h2Class}>5. Pengguna di bawah 18 tahun</h2>
            <p className={pClass}>
              Banyak pengguna kami adalah pelajar SMA. Kalau usiamu di bawah 18 tahun, minta izin orang tua atau wali
              sebelum mengisi nomor WhatsApp atau mendaftar. Orang tua atau wali boleh menghubungi kami kapan saja
              untuk meminta data anak dihapus atau persetujuan ditarik.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className={h2Class}>6. Dengan siapa data dibagikan</h2>
            <ul className={ulClass}>
              <li>
                <span className="font-semibold">Penyedia layanan teknis pihak ketiga:</span> penyimpanan data dan
                hosting, pembayaran, layanan masuk dengan akun pihak ketiga, dan layanan kecerdasan buatan untuk
                membuat catatan hasil Assessment. Data yang dikirim ke layanan kecerdasan buatan tidak memuat nama
                atau kontak kamu.
              </li>
              <li>
                <span className="font-semibold">Mentor:</span> hanya melihat data siswa yang mereka bimbing, sebatas
                yang diperlukan untuk kelas.
              </li>
              <li>
                <span className="font-semibold">Pihak lain:</span> hanya bila diwajibkan hukum.
              </li>
            </ul>
            <p className={pClass}>
              Penyedia layanan teknis dapat berubah dari waktu ke waktu. Kami hanya memilih penyedia yang menerapkan
              pengamanan data yang wajar.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className={h2Class}>7. Cookie</h2>
            <p className={pClass}>
              Kami memakai cookie untuk login, membatasi percobaan Assessment tanpa login, dan mencatat sumber
              kunjungan. Cookie atribusi disimpan paling lama 30 hari. Kamu bisa menghapus cookie lewat pengaturan
              browser.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className={h2Class}>8. Penyimpanan dan keamanan</h2>
            <p className={pClass}>
              Data disimpan di server penyedia layanan kami dengan akses terbatas. Nomor WhatsApp dari formulir kami
              simpan paling lama 12 bulan sejak kontak terakhir, kecuali kamu mendaftar sebagai pengguna. Setelah itu
              kami hapus atau anonimkan.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className={h2Class}>9. Hak kamu</h2>
            <p className={pClass}>
              Kamu berhak meminta akses, memperbaiki, menghapus data, dan menarik persetujuan kapan saja. Kirim
              permintaan ke <EmailLink />. Kami berusaha menanggapi dalam 30 hari kerja.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className={h2Class}>10. Perubahan kebijakan</h2>
            <p className={pClass}>
              Kalau kebijakan ini berubah, kami memperbarui tanggal dan versi di atas, dan memberi tahu pengguna
              terdaftar untuk perubahan yang penting.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
