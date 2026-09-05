/**
 * Pemetaan nama Subtes (`subtes.nama`, teks bebas — lihat db/schema.sql) ke
 * ikon dekoratif banner Kelas (PRD 7.5, KelasCardVisual). `subtes.nama` tidak
 * dibatasi enum, jadi pencocokan pakai keyword (bukan exact match) supaya
 * tahan variasi redaksi (mis. "Bahasa Indonesia", "Literasi B. Indonesia").
 * Komponen ikon aktual ada di components/ui/subtesIcons.tsx — file ini CUMA
 * mapping nama -> key, jangan import React di sini (dipakai dari layer data).
 */

export type SubtesIconKey =
  | "calculator"
  | "atom-2"
  | "flask"
  | "dna-2"
  | "book-2"
  | "language"
  | "chart-line"
  | "world"
  | "users-group"
  | "hourglass"
  | "flag"
  | "users"
  | "bulb"
  | "school";

// Urutan penting: keyword lebih spesifik dicek lebih dulu supaya tidak
// ketiban keyword umum (mis. "Penalaran Matematika" harus kena "matematika"
// / calculator, bukan "penalaran" / bulb).
const KEYWORD_RULES: { keywords: string[]; icon: SubtesIconKey }[] = [
  { keywords: ["kuantitatif", "matematika"], icon: "calculator" },
  { keywords: ["fisika"], icon: "atom-2" },
  { keywords: ["kimia"], icon: "flask" },
  { keywords: ["biologi"], icon: "dna-2" },
  { keywords: ["indonesia"], icon: "book-2" },
  { keywords: ["inggris"], icon: "language" },
  { keywords: ["ekonomi"], icon: "chart-line" },
  { keywords: ["geografi"], icon: "world" },
  { keywords: ["sosiologi"], icon: "users-group" },
  { keywords: ["sejarah"], icon: "hourglass" },
  { keywords: ["ppkn", "pkn", "pancasila", "kewarganegaraan"], icon: "flag" },
  { keywords: ["antropologi"], icon: "users" },
  { keywords: ["penalaran umum", "bacaan", "pemahaman umum", "penalaran"], icon: "bulb" },
];

const DEFAULT_ICON: SubtesIconKey = "school";

/** Default dipakai untuk subtes kosong/tidak match (mis. Kelas Konsultasi
 * yang tidak terikat Subtes — subtes_id nullable, lihat db/schema.sql kelas). */
export function getSubtesIconKey(subtesNama: string | null | undefined): SubtesIconKey {
  if (!subtesNama) return DEFAULT_ICON;
  const normalized = subtesNama.trim().toLowerCase();
  if (!normalized) return DEFAULT_ICON;

  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.icon;
    }
  }

  return DEFAULT_ICON;
}
