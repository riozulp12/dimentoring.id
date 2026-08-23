"use client";

import { useState } from "react";
import KontenInfoAdminList from "./KontenInfoAdminList";
import ReviewKontenList from "@/components/mentor/ReviewKontenList";
import type { KontenInfoAdminItem } from "@/lib/admin/getKelolaKontenData";
import type { ReviewKontenItem } from "@/lib/mentor/reviewKonten";

/**
 * "Kelola Konten" (Admin) — 2 tab, PRD Bagian 13 & 7.7/BR-31. Tab "Review
 * Konten AI" REUSE ReviewKontenList (komponen sama dengan Mentor di
 * app/(protected)/(mentor)/review-konten/), cuma datanya lintas subtes.
 */

type Tab = "info" | "review";

const TABS: { key: Tab; label: string }[] = [
  { key: "info", label: "Info Beasiswa & Event" },
  { key: "review", label: "Review Konten AI" },
];

export default function KelolaKontenClient({
  initialInfo,
  initialReview,
}: {
  initialInfo: KontenInfoAdminItem[];
  initialReview: ReviewKontenItem[];
}) {
  const [tab, setTab] = useState<Tab>("info");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex w-full gap-2 border-b border-[#E3E3E3]">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? "border-b-2 border-[#081EEA] text-[#081EEA]" : "text-[#7E7C7C] hover:text-black"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" ? (
        <KontenInfoAdminList initialItems={initialInfo} />
      ) : (
        <ReviewKontenList items={initialReview} />
      )}
    </div>
  );
}
