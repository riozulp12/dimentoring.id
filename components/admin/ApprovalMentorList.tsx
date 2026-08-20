"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MentorPengajuan } from "@/lib/admin/dashboardData";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function ApprovalMentorList({ items }: { items: MentorPengajuan[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function handleAction(item: MentorPengajuan, action: "setujui" | "tolak") {
    setPendingId(item.userRoleId);
    setErrorId(null);
    try {
      const response = await fetch("/api/approval-mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userRoleId: item.userRoleId, action }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setErrorId(item.userRoleId);
        setPendingId(null);
        return;
      }
      // Optimistic: hilangkan baris langsung, lalu sinkronkan stat card lain
      // (Mentor Aktif/Menunggu Approval) tanpa reload halaman penuh.
      setRows((prev) => prev.filter((r) => r.userRoleId !== item.userRoleId));
      router.refresh();
    } catch {
      setErrorId(item.userRoleId);
      setPendingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <p className="text-base text-[#7E7C7C]">Tidak ada pengajuan mentor yang menunggu</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((item) => (
        <div
          key={item.userRoleId}
          className="flex flex-col gap-3 rounded-[16px] border-[0.8px] border-[#E3E3E3] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-base font-medium text-black">{item.nama}</p>
            <p className="text-sm text-[#7E7C7C]">
              {item.asalPtn ?? "-"} · {item.jurusan ?? "-"}
            </p>
            <p className="text-sm text-[#7E7C7C]">Daftar {formatDate(item.tanggalDaftar)}</p>
            {errorId === item.userRoleId ? (
              <p className="text-sm text-[#E70A0A]">Gagal menyimpan, coba lagi.</p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={pendingId === item.userRoleId}
              onClick={() => handleAction(item, "tolak")}
              className="rounded-lg border border-[#E3E3E3] px-4 py-2 text-sm font-medium text-[#7E7C7C] transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Tolak
            </button>
            <button
              type="button"
              disabled={pendingId === item.userRoleId}
              onClick={() => handleAction(item, "setujui")}
              className="rounded-lg bg-[#081EEA] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              Setujui
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
