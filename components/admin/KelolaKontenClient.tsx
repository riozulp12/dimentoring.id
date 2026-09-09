"use client";

import { useState } from "react";
import KontenInfoAdminList from "./KontenInfoAdminList";
import ReviewKontenList from "@/components/mentor/ReviewKontenList";
import KatalogRewardAdminClient from "./KatalogRewardAdminClient";
import LandingCampaignAdminList from "./LandingCampaignAdminList";
import type { KontenInfoAdminItem, LandingCampaignAdminItem } from "@/lib/admin/getKelolaKontenData";
import type { ReviewKontenItem } from "@/lib/mentor/reviewKonten";
import type { RedemptionRequestAdminItem, RewardCatalogAdminItem } from "@/lib/admin/getKatalogRewardData";

/**
 * "Kelola Konten" (Admin) — 4 tab, PRD Bagian 13 & 7.7/BR-31 & 7.2. Tab
 * "Review Konten AI" REUSE ReviewKontenList (komponen sama dengan Mentor di
 * app/(protected)/(mentor)/review-konten/), cuma datanya lintas subtes. Tab
 * "Katalog Reward" beda domain dari tab lain (gamifikasi, bukan konten), tab
 * "Banner Campaign" beda domain lagi (landing_campaign — BARU, promosi
 * landing page) — keduanya ditaruh di sini sesuai instruksi produk, bukan
 * halaman terpisah.
 */

type Tab = "info" | "review" | "reward" | "campaign";

const TABS: { key: Tab; label: string }[] = [
  { key: "info", label: "Info Beasiswa & Event" },
  { key: "review", label: "Review Konten AI" },
  { key: "reward", label: "Katalog Reward" },
  { key: "campaign", label: "Banner Campaign" },
];

export default function KelolaKontenClient({
  initialInfo,
  initialReview,
  initialRewardCatalog,
  initialRedemptionRequests,
  initialCampaign,
}: {
  initialInfo: KontenInfoAdminItem[];
  initialReview: ReviewKontenItem[];
  initialRewardCatalog: RewardCatalogAdminItem[];
  initialRedemptionRequests: RedemptionRequestAdminItem[];
  initialCampaign: LandingCampaignAdminItem[];
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
      ) : tab === "reward" ? (
        <KatalogRewardAdminClient initialCatalog={initialRewardCatalog} initialRequests={initialRedemptionRequests} />
      ) : (
        <LandingCampaignAdminList initialItems={initialCampaign} />
      )}
    </div>
  );
}
