/**
 * Label tampilan untuk enum tingkat_kelas & tipe_kelas — SENGAJA di file
 * tanpa "server-only" (beda dari lib/mentor/getKelasSayaData.ts &
 * lib/mentor/getHonorData.ts) supaya aman diimport dari Client Component
 * juga (mis. components/admin/KelolaKelasClient.tsx), bukan cuma Server
 * Component. Kedua file mentor itu re-export dari sini untuk kompatibilitas
 * import lama — jangan duplikasi map ini di tempat lain.
 */

export const TINGKAT_KELAS_LABEL: Record<string, string> = {
  kelas_10: "Kelas 10",
  kelas_11: "Kelas 11",
  kelas_12: "Kelas 12",
  gap_year: "Gap Year",
};

export const TIPE_KELAS_LABEL: Record<string, string> = {
  private: "Private",
  semi_private: "Semi-Private",
  grouping: "Grouping",
};
