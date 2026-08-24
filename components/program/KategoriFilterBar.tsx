"use client";

import { useRouter, useSearchParams } from "next/navigation";
import InputField from "@/components/ui/InputField";
import { TINGKAT_KELAS_LABEL, TIPE_KELAS_LABEL } from "@/lib/shared/kelasLabels";

/** Filter Tipe Kelas & Tingkat Kelas (PRD 7.5.4) — state di URL search params
 * supaya halaman grid tetap server component (query langsung dari searchParams,
 * bisa di-share/reload). Dua dropdown ini murni ganti query lalu navigate. */

const TIPE_OPTIONS = [
  { label: "Semua Tipe", value: "" },
  ...Object.entries(TIPE_KELAS_LABEL).map(([value, label]) => ({ label, value })),
];

const TINGKAT_OPTIONS = [
  { label: "Semua Tingkat", value: "" },
  ...Object.entries(TINGKAT_KELAS_LABEL).map(([value, label]) => ({ label, value })),
];

export default function KategoriFilterBar({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: "tipe" | "tingkat", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    router.push(`/program/${slug}${query ? `?${query}` : ""}`);
  }

  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:gap-4">
      <InputField
        type="dropdown"
        size="md"
        value={searchParams.get("tipe") ?? ""}
        onChange={(e) => updateFilter("tipe", e.target.value)}
        options={TIPE_OPTIONS}
        className="sm:w-48"
      />
      <InputField
        type="dropdown"
        size="md"
        value={searchParams.get("tingkat") ?? ""}
        onChange={(e) => updateFilter("tingkat", e.target.value)}
        options={TINGKAT_OPTIONS}
        className="sm:w-48"
      />
    </div>
  );
}
