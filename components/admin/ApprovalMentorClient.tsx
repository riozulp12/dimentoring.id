"use client";

import { useMemo, useState } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import type { ApprovalMentorItem, ApprovalMentorStatus } from "@/lib/admin/getApprovalMentorData";

/**
 * List/tab/search/detail/aksi Approval Mentor — PRD Bagian 5, Bagian 8 BR-2.
 * Data ketiga tab sudah di-fetch sekaligus di page.tsx (Server Component),
 * pindah tab & search murni client-side; approve/reject memindahkan baris
 * antar tab secara optimistic tanpa reload/refetch penuh.
 */

const TABS: { key: ApprovalMentorStatus; label: string }[] = [
  { key: "pending", label: "Menunggu" },
  { key: "active", label: "Disetujui" },
  { key: "rejected", label: "Ditolak" },
];

const EMPTY_TEXT: Record<ApprovalMentorStatus, string> = {
  pending: "Tidak ada pengajuan menunggu",
  active: "Tidak ada pengajuan disetujui",
  rejected: "Tidak ada pengajuan ditolak",
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function ApprovalMentorClient({
  initialPending,
  initialActive,
  initialRejected,
  adminName,
}: {
  initialPending: ApprovalMentorItem[];
  initialActive: ApprovalMentorItem[];
  initialRejected: ApprovalMentorItem[];
  adminName: string;
}) {
  const [tab, setTab] = useState<ApprovalMentorStatus>("pending");
  const [search, setSearch] = useState("");
  const [pendingList, setPendingList] = useState(initialPending);
  const [activeList, setActiveList] = useState(initialActive);
  const [rejectedList, setRejectedList] = useState(initialRejected);
  const [detailItem, setDetailItem] = useState<ApprovalMentorItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalMentorItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const listByTab: Record<ApprovalMentorStatus, ApprovalMentorItem[]> = {
    pending: pendingList,
    active: activeList,
    rejected: rejectedList,
  };
  const setListByTab: Record<ApprovalMentorStatus, (updater: (prev: ApprovalMentorItem[]) => ApprovalMentorItem[]) => void> = {
    pending: setPendingList,
    active: setActiveList,
    rejected: setRejectedList,
  };

  const currentList = listByTab[tab];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return currentList;
    return currentList.filter((r) => r.nama.toLowerCase().includes(q));
  }, [currentList, search]);

  function moveItem(item: ApprovalMentorItem, to: ApprovalMentorStatus, patch: Partial<ApprovalMentorItem>) {
    const updated: ApprovalMentorItem = { ...item, ...patch };
    setListByTab.pending((prev) => prev.filter((r) => r.userRoleId !== item.userRoleId));
    setListByTab.active((prev) => prev.filter((r) => r.userRoleId !== item.userRoleId));
    setListByTab.rejected((prev) => prev.filter((r) => r.userRoleId !== item.userRoleId));
    setListByTab[to]((prev) => [updated, ...prev]);
    return updated;
  }

  async function handleApprove(item: ApprovalMentorItem) {
    setBusyId(item.userRoleId);
    setErrorId(null);
    try {
      const response = await fetch("/api/approval-mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userRoleId: item.userRoleId, action: "setujui" }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setErrorId(item.userRoleId);
        setBusyId(null);
        return;
      }
      moveItem(item, "active", {
        direviewOlehNama: adminName,
        tanggalReview: json.tanggalReview ?? new Date().toISOString(),
        alasanTolak: null,
      });
      setBusyId(null);
      setDetailItem(null);
    } catch {
      setErrorId(item.userRoleId);
      setBusyId(null);
    }
  }

  function openRejectForm(item: ApprovalMentorItem) {
    setRejectTarget(item);
    setRejectReason("");
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    const item = rejectTarget;
    setBusyId(item.userRoleId);
    setErrorId(null);
    try {
      const response = await fetch("/api/approval-mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userRoleId: item.userRoleId,
          action: "tolak",
          alasan: rejectReason.trim() || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setErrorId(item.userRoleId);
        setBusyId(null);
        return;
      }
      moveItem(item, "rejected", {
        direviewOlehNama: adminName,
        tanggalReview: json.tanggalReview ?? new Date().toISOString(),
        alasanTolak: json.alasanTolak ?? (rejectReason.trim() || null),
      });
      setBusyId(null);
      setRejectTarget(null);
      setRejectReason("");
      setDetailItem(null);
    } catch {
      setErrorId(item.userRoleId);
      setBusyId(null);
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
              tab === t.key ? "border-b-2 border-[#081EEA] text-[#081EEA]" : "text-[#7E7C7C] hover:text-black"
            }`}
          >
            {t.label} ({listByTab[t.key].length})
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

      {filtered.length === 0 ? (
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
              onClick={() => setDetailItem(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setDetailItem(item);
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
                {errorId === item.userRoleId ? (
                  <p className="text-sm text-[#E70A0A]">Gagal menyimpan, coba lagi.</p>
                ) : null}
              </div>

              {tab === "pending" ? (
                <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={busyId === item.userRoleId}
                    onClick={() => openRejectForm(item)}
                    className="rounded-lg border border-[#E3E3E3] px-4 py-2 text-sm font-medium text-[#7E7C7C] transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    Tolak
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.userRoleId}
                    onClick={() => handleApprove(item)}
                    className="rounded-lg bg-[#081EEA] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    Setujui
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Modal open={detailItem !== null} onClose={() => setDetailItem(null)}>
        {detailItem ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-black">{detailItem.nama}</h2>
              <p className="text-sm text-[#7E7C7C]">{detailItem.email}</p>
              <p className="text-sm text-[#7E7C7C]">{detailItem.noWa}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[#7E7C7C]">Asal PTN</p>
                <p className="text-black">{detailItem.asalPtn ?? "-"}</p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Semester</p>
                <p className="text-black">{detailItem.semester ?? "-"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[#7E7C7C]">Jurusan</p>
                <p className="text-black">{detailItem.jurusan ?? "-"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[#7E7C7C]">Tanggal Daftar</p>
                <p className="text-black">{formatDate(detailItem.tanggalDaftar)}</p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-sm text-[#7E7C7C]">Subtes yang Diampu</p>
              {detailItem.subtesDiampu.length === 0 ? (
                <p className="text-sm text-black">-</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {detailItem.subtesDiampu.map((nama) => (
                    <span
                      key={nama}
                      className="inline-flex items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]"
                    >
                      {nama}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {tab !== "pending" ? (
              <div className="flex flex-col gap-1 rounded-[16px] bg-[#F9F9F9] px-4 py-3 text-sm">
                <p className="text-[#7E7C7C]">
                  Direview oleh <span className="text-black">{detailItem.direviewOlehNama ?? "-"}</span> ·{" "}
                  {formatDate(detailItem.tanggalReview)}
                </p>
                {detailItem.alasanTolak ? (
                  <p className="text-[#7E7C7C]">
                    Alasan tolak: <span className="text-black">{detailItem.alasanTolak}</span>
                  </p>
                ) : null}
              </div>
            ) : null}

            {errorId === detailItem.userRoleId ? (
              <p className="text-sm text-[#E70A0A]">Gagal menyimpan, coba lagi.</p>
            ) : null}

            {tab === "pending" ? (
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  disabled={busyId === detailItem.userRoleId}
                  onClick={() => openRejectForm(detailItem)}
                >
                  Tolak
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  className="flex-1"
                  disabled={busyId === detailItem.userRoleId}
                  onClick={() => handleApprove(detailItem)}
                >
                  Setujui
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={rejectTarget !== null}
        onClose={() => {
          setRejectTarget(null);
          setRejectReason("");
        }}
      >
        {rejectTarget ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold text-black">Tolak pengajuan {rejectTarget.nama}?</p>
              <p className="text-sm text-[#7E7C7C]">Alasan penolakan (opsional, boleh dikosongkan)</p>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Tulis alasan kalau perlu..."
              className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors placeholder:text-[#AFAFAF] focus:border-black"
            />
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason("");
                }}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-1"
                disabled={busyId === rejectTarget.userRoleId}
                onClick={confirmReject}
              >
                Konfirmasi Tolak
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
