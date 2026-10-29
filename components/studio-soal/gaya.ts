/**
 * Kelas Tailwind bersama halaman Studio Soal (mentor & admin) — Studio Soal
 * UX-1. Warna HANYA lewat token di app/globals.css (bg-primary, text-muted,
 * border-line, …), tidak ada hex di sini. Tombol aksi utama memakai
 * components/ui/Button (atau buttonClassName untuk <Link>); kolom isian teks
 * memakai components/ui/InputField & SelectField. Kelas di bawah untuk
 * elemen yang belum punya komponen di design system (kartu, chip status,
 * tombol pilihan kecil, sel tabel).
 */

/** Kartu/section putih bergaris tipis. */
export const KARTU = "flex flex-col gap-4 rounded-[20px] border-[0.8px] border-line bg-white p-4 sm:p-5";

/** Chip status kecil (Draf, Sedang dicek, …). */
export const CHIP = "w-fit shrink-0 rounded-full bg-chip px-2.5 py-0.5 text-xs font-medium text-black";

/** Input kecil di dalam baris (sel tabel, jawaban isian, label kolom). */
export const inputKecil = (error?: string[]) =>
  [
    "w-full rounded-[12px] border bg-white px-3 py-2 text-sm text-black outline-none transition-colors placeholder:text-subtle focus:border-black disabled:bg-surface-muted disabled:text-muted",
    error ? "border-danger" : "border-subtle hover:border-primary",
  ].join(" ");

/** Tombol kecil sekunder (+ Tambah, ↑, ↓). */
export const TOMBOL_KECIL =
  "rounded-[8px] border border-line-strong bg-white px-2.5 py-1 text-xs font-medium text-black hover:border-primary disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Tombol yang hanya berisi ikon (hapus, buka/tutup). Area ketuk 40×40 px.
 * WAJIB diberi aria-label + title. `bahaya` = merah (hapus).
 */
export const tombolIkon = (bahaya = false) =>
  [
    "inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] transition-colors",
    "focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
    bahaya ? "text-danger hover:bg-danger-soft" : "text-black hover:bg-surface-muted",
  ].join(" ");

/**
 * Kolom pratinjau di layar besar (lg+): menempel di bawah header dashboard
 * (--tinggi-navbar di app/globals.css) dengan jarak 1rem, tinggi maksimum
 * menyisakan bilah aksi bawah (± 7rem), dan bisa digulir sendiri. Di HP/tablet
 * kecil tidak menempel. Induknya grid dengan lg:items-start.
 */
export const KOLOM_PRATINJAU =
  "lg:sticky lg:top-[calc(var(--tinggi-navbar)+1rem)] lg:max-h-[calc(100dvh-var(--tinggi-navbar)-9rem)] lg:overflow-y-auto lg:overscroll-contain";

/** Tombol pilihan (toggle) — aktif = primary. */
export const pilihan = (aktif: boolean, warnaAktif: "primary" | "success" = "primary", teks: "text-sm" | "text-xs" = "text-sm") =>
  [
    `border ${teks} font-medium transition-colors disabled:cursor-not-allowed`,
    aktif
      ? warnaAktif === "primary"
        ? "border-primary bg-primary text-white"
        : "border-success bg-success text-white"
      : "border-line-strong bg-white text-black hover:border-primary",
  ].join(" ");

/** Kotak pesan hasil aksi. */
export const pesanKelas = (jenis: "ok" | "gagal") =>
  ["rounded-[12px] px-4 py-2.5 text-sm", jenis === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"].join(" ");
