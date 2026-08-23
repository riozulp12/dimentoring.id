"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

/**
 * Aksi Setujui/Tolak pengajuan Mentor — PRD Bagian 8 BR-2. Diekstrak dari
 * ApprovalMentorClient supaya bisa DIPAKAI ULANG di halaman detail
 * /approval-mentor/[mentorId] juga (klik card sekarang buka halaman penuh,
 * bukan modal, tapi aksi approve/reject harus tetap tersedia di dua tempat).
 */

export interface MentorApprovalResult {
  action: "setujui" | "tolak";
  tanggalReview: string;
  alasanTolak: string | null;
}

export default function MentorApprovalActions({
  userRoleId,
  nama,
  onSuccess,
  size = "md",
}: {
  userRoleId: string;
  nama: string;
  onSuccess: (result: MentorApprovalResult) => void;
  size?: "sm" | "md";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  async function submit(action: "setujui" | "tolak", alasan?: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/approval-mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userRoleId, action, alasan }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error ?? "Gagal menyimpan keputusan. Coba lagi nanti.");
        setBusy(false);
        return;
      }
      setBusy(false);
      setRejectOpen(false);
      setRejectReason("");
      onSuccess({
        action,
        tanggalReview: json.tanggalReview as string,
        alasanTolak: (json.alasanTolak as string | null) ?? null,
      });
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setBusy(false);
    }
  }

  const buttonSizeClass = size === "sm" ? "px-4 py-2 text-sm" : "px-5 py-2.5 text-sm sm:text-base";

  return (
    <>
      <div className="flex flex-col gap-2" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
            className={`rounded-lg border border-[#E3E3E3] font-medium text-[#7E7C7C] transition-colors hover:bg-gray-50 disabled:opacity-50 ${buttonSizeClass}`}
          >
            Tolak
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => submit("setujui")}
            className={`rounded-lg bg-[#081EEA] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 ${buttonSizeClass}`}
          >
            Setujui
          </button>
        </div>
        {error ? <p className="text-sm text-[#E70A0A]">{error}</p> : null}
      </div>

      <Modal
        open={rejectOpen}
        onClose={() => {
          setRejectOpen(false);
          setRejectReason("");
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-lg font-semibold text-black">Tolak pengajuan {nama}?</p>
            <p className="text-sm text-[#7E7C7C]">Alasan penolakan (opsional, boleh dikosongkan)</p>
          </div>
          <textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
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
                setRejectOpen(false);
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
              disabled={busy}
              onClick={() => submit("tolak", rejectReason.trim() || undefined)}
            >
              Konfirmasi Tolak
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
