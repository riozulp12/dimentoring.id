/**
 * Isi baris "nama kelas di kiri + jadwal di kanan" (Kelas Terdaftar di Dashboard Mentor & Siswa) — SATU komponen
 * bersama; dipasang di dalam BarisKlik (area klik tidak berubah).
 *
 * Tata letak (tampilan saja, teks tidak diubah/dipotong lewat kode):
 *  - >= 480px: grid dua kolom sama lebar, minmax(0, 1fr) agar teks panjang tidak mendorong kolom lain.
 *  - < 480px: ditumpuk (nama di atas, jadwal di bawah, rata kiri) — tidak ada kolom sempit.
 *  - Nama: maksimal 2 baris (line-clamp-2) lalu "…"; `title` berisi nama lengkap untuk hover.
 *  - Jadwal: rata kanan, wrap otomatis, SELURUH teks tampil.
 */
export default function IsiBarisDuaKolom({
  kiri,
  kanan,
  kananClass = "text-[#7E7C7C]",
}: {
  kiri: string;
  kanan: string;
  kananClass?: string;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-x-4 gap-y-1 min-[480px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <p title={kiri} className="line-clamp-2 min-w-0 break-words text-base text-black">
        {kiri}
      </p>
      <p className={`min-w-0 break-words text-left text-base min-[480px]:text-right ${kananClass}`}>{kanan}</p>
    </div>
  );
}
