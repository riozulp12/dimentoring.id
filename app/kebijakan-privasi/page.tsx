import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";

/**
 * Kebijakan Privasi — public route, statis (tanpa query database), pola sama
 * dengan app/assessment/page.tsx & app/beasiswa-event/page.tsx: pakai Navbar
 * landing page yang berubah otomatis sesuai status login.
 *
 * Kontennya masih DRAF (belum final secara hukum) — lihat banner di bawah.
 * Setelah direview & dipublikasikan resmi, ganti PUBLISH_STATUS jadi false
 * dan isi TANGGAL_UPDATE dengan tanggal publish sebenarnya.
 */

const PUBLISH_STATUS_DRAFT = true;
const TANGGAL_UPDATE = "[tanggal saat publish]";

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
            Kebijakan Privasi
          </h1>
          <p className="text-sm text-[#7E7C7C] sm:text-base">Terakhir diperbarui: {TANGGAL_UPDATE}</p>
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
          <section className="flex flex-col gap-2.5">
            <h2 className="text-lg font-semibold text-black sm:text-xl">1. Data yang Kami Kumpulkan</h2>
            <p className="text-sm leading-[1.7] text-black sm:text-base">
              Untuk Siswa: nama, email, nomor WhatsApp, sekolah, provinsi, kelas, dan mata pelajaran yang dianggap
              sulit. Untuk Mentor: asal PTN, semester, jurusan, dan subtes yang diampu. Untuk fitur Assessment: nilai
              rapor dan data prestasi yang kamu masukkan sendiri. Data pembayaran (setelah fitur Payment aktif)
              diproses langsung oleh mitra pembayaran resmi, bukan disimpan oleh kami.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-lg font-semibold text-black sm:text-xl">2. Cara Kami Menggunakan Data</h2>
            <p className="text-sm leading-[1.7] text-black sm:text-base">
              Data yang kamu berikan dipakai untuk menyediakan layanan bimbingan (kelas, tryout, assessment),
              menghitung estimasi Keketatan dan Peluang PTN, mengirim informasi beasiswa/event yang relevan, dan
              meningkatkan kualitas layanan kami secara umum.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-lg font-semibold text-black sm:text-xl">3. Perlindungan Data Anak</h2>
            <p className="text-sm leading-[1.7] text-black sm:text-base">
              Mayoritas pengguna Dimentoring adalah pelajar SMA, termasuk yang berusia di bawah 18 tahun. Kami
              membatasi pengumpulan data hanya yang benar-benar diperlukan untuk layanan, dan tidak membagikan data
              pribadi siswa ke pihak ketiga untuk tujuan pemasaran.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-lg font-semibold text-black sm:text-xl">4. Berbagi Data dengan Pihak Ketiga</h2>
            <p className="text-sm leading-[1.7] text-black sm:text-base">
              Kami bekerja sama dengan pihak ketiga berikut untuk menjalankan layanan Dimentoring:
            </p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-[1.7] text-black sm:text-base">
              <li>
                <span className="font-medium">Supabase</span> (penyedia database) — menyimpan seluruh data secara
                aman.
              </li>
              <li>
                <span className="font-medium">Google Gemini AI</span> — untuk fitur catatan otomatis pada hasil
                Assessment dan deskripsi kelas, kami hanya mengirim data numerik/kategorikal yang sudah dianonimkan
                (skor, label), tidak pernah nama, email, atau identitas pribadi lain.
              </li>
              <li>
                <span className="font-medium">Mitra pembayaran</span> (Midtrans/Xendit, setelah aktif) — memproses
                transaksi sesuai standar keamanan mereka sendiri.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-lg font-semibold text-black sm:text-xl">5. Hak Kamu</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-[1.7] text-black sm:text-base">
              <li>Unduh salinan data pribadimu kapan saja lewat halaman Pengaturan.</li>
              <li>Minta hapus akun lewat halaman Pengaturan — permintaan diproses tim kami dalam beberapa hari kerja.</li>
              <li>Atur privasi leaderboard (tampil/tidak tampil di ranking publik) lewat halaman Pengaturan.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-lg font-semibold text-black sm:text-xl">6. Keamanan Data</h2>
            <p className="text-sm leading-[1.7] text-black sm:text-base">
              Password kamu disimpan dalam bentuk terenkripsi (hash), tidak pernah dalam bentuk teks biasa. Akses ke
              data dibatasi lewat sistem keamanan berlapis, dan hanya tim yang berwenang yang bisa mengaksesnya untuk
              keperluan operasional layanan.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-lg font-semibold text-black sm:text-xl">7. Perubahan Kebijakan</h2>
            <p className="text-sm leading-[1.7] text-black sm:text-base">
              Kebijakan ini bisa diperbarui sewaktu-waktu mengikuti perkembangan layanan Dimentoring. Perubahan yang
              signifikan akan diinformasikan lewat email atau notifikasi di dalam platform.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="text-lg font-semibold text-black sm:text-xl">8. Kontak</h2>
            <p className="text-sm leading-[1.7] text-black sm:text-base">
              Ada pertanyaan seputar privasi? Kirim ke{" "}
              <a href="mailto:info.dimentoring.id@gmail.com" className="font-medium text-[#081EEA]">
                info.dimentoring.id@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
