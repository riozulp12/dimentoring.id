"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MentorApprovalActions, { type MentorApprovalResult } from "./MentorApprovalActions";

/**
 * Badge status + aksi Setujui/Tolak di halaman detail Manajemen Mentor —
 * pisah dari sisa halaman (Server Component) supaya cuma bagian ini yang
 * jadi Client Component. Setelah aksi sukses: badge di-update optimistic
 * DAN router.refresh() supaya field lain di halaman (Direview oleh/Tanggal
 * Review) ikut sinkron dengan data server terbaru.
 */

export type MentorDetailStatus = "pending" | "active" | "rejected";

function StatusBadge({ status }: { status: MentorDetailStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 sm:text-sm">
        Aktif
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 sm:text-sm">
        On Review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 sm:text-sm">
      Ditolak
    </span>
  );
}

export default function MentorDetailStatusSection({
  userRoleId,
  nama,
  initialStatus,
}: {
  userRoleId: string;
  nama: string;
  initialStatus: MentorDetailStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<MentorDetailStatus>(initialStatus);

  function handleSuccess(result: MentorApprovalResult) {
    setStatus(result.action === "setujui" ? "active" : "rejected");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <StatusBadge status={status} />
      {status === "pending" ? (
        <MentorApprovalActions userRoleId={userRoleId} nama={nama} onSuccess={handleSuccess} />
      ) : null}
    </div>
  );
}
