/**
 * Logika filter SearchableSelect (murni, bisa dites tanpa DOM).
 *
 * Opsi cadangan (`fallback`, mis. "Lainnya (tulis sendiri)") hanya muncul
 * kalau ada teks pencarian DAN tidak ada opsi yang cocok. Pencarian kosong
 * atau yang punya hasil tidak pernah menampilkannya.
 */
export interface SelectOption {
  label: string;
  value: string;
}

export function filterSearchableOptions(
  options: readonly SelectOption[],
  query: string,
  fallback?: SelectOption,
): { filtered: SelectOption[]; showFallback: boolean } {
  const needle = query.trim().toLowerCase();
  const filtered = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : [...options];
  return { filtered, showFallback: Boolean(fallback) && needle !== "" && filtered.length === 0 };
}
