"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import InputField from "@/components/ui/InputField";
import type { SiswaBinaanGroup } from "@/lib/mentor/getSiswaBinaanData";

/**
 * List siswa binaan di-group per kelas — pola sama seperti card "Progress
 * Siswa Binaan" di Dashboard Mentor (components/dashboard/MentorDashboardOverview.tsx):
 * header kelas + baris siswa (nama + progress bar) per group. Search & filter
 * kelas dilakukan client-side dari data yang sudah di-fetch page.tsx sekaligus
 * (data siswa binaan mentor cukup kecil untuk ini).
 */

function ProgressBar({ persen }: { persen: number }) {
  const clamped = Math.min(100, Math.max(0, persen));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-[#E3E3E3]">
      <div className="h-full rounded-full bg-[#081EEA]" style={{ width: `${clamped}%` }} />
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
      <p className="text-base text-[#7E7C7C]">{text}</p>
    </div>
  );
}

export default function SiswaBinaanList({
  groups,
  initialKelasId = "",
}: {
  groups: SiswaBinaanGroup[];
  /** Pre-filter dari ?kelasId= — dipakai tombol "Lihat Siswa" di Kelas Saya
   * (components/mentor/LihatSiswaButton.tsx) supaya langsung terfilter ke
   * kelas asal klik, bukan "Semua Kelas". */
  initialKelasId?: string;
}) {
  const [search, setSearch] = useState("");
  const [kelasId, setKelasId] = useState(initialKelasId);

  const totalSiswaAllKelas = useMemo(() => groups.reduce((sum, g) => sum + g.siswa.length, 0), [groups]);
  const isSearching = search.trim().length > 0;

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .filter((g) => !kelasId || g.kelasId === kelasId)
      .map((g) => ({
        ...g,
        siswa: q ? g.siswa.filter((s) => s.nama.toLowerCase().includes(q)) : g.siswa,
      }));
  }, [groups, search, kelasId]);

  const totalMatches = filteredGroups.reduce((sum, g) => sum + g.siswa.length, 0);
  const groupsToRender = isSearching ? filteredGroups.filter((g) => g.siswa.length > 0) : filteredGroups;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <InputField
            type="text"
            size="md"
            placeholder="Cari nama siswa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sm:w-64">
          <InputField
            type="dropdown"
            size="md"
            value={kelasId}
            onChange={(e) => setKelasId(e.target.value)}
            options={[
              { label: "Semua Kelas", value: "" },
              ...groups.map((g) => ({ label: g.kelasNama, value: g.kelasId })),
            ]}
          />
        </div>
      </div>

      {totalSiswaAllKelas === 0 ? (
        <EmptyBox text="Belum ada siswa di kelas manapun" />
      ) : totalMatches === 0 ? (
        <EmptyBox text="Tidak ditemukan siswa yang cocok" />
      ) : (
        <div className="flex flex-col gap-6">
          {groupsToRender.map((group) => (
            <div
              key={group.kelasId}
              className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-5"
            >
              <p className="text-base font-medium text-black">{group.kelasNama}</p>
              {group.siswa.length === 0 ? (
                <p className="text-sm text-[#7E7C7C]">Belum ada siswa terdaftar di kelas ini.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {group.siswa.map((s) => (
                    <Link
                      key={s.userId}
                      href={`/siswa-binaan/${s.userId}?kelasId=${group.kelasId}`}
                      className="flex items-center gap-3 rounded-[16px] p-2 transition-colors hover:bg-gray-50"
                    >
                      <Avatar avatarUrl={s.avatarUrl} nama={s.nama} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <p className="truncate text-base text-black">{s.nama}</p>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <ProgressBar persen={s.progresPersen} />
                          </div>
                          <span className="shrink-0 text-sm text-[#7E7C7C]">{s.progresPersen}%</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
