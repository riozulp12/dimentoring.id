"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewKontenItem } from "@/lib/mentor/reviewKonten";

type Tab = "semua" | "materi" | "soal";

const TABS: { key: Tab; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "materi", label: "Materi" },
  { key: "soal", label: "Soal Latihan" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function ReviewKontenList({ items }: { items: ReviewKontenItem[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("semua");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (tab === "semua") return items;
    if (tab === "materi") return items.filter((i) => i.jenis === "materi");
    return items.filter((i) => i.jenis === "soal");
  }, [items, tab]);

  async function handleAction(item: ReviewKontenItem, action: "setujui" | "tolak") {
    setPendingId(item.id);
    setErrorId(null);
    try {
      const response = await fetch("/api/review-konten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jenis: item.jenis, id: item.id, action }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setErrorId(item.id);
        setPendingId(null);
        return;
      }
      router.refresh();
    } catch {
      setErrorId(item.id);
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex w-full gap-2 border-b border-[#E3E3E3]">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-[#081EEA] text-[#081EEA]"
                : "text-[#7E7C7C] hover:text-black"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">Tidak ada konten yang perlu direview saat ini.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => (
            <div
              key={`${item.jenis}-${item.id}`}
              className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-5"
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
                    {item.jenis === "materi" ? "Materi" : "Soal Latihan"}
                  </span>
                  {item.sumber === "ai_generated" ? (
                    <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                      Dibuat AI
                    </span>
                  ) : null}
                </div>
                <p className="text-base text-black">{item.judul}</p>
                <p className="text-sm text-[#7E7C7C]">
                  {item.subtesNama} · {formatDate(item.createdAt)}
                  {item.mentorNama ? ` · Dibuat oleh ${item.mentorNama}` : ""}
                </p>
                {errorId === item.id ? (
                  <p className="text-sm text-[#E70A0A]">Gagal menyimpan, coba lagi.</p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={pendingId === item.id}
                  onClick={() => handleAction(item, "tolak")}
                  className="rounded-lg border border-[#E3E3E3] px-4 py-2 text-sm font-medium text-[#7E7C7C] transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  Tolak
                </button>
                <button
                  type="button"
                  disabled={pendingId === item.id}
                  onClick={() => handleAction(item, "setujui")}
                  className="rounded-lg bg-[#081EEA] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  Setujui
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
