"use client";

/**
 * Grid checklist multi-select (chip toggle) — dipakai di Register (onboarding
 * Mapel Tersulit/Subtes Diampu, PRD 7.0.2) dan Edit Profil (PRD 7 poin 1)
 * supaya interaksi & tampilannya konsisten di kedua tempat.
 */
export default function ChecklistGrid({
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
