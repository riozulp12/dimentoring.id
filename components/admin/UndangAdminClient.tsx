"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InputField from "@/components/ui/InputField";
import type { AdminInvitationItem, AdminInvitationStatus } from "@/lib/admin/adminInvitations";

/**
 * "Undang Admin" — PRD Bagian 8 BR-3. Buat undangan lewat Modal (form Label
 * -> tampil link + Copy Link), list semua undangan (bukan cuma milik Admin
 * yang login — tim masih kecil), "Batalkan" untuk yang masih "Menunggu".
 */

const STATUS_LABEL: Record<AdminInvitationStatus, string> = {
  menunggu: "Menunggu",
  sudah_dipakai: "Sudah Dipakai",
  kadaluarsa: "Kadaluarsa",
};

const STATUS_BADGE: Record<AdminInvitationStatus, string> = {
  menunggu: "bg-amber-50 text-amber-700",
  sudah_dipakai: "bg-[#F0FDF4] text-[#0CBA00]",
  kadaluarsa: "bg-gray-100 text-[#7E7C7C]",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function UndangAdminClient({
  initialInvitations,
  adminName,
}: {
  initialInvitations: AdminInvitationItem[];
  adminName: string;
}) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  function openCreateForm() {
    setLabel("");
    setSubmitError(null);
    setCreatedLink(null);
    setCopied(false);
    setFormOpen(true);
  }

  function closeCreateForm() {
    setFormOpen(false);
    setCreatedLink(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/buat-undangan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal membuat undangan. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }
      setCreatedLink(json.link as string);
      setInvitations((prev) => [
        {
          id: json.invitation.id as string,
          label: (json.invitation.label as string | null) ?? null,
          invitedByNama: adminName,
          usedByNama: null,
          status: "menunggu" as const,
          createdAt: json.invitation.createdAt as string,
          expiredAt: json.invitation.expiredAt as string,
        },
        ...prev,
      ]);
      setIsSubmitting(false);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API bisa ditolak browser (permission/context tidak secure) —
      // diamkan saja, tombol tetap bisa dicoba lagi.
    }
  }

  async function handleCancel(id: string) {
    setCancellingId(id);
    setCancelError(null);
    try {
      const response = await fetch(`/api/admin/buat-undangan/${id}`, { method: "PATCH" });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setCancelError(json.error ?? "Gagal membatalkan undangan. Coba lagi nanti.");
        setCancellingId(null);
        return;
      }
      setInvitations((prev) =>
        prev.map((inv) => (inv.id === id ? { ...inv, status: "kadaluarsa" as const } : inv)),
      );
      setCancellingId(null);
    } catch {
      setCancelError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setCancellingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button type="button" variant="primary" size="md" onClick={openCreateForm}>
          + Buat Undangan Baru
        </Button>
      </div>

      {invitations.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">
            Belum ada undangan Admin. Klik &quot;Buat Undangan Baru&quot; untuk mulai.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="overflow-x-auto rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#E3E3E3] text-[#7E7C7C]">
                  <th className="px-4 py-3 font-medium">Label</th>
                  <th className="px-4 py-3 font-medium">Dibuat Oleh</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Tanggal Dibuat</th>
                  <th className="px-4 py-3 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="border-b border-[#E3E3E3] last:border-0">
                    <td className="px-4 py-3 text-black">{inv.label ?? "-"}</td>
                    <td className="px-4 py-3 text-[#7E7C7C]">{inv.invitedByNama}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[inv.status]}`}
                        >
                          {STATUS_LABEL[inv.status]}
                        </span>
                        {inv.status === "sudah_dipakai" && inv.usedByNama ? (
                          <span className="text-xs text-[#7E7C7C]">oleh {inv.usedByNama}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">{formatDate(inv.createdAt)}</td>
                    <td className="px-4 py-3">
                      {inv.status === "menunggu" ? (
                        <button
                          type="button"
                          disabled={cancellingId === inv.id}
                          onClick={() => handleCancel(inv.id)}
                          className="rounded-lg border border-[#FFEBEB] px-3 py-1.5 text-sm font-medium text-[#E70A0A] transition-colors hover:bg-[#FFEBEB] disabled:opacity-50"
                        >
                          {cancellingId === inv.id ? "Membatalkan..." : "Batalkan"}
                        </button>
                      ) : (
                        <span className="text-sm text-[#7E7C7C]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cancelError ? <p className="text-sm text-[#E70A0A]">{cancelError}</p> : null}
        </div>
      )}

      <Modal open={formOpen} onClose={closeCreateForm}>
        {createdLink ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold text-black">Undangan berhasil dibuat</p>
              <p className="text-sm text-[#7E7C7C]">
                Share link ini manual lewat WA/email ke calon Admin baru. Link berlaku 48 jam.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 truncate rounded-[16px] bg-[#F9F9F9] px-4 py-2.5 text-sm text-[#7E7C7C] sm:text-base">
                {createdLink}
              </div>
              <Button type="button" variant="primary" size="md" onClick={handleCopy}>
                {copied ? "Tersalin!" : "Copy Link"}
              </Button>
            </div>
            <Button type="button" variant="secondary" size="md" onClick={closeCreateForm}>
              Tutup
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-black">Buat Undangan Baru</h2>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-black">Label (opsional)</label>
              <InputField
                type="text"
                size="md"
                placeholder="mis. untuk Amrul"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            {submitError ? <p className="text-sm text-[#E70A0A]">{submitError}</p> : null}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={closeCreateForm}
                disabled={isSubmitting}
              >
                Batal
              </Button>
              <Button type="submit" variant="primary" size="md" className="flex-1" disabled={isSubmitting}>
                {isSubmitting ? "Membuat..." : "Buat Undangan"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
