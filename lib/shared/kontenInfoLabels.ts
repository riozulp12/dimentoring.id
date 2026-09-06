/**
 * Label & warna badge untuk enum konten_info_tipe
 * (beasiswa/internship/event/webinar/workshop) dan konten_info_status
 * (aktif/ditutup) — dipakai section landing page "Info Beasiswa &
 * Internship", halaman publik /beasiswa-event, dan dropdown Tipe di form
 * Kelola Konten Admin (PRD Bagian 13). File tanpa "server-only" supaya aman
 * diimport dari Client Component. SATU-SATUNYA tempat mapping tipe->label —
 * jangan duplikasi daftar tipe di tempat lain (form Admin & filter publik
 * REUSE Object.entries dari sini).
 */

export const KONTEN_INFO_TIPE_LABEL: Record<string, string> = {
  beasiswa: "Beasiswa",
  internship: "Internship",
  webinar: "Webinar",
  workshop: "Workshop",
  event: "Event",
};

export const KONTEN_INFO_TIPE_BADGE_CLASS: Record<string, string> = {
  beasiswa: "bg-[#F9FAFF] text-[#081EEA]",
  internship: "bg-purple-50 text-purple-700",
  webinar: "bg-teal-50 text-teal-700",
  workshop: "bg-rose-50 text-rose-700",
  event: "bg-amber-50 text-amber-700",
};

export const KONTEN_INFO_STATUS_LABEL: Record<string, string> = {
  aktif: "Masih Buka",
  ditutup: "Sudah Ditutup",
};

export const KONTEN_INFO_STATUS_BADGE_CLASS: Record<string, string> = {
  aktif: "bg-[#F0FDF4] text-[#0CBA00]",
  ditutup: "bg-gray-100 text-[#7E7C7C]",
};
