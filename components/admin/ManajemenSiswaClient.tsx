"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import InputField from "@/components/ui/InputField";
import type { SiswaListItem } from "@/lib/admin/getManajemenSiswaData";

/** List + tab + search "Manajemen Siswa" (Admin) — PRD Bagian 5 & 13. Tab
 * (Semua/Aktif/Alumni/Belum Bayar) diturunkan client-side dari subStatus +
 * jumlahKelas yang sudah dihitung getSiswaList() (enrollments status_pembayaran
 * ='lunas'), search nama/email murni client-side (pola sama dengan
 * ApprovalMentorClient.tsx). */

type SiswaTab = "semua" | "aktif" | "alumni" | "belum_bayar";

const TABS: { key: SiswaTab; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "aktif", label: "Aktif" },
  { key: "alumni", label: "Alumni" },
  { key: "belum_bayar", label: "Belum Bayar" },
];

const EMPTY_TEXT: Record<SiswaTab, string> = {
  semua: "Belum ada siswa terdaftar.",
  aktif: "Tidak ada siswa aktif.",
  alumni: "Tidak ada siswa alumni.",
  belum_bayar: "Tidak ada siswa yang belum bayar.",
};

function matchesTab(siswa: SiswaListItem, tab: SiswaTab): boolean {
  if (tab === "semua") return true;
  if (tab === "alumni") return siswa.subStatus === "mahasiswa";
  if (tab === "aktif") return siswa.subStatus === "calon_mahasiswa" && siswa.jumlahKelas > 0;
  return siswa.subStatus === "calon_mahasiswa" && siswa.jumlahKelas === 0;
}

const SUB_STATUS_LABEL: Record<string, string> = {
  calon_mahasiswa: "Calon Mahasiswa",
  mahasiswa: "Mahasiswa",
};

const TINGKAT_KELAS_LABEL: Record<string, string> = {
  kelas_10: "Kelas 10",
  kelas_11: "Kelas 11",
  kelas_12: "Kelas 12",
  gap_year: "Gap Year",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function ManajemenSiswaClient({ initialSiswa }: { initialSiswa: SiswaListItem[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<SiswaTab>("semua");
  const [search, setSearch] = useState("");

  const countByTab: Record<SiswaTab, number> = useMemo(
    () => ({
      semua: initialSiswa.length,
      aktif: initialSiswa.filter((s) => matchesTab(s, "aktif")).length,
      alumni: initialSiswa.filter((s) => matchesTab(s, "alumni")).length,
      belum_bayar: initialSiswa.filter((s) => matchesTab(s, "belum_bayar")).length,
    }),
    [initialSiswa],
  );

  const currentTabList = useMemo(() => initialSiswa.filter((s) => matchesTab(s, tab)), [initialSiswa, tab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return currentTabList;
    return currentTabList.filter(
      (s) => s.nama.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
  }, [currentTabList, search]);

  return (
    <div className="flex flex-col gap-5">
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
            {t.label} ({countByTab[t.key]})
          </button>
        ))}
      </div>

      <div className="max-w-md">
        <InputField
          type="text"
          size="md"
          placeholder="Cari nama atau email siswa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">
            {currentTabList.length === 0 ? EMPTY_TEXT[tab] : "Tidak ada siswa yang cocok dengan pencarian."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E3E3E3] text-[#7E7C7C]">
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Sekolah</th>
                <th className="px-4 py-3 font-medium">Tingkat</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tanggal Daftar</th>
                <th className="px-4 py-3 font-medium">Kelas Diikuti</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((siswa) => (
                <tr
                  key={siswa.id}
                  onClick={() => router.push(`/manajemen-siswa/${siswa.id}`)}
                  className="cursor-pointer border-b border-[#E3E3E3] transition-colors last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-black">{siswa.nama}</td>
                  <td className="px-4 py-3 text-[#7E7C7C]">{siswa.email}</td>
                  <td className="px-4 py-3 text-[#7E7C7C]">{siswa.namaSekolah ?? "-"}</td>
                  <td className="px-4 py-3 text-[#7E7C7C]">
                    {siswa.tingkatKelas ? (TINGKAT_KELAS_LABEL[siswa.tingkatKelas] ?? siswa.tingkatKelas) : "-"}
                  </td>
                  <td className="px-4 py-3 text-[#7E7C7C]">
                    {siswa.subStatus ? (SUB_STATUS_LABEL[siswa.subStatus] ?? siswa.subStatus) : "-"}
                  </td>
                  <td className="px-4 py-3 text-[#7E7C7C]">{formatDate(siswa.createdAt)}</td>
                  <td className="px-4 py-3 text-[#7E7C7C]">{siswa.jumlahKelas} Kelas</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
