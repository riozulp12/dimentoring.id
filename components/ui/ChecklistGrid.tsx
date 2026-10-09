"use client";

import type { ChecklistGroup } from "@/lib/shared/mapelSubtesOptions";

/**
 * Grid checklist multi-select (chip toggle) — dipakai di Onboarding
 * (Mapel Tersulit/Subtes Diampu, PRD 7.0.2) dan Edit Profil (PRD 7 poin 1)
 * supaya interaksi & tampilannya konsisten di kedua tempat.
 *
 * Dua mode, pilih salah satu:
 * - `options` (flat) — perilaku lama, tanpa label section.
 * - `groups` — opsi dikelompokkan dengan label section (mis. "SNBT",
 *   "TKA — Mapel Utama"), supaya daftar panjang tetap terbaca saat di-scroll.
 *
 * BACKWARD COMPATIBILITY: nilai yang sudah TERSIMPAN di `selected` tapi tidak
 * ada di `options`/`groups` TIDAK dibuang — dirender di section terakhir
 * "Pilihan tersimpan sebelumnya" supaya user lama bisa melihat & melepasnya
 * sendiri, bukan hilang diam-diam dari tampilan sementara tetap ada di DB.
 */

function ChipGrid({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:gap-3">
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(option)}
            className={[
              "rounded-[12px] border px-2.5 py-2 text-left text-xs leading-[1.4] tracking-[-0.02em] transition-colors sm:px-3 sm:py-2.5 sm:text-sm lg:px-4 lg:py-3 lg:text-base",
              isSelected
                ? "border-[#081EEA] bg-[#081EEA] font-medium text-white"
                : "border-[#CAC9C9] bg-white text-black hover:border-[#081EEA]",
            ].join(" ")}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export default function ChecklistGrid({
  options,
  groups,
  selected,
  onToggle,
}: {
  options?: string[];
  groups?: ChecklistGroup[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const known = groups ? groups.flatMap((group) => group.options) : (options ?? []);
  const legacySelected = selected.filter((value) => !known.includes(value));

  const resolvedGroups: ChecklistGroup[] = groups ?? [{ label: "", options: options ?? [] }];
  const allGroups =
    legacySelected.length > 0
      ? [...resolvedGroups, { label: "Pilihan tersimpan sebelumnya", options: legacySelected }]
      : resolvedGroups;

  return (
    <div className="flex w-full flex-col gap-3 sm:gap-4">
      {allGroups.map((group) => (
        <div key={group.label} className="flex w-full flex-col gap-1.5 sm:gap-2">
          {group.label ? (
            <p className="w-full text-xs leading-[1.5] font-semibold tracking-[-0.02em] text-[#7E7C7C] uppercase sm:text-sm">
              {group.label}
            </p>
          ) : null}
          <ChipGrid options={group.options} selected={selected} onToggle={onToggle} />
        </div>
      ))}
    </div>
  );
}
