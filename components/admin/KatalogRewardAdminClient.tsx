"use client";

import { useState } from "react";
import KatalogRewardAdminList from "./KatalogRewardAdminList";
import PermintaanPenukaranAdminList from "./PermintaanPenukaranAdminList";
import type { RedemptionRequestAdminItem, RewardCatalogAdminItem } from "@/lib/admin/getKatalogRewardData";

/**
 * Tab "Katalog Reward" (Admin, di halaman Kelola Konten) — 2 sub-tab: daftar
 * reward yang dikelola Admin, dan antrean permintaan penukaran yang perlu
 * diproses. PRD Bagian 13 (reward_catalog, reward_redemptions), BR-13.
 */

type SubTab = "katalog" | "permintaan";

export default function KatalogRewardAdminClient({
  initialCatalog,
  initialRequests,
}: {
  initialCatalog: RewardCatalogAdminItem[];
  initialRequests: RedemptionRequestAdminItem[];
}) {
  const [subTab, setSubTab] = useState<SubTab>("katalog");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex w-fit gap-2 rounded-full border border-[#E3E3E3] bg-[#F9F9F9] p-1">
        <button
          type="button"
          onClick={() => setSubTab("katalog")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            subTab === "katalog" ? "bg-white text-[#081EEA] shadow-sm" : "text-[#7E7C7C] hover:text-black"
          }`}
        >
          Katalog
        </button>
        <button
          type="button"
          onClick={() => setSubTab("permintaan")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            subTab === "permintaan" ? "bg-white text-[#081EEA] shadow-sm" : "text-[#7E7C7C] hover:text-black"
          }`}
        >
          Permintaan Penukaran
        </button>
      </div>

      {subTab === "katalog" ? (
        <KatalogRewardAdminList initialItems={initialCatalog} />
      ) : (
        <PermintaanPenukaranAdminList initialItems={initialRequests} />
      )}
    </div>
  );
}
