import Mascot from "./Mascot";
import { getSubtesIconKey } from "@/lib/kelas/subtesIconMap";
import { SUBTES_ICON_COMPONENTS } from "./subtesIcons";
import { PROGRAM_KATEGORI_LABEL, TINGKAT_KELAS_LABEL, type ProgramKategori } from "@/lib/shared/kelasLabels";

/**
 * Banner visual kelas (PRD 7.5, 13 — referensi visual Figma: maskot topi
 * wisuda, background gradasi biru-ungu, badge kiri atas, ribbon diskon kanan
 * atas miring, judul besar putih, badge sub-kategori, ikon dekoratif kiri,
 * kotak bawah). Dipakai sebagai kolom/blok atas full-bleed di card Kelas —
 * dipakai ulang di 3 konteks lewat prop `variant` (default "jual" supaya
 * pemakai lama /program, /program/[kategori] tidak perlu berubah):
 * - "jual" — /program, /program/[kategori], Rekomendasi Kelas (kelas BELUM
 *   dibeli): badge kuota, ribbon diskon, kotak CTA urgency SEMUA tampil.
 * - "dimiliki" — Kelas Saya (Siswa, kelas SUDAH dibeli): semua elemen jualan
 *   disembunyikan, diganti progress bar materi di kotak bawah.
 * - "diampu" — Kelas Saya (Mentor, kelas yang diampu): semua elemen jualan
 *   disembunyikan, diganti badge jumlah siswa aktif di pojok kiri atas.
 */

// Satu-satunya pose maskot dengan topi wisuda + melambai yang tersedia di
// public/mascots — dipakai konsisten di semua card (variasi cukup dari
// warna background gradasi), sesuai instruksi: kalau cuma ada 1 pose,
// jangan dipaksa rotasi ke pose lain yang tidak sesuai referensi.
const MASCOT_VARIANT = "Happy Graduate" as const;

interface GradientPair {
  from: string;
  to: string;
}

// 5 kombinasi gradasi TETAP (JANGAN tambah/ubah warna di luar daftar ini).
const GRADIENTS: GradientPair[] = [
  { from: "#4F46E5", to: "#7C3AED" }, // Biru ke Ungu
  { from: "#0D9488", to: "#38BDF8" }, // Teal ke Biru Muda
  { from: "#F97316", to: "#EC4899" }, // Oranye ke Merah Muda
  { from: "#7C3AED", to: "#DB2777" }, // Ungu Tua ke Pink
  { from: "#16A34A", to: "#0D9488" }, // Hijau ke Teal
];

// "INTENSIF X" — redaksi PERSIS sesuai spesifikasi (BUKAN cuma uppercase dari
// PROGRAM_KATEGORI_LABEL, mis. pendampingan_mahasiswa sengaja dipotong jadi
// "PENDAMPINGAN" tanpa "MAHASISWA").
const INTENSIF_LABEL: Record<string, string> = {
  konsultasi: "INTENSIF KONSULTASI",
  tka: "INTENSIF TKA",
  snbt: "INTENSIF SNBT",
  ujian_mandiri: "INTENSIF UJIAN MANDIRI",
  pendampingan_mahasiswa: "INTENSIF PENDAMPINGAN",
};

function truncateAtWord(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const sliced = trimmed.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const base = (lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced).trimEnd();
  return `${base}...`;
}

function resolveCtaText(isPenuh: boolean, isMenipis: boolean, hasDiskon: boolean): string {
  if (isPenuh) return "Kelas ini sudah penuh, cek kelas lain ya";
  if (isMenipis && hasDiskon) return "Slot terbatas + diskon spesial, jangan sampai lewat!";
  if (isMenipis) return "Gabung sekarang, jangan sampai kehabisan!!!";
  if (hasDiskon) return "Buruan daftar sebelum promo berakhir!";
  return "Yuk mulai belajar bareng mentor terbaik!";
}

export interface KelasCardVisualDiskon {
  label: string;
}

/**
 * "jual" (default) — /program & /program/[kategori] & Rekomendasi Kelas
 * (kelas BELUM dibeli, treatment jualan lengkap tetap relevan).
 * "dimiliki" — Kelas Saya (Siswa), kelas SUDAH dibeli, elemen jualan tidak
 * relevan lagi, diganti progress bar materi.
 * "diampu" — Kelas Saya (Mentor), kelas yang diampu (bukan dijual ke mentor
 * itu sendiri), diganti badge jumlah siswa aktif.
 */
export type KelasCardVisualVariant = "jual" | "dimiliki" | "diampu";

export interface KelasCardVisualProps {
  namaKelas: string;
  index: number;
  variant?: KelasCardVisualVariant;
  /** Dipakai variant "jual" saja. */
  diskonAktif?: KelasCardVisualDiskon | null;
  /** Dipakai variant "jual" saja. */
  sisaSlot?: number;
  /** Dipakai variant "jual" saja. */
  kapasitas?: number;
  /** Dipakai variant "dimiliki" saja — persentase materi selesai (0-100). */
  progresPersen?: number;
  /** Dipakai variant "diampu" saja — jumlah siswa enrollment lunas di kelas ini. */
  jumlahSiswaAktif?: number;
  /** Diterima untuk kompatibilitas signature props (PRD 7.5) — TIDAK dipakai
   * di dalam banner ini (tagline lama sudah digantikan badge target kelas,
   * poin 8). Teks deskripsi penuh sekarang tampil di card content bawah
   * banner, lihat components/program/KelasCardMeta.tsx. */
  deskripsi?: string;
  programKategori: string;
  tingkatKelas: string;
  subtesNama?: string | null;
  className?: string;
}

export default function KelasCardVisual({
  namaKelas,
  index,
  variant = "jual",
  diskonAktif,
  sisaSlot = 0,
  kapasitas = 0,
  progresPersen = 0,
  jumlahSiswaAktif = 0,
  programKategori,
  tingkatKelas,
  subtesNama,
  className,
}: KelasCardVisualProps) {
  // Digeser +1 dari index maskot supaya kombinasi maskot+warna tidak selalu
  // jatuh bersamaan tiap putaran (lihat instruksi Bagian 2 — maskotnya sendiri
  // sekarang fixed 1 pose, tapi pergeseran index tetap dipertahankan supaya
  // urutan warna antar card yang bersebelahan tetap bervariasi).
  const gradient = GRADIENTS[(index + 1) % GRADIENTS.length];
  const namaDisplay = truncateAtWord(namaKelas, 42);

  const isJual = variant === "jual";
  const isPenuh = isJual && sisaSlot <= 0;
  const isMenipis = isJual && !isPenuh && kapasitas > 0 && sisaSlot <= kapasitas * 0.3;
  const hasDiskon = isJual && Boolean(diskonAktif);

  const intensifLabel = INTENSIF_LABEL[programKategori] ?? `INTENSIF ${programKategori.toUpperCase()}`;
  const tingkatLabel = TINGKAT_KELAS_LABEL[tingkatKelas] ?? tingkatKelas;
  const kategoriLabel = PROGRAM_KATEGORI_LABEL[programKategori as ProgramKategori] ?? programKategori;
  const targetLabel = `${tingkatLabel} • ${kategoriLabel}`;

  const SubtesIcon = SUBTES_ICON_COMPONENTS[getSubtesIconKey(subtesNama)];
  const ctaText = resolveCtaText(isPenuh, isMenipis, hasDiskon);
  const progresClamped = Math.min(100, Math.max(0, progresPersen));

  return (
    <div
      className={["relative w-full aspect-[3/2] overflow-hidden rounded-t-[20px]", className].filter(Boolean).join(" ")}
      style={{ backgroundImage: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
    >
      {/* Tekstur dekoratif samar — pola dot berulang, opacity rendah, cuma
          estetika (tidak ada elemen brand texture reusable di public/icons). */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]" preserveAspectRatio="none">
        <defs>
          <pattern id={`kelas-texture-${index}`} width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
            <circle cx="3" cy="3" r="2.4" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#kelas-texture-${index})`} />
      </svg>

      {/* Ikon dekoratif sesuai Subtes — 3 instance sama, tersebar di sisi
          kiri, outline tipis, samar. */}
      <SubtesIcon
        aria-hidden
        className="pointer-events-none absolute top-[8%] left-[5%] h-8 w-8 text-white opacity-25 sm:h-9 sm:w-9"
        style={{ transform: "rotate(-10deg)" }}
      />
      <SubtesIcon
        aria-hidden
        className="pointer-events-none absolute top-[38%] left-[1%] h-12 w-12 text-white opacity-[0.18] sm:h-14 sm:w-14"
        style={{ transform: "rotate(8deg)" }}
      />
      <SubtesIcon
        aria-hidden
        className="pointer-events-none absolute top-[64%] left-[9%] h-6 w-6 text-white opacity-25 sm:h-7 sm:w-7"
        style={{ transform: "rotate(6deg)" }}
      />

      <Mascot
        variant={MASCOT_VARIANT}
        alt=""
        loading="eager"
        className="pointer-events-none absolute -right-[2%] -bottom-[2%] h-[78%] w-auto select-none drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]"
      />

      {/* Scrim bawah — jamin kontras teks putih di semua 5 kombinasi gradasi,
          termasuk sisi gradasi yang lebih terang (mis. Teal->Biru Muda). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-black/70 via-black/25 to-transparent"
      />

      {/* Badge kuota — pojok kiri atas, kondisional & tergantung variant
          (poin 3): "jual" = badge kuota (sisa slot/penuh), "diampu" = badge
          jumlah siswa aktif. Nilai CSS PERSIS sesuai spesifikasi ".badge-kuota"
          (ditulis sebagai Tailwind mobile-first: class dasar = breakpoint
          mobile ≤640px, sm: = breakpoint desktop, karena default Tailwind
          "tanpa prefix" berlaku di SEMUA ukuran termasuk mobile sampai
          di-override sm: — kebalikan urutan dari media query desktop-first
          di spek asli, tapi angka pxnya sama persis, tidak dihitung ulang). */}
      {isJual && (isPenuh || isMenipis) ? (
        <span
          className={[
            "absolute top-2 left-2 z-20 rounded-full px-2 py-[3px] text-[10px] font-medium sm:top-3 sm:left-3 sm:px-3 sm:py-1 sm:text-xs",
            isPenuh ? "bg-[#6B7280] text-white" : "bg-[#FACC15] text-[#422006]",
          ].join(" ")}
        >
          {isPenuh ? "Kelas Penuh" : `Tersisa ${sisaSlot} Slot!!!`}
        </span>
      ) : variant === "diampu" ? (
        <span className="absolute top-2 left-2 z-20 rounded-full bg-[#FACC15] px-2 py-[3px] text-[10px] font-medium text-[#422006] sm:top-3 sm:left-3 sm:px-3 sm:py-1 sm:text-xs">
          {jumlahSiswaAktif} Siswa
        </span>
      ) : null}

      {/* Ribbon diskon — pojok kanan atas, kondisional (poin 4). Nilai CSS
          PERSIS sesuai spesifikasi ".ribbon-diskon" (rotate(45deg), TANPA
          transform-origin custom — pakai default center; white-space:nowrap
          supaya teks tidak patah baris), mobile-first sama seperti badge
          di atas. */}
      {isJual && diskonAktif ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-[14px] -right-[34px] z-20 w-[130px] rotate-45 bg-[#DC2626] py-1 text-center text-[9px] font-bold whitespace-nowrap text-white sm:top-5 sm:-right-[42px] sm:w-[170px] sm:py-1.5 sm:text-[11px]"
        >
          {diskonAktif.label}
        </span>
      ) : null}

      {/* Konten bawah: badge target kelas, judul besar, badge sub-kategori,
          lalu kotak CTA urgency (poin 5, 6, 8, 9). */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 p-2.5 sm:gap-2 sm:p-3">
        <div className="flex w-[70%] flex-col gap-1 sm:w-[64%]">
          <span className="inline-flex w-fit items-center rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-semibold text-white ring-1 ring-white/30 backdrop-blur-sm sm:text-[10px]">
            {targetLabel}
          </span>
          <p className="line-clamp-2 text-lg leading-[1.1] font-extrabold tracking-tight text-white uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] sm:text-xl lg:text-2xl">
            {namaDisplay}
          </p>
          <span className="inline-flex w-fit items-center rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[9px] font-bold tracking-wide text-[#6D28D9] sm:text-[10px]">
            {intensifLabel}
          </span>
        </div>

        {/* Kotak bawah — tergantung variant: "jual" = CTA urgency (SELALU
            tampil, teks dinamis, poin 9), "dimiliki" = progress bar materi
            (pengganti CTA, karena kelas ini sudah dibeli jadi urgency tidak
            relevan lagi), "diampu" = tidak ada (badge siswa sudah cukup, lihat
            atas). */}
        {isJual ? (
          <div className="flex items-start gap-1.5 rounded-lg bg-[#FECDD3] px-2.5 py-1.5 shadow-[0_2px_6px_rgba(0,0,0,0.15)] sm:px-3 sm:py-2">
            <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9F1239]" fill="currentColor">
              <path d="M10 1.5 1 17h18L10 1.5Zm0 5.4c.5 0 .9.4.9.9v4.1c0 .5-.4.9-.9.9s-.9-.4-.9-.9V7.8c0-.5.4-.9.9-.9Zm0 7.4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
            </svg>
            <p className="line-clamp-2 text-[9.5px] leading-snug font-semibold text-[#9F1239] sm:text-[10.5px]">{ctaText}</p>
          </div>
        ) : variant === "dimiliki" ? (
          <div className="flex flex-col gap-1 rounded-lg bg-white/15 px-2.5 py-1.5 backdrop-blur-sm sm:px-3 sm:py-2">
            <div className="flex items-center justify-between text-[9.5px] font-semibold text-white sm:text-[10.5px]">
              <span>Progress Materi</span>
              <span>{progresClamped}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${progresClamped}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
