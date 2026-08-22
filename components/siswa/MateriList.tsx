"use client";

import { useState } from "react";
import type { MateriItem, MateriTipe } from "@/lib/siswa/getKelasDetail";

const TIPE_LABEL: Record<MateriTipe, string> = {
  video: "Video",
  dokumen: "Dokumen",
  rangkuman_teks: "Rangkuman",
};

function ProgressBar({ persen }: { persen: number }) {
  const clamped = Math.min(100, Math.max(0, persen));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-[#E3E3E3]">
      <div
        className="h-full rounded-full bg-[#081EEA] transition-[width] duration-200"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export default function MateriList({
  items,
  initialProgresPersen,
}: {
  items: MateriItem[];
  initialProgresPersen: number;
}) {
  const [rows, setRows] = useState(items);
  const [progresPersen, setProgresPersen] = useState(initialProgresPersen);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function toggleSelesai(materiId: string) {
    setPendingId(materiId);
    setErrorId(null);
    try {
      const response = await fetch(`/api/materi/${materiId}/toggle-selesai`, { method: "POST" });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setErrorId(materiId);
        setPendingId(null);
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === materiId ? { ...r, selesai: json.selesai } : r)));
      setProgresPersen(json.progresPersen);
      setPendingId(null);
    } catch {
      setErrorId(materiId);
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-black">Progress Kelas</span>
          <span className="text-sm text-[#7E7C7C]">{progresPersen}%</span>
        </div>
        <ProgressBar persen={progresPersen} />
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((item) => {
          const isExpanded = expandedId === item.id;
          const isLink = item.tipe === "video" || item.tipe === "dokumen";

          return (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="inline-flex w-fit items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
                    {TIPE_LABEL[item.tipe]}
                  </span>

                  {isLink ? (
                    <a
                      href={item.konten}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-base font-medium text-black underline decoration-[#AFAFAF] underline-offset-2 hover:text-[#081EEA]"
                    >
                      {item.judul}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="text-left text-base font-medium text-black hover:text-[#081EEA]"
                    >
                      {item.judul}
                    </button>
                  )}

                  {!isLink && isExpanded ? (
                    <p className="whitespace-pre-wrap text-sm text-[#7E7C7C]">{item.konten}</p>
                  ) : null}

                  {errorId === item.id ? (
                    <p className="text-sm text-[#E70A0A]">Gagal menyimpan, coba lagi.</p>
                  ) : null}
                </div>

                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm whitespace-nowrap text-[#7E7C7C]">
                  <input
                    type="checkbox"
                    checked={item.selesai}
                    disabled={pendingId === item.id}
                    onChange={() => toggleSelesai(item.id)}
                    className="size-4 accent-[#081EEA] disabled:opacity-50"
                  />
                  Tandai Selesai
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
