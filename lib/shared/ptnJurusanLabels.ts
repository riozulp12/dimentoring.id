/**
 * Label tampilan untuk enum jalur_seleksi & jenjang_prodi (tabel ptn_jurusan)
 * — file tanpa "server-only" supaya aman diimport dari Client Component
 * (mis. components/admin/KelolaAssessmentClient.tsx) maupun Server Component.
 */

export const JALUR_LABEL: Record<string, string> = {
  snbp: "SNBP",
  snbt: "SNBT",
  mandiri: "Mandiri",
};

export const JENJANG_LABEL: Record<string, string> = {
  S1: "S1",
  D3: "D3",
  D4: "D4",
};

export const JALUR_OPTIONS = [
  { label: "SNBP", value: "snbp" },
  { label: "SNBT", value: "snbt" },
  { label: "Mandiri", value: "mandiri" },
];

export const JENJANG_OPTIONS = [
  { label: "S1", value: "S1" },
  { label: "D3", value: "D3" },
  { label: "D4", value: "D4" },
];
