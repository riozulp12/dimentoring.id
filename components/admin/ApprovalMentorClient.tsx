"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import InputField from "@/components/ui/InputField";
import MentorApprovalActions from "./MentorApprovalActions";
import type {
  ApprovalMentorItem,
  ApprovalMentorStatus,
  CalonMentorItem,
} from "@/lib/admin/getApprovalMentorData";

/**
 * List/tab/search "Manajemen Mentor" — PRD Bagian 5, Bagian 8 BR-2. 6 tab:
 * 3 tab lama (Menunggu/Disetujui/Ditolak, berdasarkan user_roles.status) +
 * 3 tab baru (Aktif/Pasif = subset status='active' dipecah ada/tidaknya
 * siswa binaan; Calon Mentor = siswa alumni yang belum pernah ajukan jadi
 * mentor, sumber data BEDA/tabel users bukan user_roles-mentor, TANPA aksi).
 * Semua list sudah di-fetch sekaligus di page.tsx (Server Component), pindah
 * tab & search murni client-side. Klik card BUKAN lagi buka modal — pindah
 * ke halaman detail penuh /approval-mentor/[mentorId]; approve/reject inline
 * di tab Menunggu tetap ada (lewat MentorApprovalActions, dipakai ulang juga
 * di halaman detail), memindahkan baris antar tab secara optimistic tanpa
 * reload/refetch penuh. Aktif/Pasif/Calon Mentor TIDAK ikut dipindah optimis
 * saat approve/reject — cukup akurat sampai refresh berikutnya (PRD tidak
 * mensyaratkan live-sync untuk 3 tab ini).
 */

type MentorListTab = ApprovalMentorStatus | "aktif" | "pasif";
type MentorTab = MentorListTab | "calon_mentor";

const TABS: { key: MentorTab; label: string }[] = [
  { key: "pending", label: "Menunggu" },
  { key: "active", label: "Disetujui" },
  { key: "rejected", label: "Ditolak" },
  { key: "aktif", label: "Aktif" },
  { key: "pasif", label: "Pasif" },
  { key: "calon_mentor", label: "Calon Mentor" },
];

const EMPTY_TEXT: Record<MentorTab, string> = {
  pending: "Tidak ada pengajuan menunggu",
  active: "Tidak ada pengajuan disetujui",
  rejected: "Tidak ada pengajuan ditolak",
  aktif: "Tidak ada mentor aktif",
  pasif: "Tidak ada mentor pasif",
  calon_mentor: "Tidak ada calon mentor",
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function ApprovalMentorClient({
  initialPending,
  initialActive,
  initialRejected,
  initialAktif,
  initialPasif,
  initialCalonMentor,
  adminName,
}: {
  initialPending: ApprovalMentorItem[];
  initialActive: ApprovalMentorItem[];
  initialRejected: ApprovalMentorItem[];
  initialAktif: ApprovalMentorItem[];
  initialPasif: ApprovalMentorItem[];
  initialCalonMentor: CalonMentorItem[];
  adminName: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<MentorTab>("pending");
  const [search, setSearch] = useState("");
  const [pendingList, setPendingList] = useState(initialPending);
  const [activeList, setActiveList] = useState(initialActive);
  const [rejectedList, setRejectedList] = useState(initialRejected);
  const [aktifList] = useState(initialAktif);
  const [pasifList] = useState(initialPasif);
  const [calonMentorList] = useState(initialCalonMentor);

  const setListByTab: Record<
    ApprovalMentorStatus,
    (updater: (prev: ApprovalMentorItem[]) => ApprovalMentorItem[]) => void
  > = {
    pending: setPendingList,
    active: setActiveList,
    rejected: setRejectedList,
  };

  const countByTab: Record<MentorTab, number> = {
    pending: pendingList.length,
    active: activeList.length,
    rejected: rejectedList.length,
    aktif: aktifList.length,
    pasif: pasifList.length,
    calon_mentor: calonMentorList.length,
  };

  const isCalonMentorTab = tab === "calon_mentor";
  const filtered = useMemo(() => {
    if (tab === "calon_mentor") return [];
    const currentList: ApprovalMentorItem[] =
      tab === "pending"
        ? pendingList
        : tab === "active"
          ? activeList
          : tab === "rejected"
            ? rejectedList
            : tab === "aktif"
              ? aktifList
              : pasifList;
    const q = search.trim().toLowerCase();
    if (!q) return currentList;
    return currentList.filter((r) => r.nama.toLowerCase().includes(q));
  }, [tab, pendingList, activeList, rejectedList, aktifList, pasifList, search]);

  const filteredCalonMentor = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return calonMentorList;
    return calonMentorList.filter(
      (r) => r.nama.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
  }, [calonMentorList, search]);

  function moveItem(item: ApprovalMentorItem, to: ApprovalMentorStatus, patch: Partial<ApprovalMentorItem>) {
    const updated: ApprovalMentorItem = { ...item, ...patch };
    setListByTab.pending((prev) => prev.filter((r) => r.userRoleId !== item.userRoleId));
    setListByTab.active((prev) => prev.filter((r) => r.userRoleId !== item.userRoleId));
    setListByTab.rejected((prev) => prev.filter((r) => r.userRoleId !== item.userRoleId));
    setListByTab[to]((prev) => [updated, ...prev]);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex w-full flex-wrap gap-2 border-b border-[#E3E3E3]">
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
          placeholder="Cari nama mentor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isCalonMentorTab ? (
        filteredCalonMentor.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
            <p className="text-base text-[#7E7C7C]">{EMPTY_TEXT[tab]}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredCalonMentor.map((item) => (
              <div
                key={item.userId}
                className="flex flex-col gap-1 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-6"
              >
                <p className="text-base font-medium text-black">{item.nama}</p>
                <p className="text-sm text-[#7E7C7C]">{item.email}</p>
                <p className="text-sm text-[#7E7C7C]">Jadi alumni {formatDate(item.tanggalDaftar)}</p>
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">{EMPTY_TEXT[tab]}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => (
            <div
              key={item.userRoleId}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/approval-mentor/${item.userRoleId}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`/approval-mentor/${item.userRoleId}`);
              }}
              className="flex cursor-pointer flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 transition-colors hover:border-[#081EEA] sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-base font-medium text-black">{item.nama}</p>
                <p className="text-sm text-[#7E7C7C]">{item.email}</p>
                <p className="text-sm text-[#7E7C7C]">
                  {item.asalPtn ?? "-"} · {item.jurusan ?? "-"} · Semester {item.semester ?? "-"}
                </p>
                <p className="text-sm text-[#7E7C7C]">Daftar {formatDate(item.tanggalDaftar)}</p>
                {tab !== "pending" ? (
                  <p className="text-sm text-[#7E7C7C]">
                    Direview oleh {item.direviewOlehNama ?? "-"} · {formatDate(item.tanggalReview)}
                  </p>
                ) : null}
              </div>

              {tab === "pending" ? (
                <MentorApprovalActions
                  userRoleId={item.userRoleId}
                  nama={item.nama}
                  size="sm"
                  onSuccess={(result) =>
                    moveItem(item, result.action === "setujui" ? "active" : "rejected", {
                      direviewOlehNama: adminName,
                      tanggalReview: result.tanggalReview,
                      alasanTolak: result.alasanTolak,
                    })
                  }
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
