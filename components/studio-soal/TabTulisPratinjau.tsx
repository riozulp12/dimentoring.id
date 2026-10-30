import { buttonClassName } from "@/components/ui/buttonClassName";

export type TabForm = "tulis" | "pratinjau";

/**
 * Tab "Tulis / Pratinjau" untuk layar kecil (di lg ke atas form & pratinjau
 * berdampingan, tab disembunyikan). Gaya tombol design system: tab aktif =
 * primary, tab lain = secondary (revisi UX-3 butir 7 — dulu hitam).
 */
export default function TabTulisPratinjau({
  tab,
  setTab,
  label,
}: {
  tab: TabForm;
  setTab: (t: TabForm) => void;
  label: Record<TabForm, string>;
}) {
  return (
    <div className="flex gap-2 lg:hidden" role="tablist">
      {(["tulis", "pratinjau"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => setTab(t)}
          className={buttonClassName({ variant: tab === t ? "primary" : "secondary", size: "sm", className: "min-w-0 flex-1 max-sm:px-3" })}
        >
          {label[t]}
        </button>
      ))}
    </div>
  );
}
