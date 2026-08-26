"use client";

import { useState } from "react";
import KontenInfoAdminList from "./KontenInfoAdminList";
import ReviewKontenList from "@/components/mentor/ReviewKontenList";
import KatalogRewardAdminClient from "./KatalogRewardAdminClient";
import type { KontenInfoAdminItem } from "@/lib/admin/getKelolaKontenData";
import type { ReviewKontenItem } from "@/lib/mentor/reviewKonten";
import type { RedemptionRequestAdminItem, RewardCatalogAdminItem } from "@/lib/admin/getKatalogRewardData";

/**
 * "Kelola Konten" (Admin) — 3 tab, PRD Bagian 13 & 7.7/BR-31 & 7.2. Tab
 * "Review Konten AI" REUSE ReviewKontenList (komponen sama dengan Mentor di
 * app/(protected)/(mentor)/review-konten/), cuma datanya lintas subtes. Tab
 * "Katalog Reward" beda domain dari 2 tab lain (gamifikasi, bukan konten),
 * tapi ditaruh di sini sesuai instruksi produk — bukan halaman terpisah.
 */

type Tab = "info" | "review" | "reward";

const TABS: { key: Tab; label: string }[] = [
  { key: "info", label: "Info Beasiswa & Event" },
  { key: "review", label: "Review Konten AI" },
  { key: "reward", label: "Katalog Reward" },
];

export default function KelolaKontenClient({
  initialInfo,
  initialReview,
  initialRewardCatalog,
  initialRedemptionRequests,
}: {
  initialInfo: KontenInfoAdminItem[];
  initialReview: ReviewKontenItem[];
  initialRewardCatalog: RewardCatalogAdminItem[];
  initialRedemptionRequests: RedemptionRequestAdminItem[];
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
      ) : tab === "review" ? (
        <ReviewKontenList items={initialReview} />
      ) : (
        <KatalogRewardAdminClient initialCatalog={initialRewardCatalog} initialRequests={initialRedemptionRequests} />
      )}
    </div>
  );
}
