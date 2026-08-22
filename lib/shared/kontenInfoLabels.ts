/**
 * Label & warna badge untuk enum konten_info_tipe (beasiswa/internship/event)
 * — dipakai section landing page "Info Beasiswa & Internship" (PRD Bagian
 * 4.3). File tanpa "server-only" supaya aman diimport dari Client Component.
 */

export const KONTEN_INFO_TIPE_LABEL: Record<string, string> = {
  beasiswa: "Beasiswa",
  internship: "Internship",
  event: "Event",
};

export const KONTEN_INFO_TIPE_BADGE_CLASS: Record<string, string> = {
  beasiswa: "bg-[#F9FAFF] text-[#081EEA]",
  internship: "bg-purple-50 text-purple-700",
  event: "bg-amber-50 text-amber-700",
};
