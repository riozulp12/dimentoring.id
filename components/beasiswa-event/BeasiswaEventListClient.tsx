"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import InputField from "@/components/ui/InputField";
import { formatDeadline } from "@/lib/shared/formatDeadline";
import {
  KONTEN_INFO_STATUS_BADGE_CLASS,
  KONTEN_INFO_STATUS_LABEL,
  KONTEN_INFO_TIPE_BADGE_CLASS,
  KONTEN_INFO_TIPE_LABEL,
} from "@/lib/shared/kontenInfoLabels";
import type { KontenInfoListItem } from "@/lib/dashboard/getInfoBeasiswaEvent";

/**
 * List + search + filter halaman publik /beasiswa-event (PRD Bagian 7/13,
 * konten_info) — data lengkap (termasuk yang sudah 'ditutup') sudah di-fetch
 * sekaligus di page.tsx (Server Component), search/filter murni client-side
 * (pola sama dengan ApprovalMentorClient.tsx: tab + InputField search). SATU
 * list/grid gabungan semua tipe (TIDAK dipisah section per tipe) — filter
 * Tipe pakai dropdown (REUSE pola InputField type="dropdown" dari
 * components/program/KategoriFilterBar.tsx), opsinya REUSE
 * KONTEN_INFO_TIPE_LABEL supaya otomatis ikut kalau ada tipe baru lagi.
 * Filter Tipe + search jalan BERSAMAAN (AND, lihat `filtered` di bawah).
 */

type TipeFilter = "semua" | "beasiswa" | "internship" | "webinar" | "workshop" | "event";
type StatusFilter = "semua" | "aktif" | "ditutup";

const TIPE_OPTIONS = [
  { label: "Semua", value: "semua" },
  ...Object.entries(KONTEN_INFO_TIPE_LABEL).map(([value, label]) => ({ label, value })),
];

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "aktif", label: "Masih Buka" },
  { key: "ditutup", label: "Sudah Ditutup" },
];

export default function BeasiswaEventListClient({ items }: { items: KontenInfoListItem[] }) {
  const [search, setSearch] = useState("");
  const [tipeFilter, setTipeFilter] = useState<TipeFilter>("semua");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("semua");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (q && !item.judul.toLowerCase().includes(q)) return false;
      if (tipeFilter !== "semua" && item.tipe !== tipeFilter) return false;
      if (statusFilter !== "semua" && item.status !== statusFilter) return false;
      return true;
    });
  }, [items, search, tipeFilter, statusFilter]);

  const isFiltering = search.trim() !== "" || tipeFilter !== "semua" || statusFilter !== "semua";

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="max-w-md">
        <InputField
          type="text"
          size="md"
          placeholder="Cari judul beasiswa, internship, atau event..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InputField
          type="dropdown"
          size="md"
          value={tipeFilter}
          onChange={(e) => setTipeFilter(e.target.value as TipeFilter)}
          options={TIPE_OPTIONS}
          className="sm:w-48"
        />

        <div className="flex shrink-0 items-center gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab.key
                  ? "border-[#081EEA] bg-[#F9FAFF] text-[#081EEA]"
                  : "border-[#E3E3E3] text-[#7E7C7C] hover:border-[#081EEA] hover:text-[#081EEA]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-16 text-center">
          <p className="text-base text-[#7E7C7C]">
            {items.length === 0
              ? "Belum ada info beasiswa, internship, atau event saat ini."
              : isFiltering
                ? "Tidak ada konten yang cocok dengan pencarian/filter kamu."
                : "Belum ada konten untuk ditampilkan."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {filtered.map((item) => {
            const isDitutup = item.status === "ditutup";
            return (
              <Link
                key={item.id}
                href={`/beasiswa-event/${item.id}`}
                className={`flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-[18px] shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] transition-colors hover:border-[#081EEA] ${
                  isDitutup ? "opacity-70" : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      KONTEN_INFO_TIPE_BADGE_CLASS[item.tipe] ?? "bg-gray-100 text-[#7E7C7C]"
                    }`}
                  >
                    {KONTEN_INFO_TIPE_LABEL[item.tipe] ?? item.tipe}
                  </span>
                  <span
                    className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      KONTEN_INFO_STATUS_BADGE_CLASS[item.status] ?? "bg-gray-100 text-[#7E7C7C]"
                    }`}
                  >
                    {KONTEN_INFO_STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </div>
                <p className="line-clamp-2 text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black">
                  {item.judul}
                </p>
                {item.deskripsi ? (
                  <p className="line-clamp-2 text-sm text-[#7E7C7C]">{item.deskripsi}</p>
                ) : null}
                <p
                  className={`text-sm leading-[1.5] tracking-[-0.28px] ${
                    isDitutup ? "text-[#7E7C7C]" : "text-[#E70A0A]"
                  }`}
                >
                  {formatDeadline(item.deadline)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
