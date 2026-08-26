"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { RedemptionRequestAdminItem } from "@/lib/admin/getKatalogRewardData";

/**
 * Sub-tab "Permintaan Penukaran" (di dalam tab "Katalog Reward" Admin) —
 * antrean reward_redemptions status='diproses', PRD Bagian 13. "Tandai
 * Selesai" (Admin sudah transfer manual di luar sistem) / "Tolak" (poin
 * dikembalikan otomatis di server, lihat app/api/kelola-konten/redemption/
 * [redemptionId]/route.ts).
 */

function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function PermintaanPenukaranAdminList({
  initialItems,
}: {
  initialItems: RedemptionRequestAdminItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  async function handleProses(item: RedemptionRequestAdminItem, status: "selesai" | "gagal") {
    setProcessingId(item.id);
    setErrorById((prev) => ({ ...prev, [item.id]: "" }));

    try {
      const response = await fetch(`/api/kelola-konten/redemption/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setErrorById((prev) => ({ ...prev, [item.id]: json.error ?? "Gagal memproses permintaan." }));
        setProcessingId(null);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setProcessingId(null);
    } catch {
      setErrorById((prev) => ({ ...prev, [item.id]: "Gagal terhubung ke server." }));
      setProcessingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
        <p className="text-base text-[#7E7C7C]">Tidak ada permintaan penukaran yang menunggu diproses.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-[#E3E3E3] text-[#7E7C7C]">
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium">Reward</th>
            <th className="px-4 py-3 font-medium">Poin</th>
            <th className="px-4 py-3 font-medium">Tanggal</th>
            <th className="px-4 py-3 font-medium">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-[#E3E3E3] last:border-0 align-top">
              <td className="px-4 py-3 text-black">{item.userNama}</td>
              <td className="px-4 py-3 text-black">{item.namaReward}</td>
              <td className="px-4 py-3 text-black">{item.poinTerpakai}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">{formatTanggal(item.tanggal)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={processingId === item.id}
                      onClick={() => handleProses(item, "selesai")}
                    >
                      Tandai Selesai
                    </Button>
                    <button
                      type="button"
                      disabled={processingId === item.id}
                      onClick={() => handleProses(item, "gagal")}
                      className="rounded-lg border border-[#FFEBEB] px-3 py-1.5 text-sm font-medium text-[#E70A0A] transition-colors hover:bg-[#FFEBEB] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Tolak
                    </button>
                  </div>
                  {errorById[item.id] ? <p className="text-xs text-[#E70A0A]">{errorById[item.id]}</p> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
