"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { REDEMPTION_STATUS_BADGE_CLASS, REDEMPTION_STATUS_LABEL } from "@/lib/shared/redemptionLabels";
import type { RedemptionHistoryItem, RewardCatalogItem } from "@/lib/reward/getRewardCatalogData";

/**
 * "Tukar Poin" — PRD Bagian 7.2 (FR-G5). Dipakai bareng oleh halaman Referral
 * & Poin (Siswa) dan Honor (Mentor), sama seperti ReferralSummary yang
 * membungkusnya — poin gamifikasi berlaku sama untuk kedua role (FR-R1).
 */

function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function TukarPoinSection({
  totalPoin,
  initialCatalog,
  initialHistory,
}: {
  totalPoin: number;
  initialCatalog: RewardCatalogItem[];
  initialHistory: RedemptionHistoryItem[];
}) {
  const [poin, setPoin] = useState(totalPoin);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [history, setHistory] = useState(initialHistory);
  const [confirmTarget, setConfirmTarget] = useState<RewardCatalogItem | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function openConfirm(item: RewardCatalogItem) {
    setSubmitError(null);
    setConfirmTarget(item);
  }

  async function handleConfirmTukar() {
    if (!confirmTarget) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/reward/tukar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardCatalogId: confirmTarget.id }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal menukar poin. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      setPoin((prev) => prev - confirmTarget.biayaPoin);
      setCatalog((prev) => prev.filter((item) => item.id !== confirmTarget.id));
      setHistory((prev) => [
        {
          id: crypto.randomUUID(),
          namaReward: confirmTarget.namaReward,
          poinTerpakai: confirmTarget.biayaPoin,
          status: "diproses",
          tanggal: new Date().toISOString(),
        },
        ...prev,
      ]);
      setConfirmTarget(null);
      setIsSubmitting(false);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Tukar Poin</h2>
          <p className="text-sm text-[#7E7C7C]">Poin kamu saat ini: {poin} Poin</p>
        </div>

        {catalog.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-base text-[#7E7C7C]">Belum ada reward yang tersedia untuk ditukar.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {catalog.map((item, index) => {
              const cukup = poin >= item.biayaPoin;
              return (
                <div key={item.id}>
                  {index > 0 ? <div className="h-px w-full bg-[#E3E3E3]" /> : null}
                  <div className="flex items-center justify-between gap-3 py-2.5 sm:py-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="truncate text-base text-black">{item.namaReward}</p>
                      <p className="text-sm text-[#7E7C7C]">{item.biayaPoin} Poin</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!cukup}
                        onClick={() => openConfirm(item)}
                      >
                        Tukar
                      </Button>
                      {!cukup ? <p className="text-xs text-[#E70A0A]">Poin kamu belum cukup</p> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Riwayat Penukaran</h2>
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-base text-[#7E7C7C]">Belum ada penukaran poin.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {history.map((item, index) => (
              <div key={item.id}>
                {index > 0 ? <div className="h-px w-full bg-[#E3E3E3]" /> : null}
                <div className="flex items-center justify-between gap-3 py-2.5 sm:py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate text-base text-black">{item.namaReward}</p>
                    <p className="text-sm text-[#7E7C7C]">
                      {item.poinTerpakai} Poin · {formatTanggal(item.tanggal)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${REDEMPTION_STATUS_BADGE_CLASS[item.status]}`}
                  >
                    {REDEMPTION_STATUS_LABEL[item.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal open={confirmTarget !== null} onClose={() => setConfirmTarget(null)}>
        {confirmTarget ? (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-semibold text-black">
              Yakin tukar {confirmTarget.biayaPoin} poin untuk {confirmTarget.namaReward}?
            </p>
            {submitError ? <p className="text-sm text-[#E70A0A]">{submitError}</p> : null}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => setConfirmTarget(null)}
                disabled={isSubmitting}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-1"
                disabled={isSubmitting}
                onClick={handleConfirmTukar}
              >
                {isSubmitting ? "Memproses..." : "Ya, Tukar"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
