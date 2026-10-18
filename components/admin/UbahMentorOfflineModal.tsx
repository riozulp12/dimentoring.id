"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import { ALASAN_MIN } from "@/lib/shared/enrollmentManual";

/**
 * Ganti mentor tatap muka satu siswa (enrollments.mentor_offline_id) —
 * PRD 7.5.10. Kandidat = mentor aktif, bersedia tatap muka, mengampu mapel
 * kelas (sama dengan checkout). Alasan wajib, tercatat di log audit.
 */

interface MentorOption {
  mentorId: string;
  nama: string;
  asalPtn: string;
}

export default function UbahMentorOfflineModal({
  kelasId,
  enrollmentId,
  siswaNama,
  mentorSekarang,
  onClose,
  onSaved,
}: {
  kelasId: string;
  enrollmentId: string;
  siswaNama: string;
  mentorSekarang: { id: string; nama: string } | null;
  onClose: () => void;
  onSaved: (mentor: { id: string; nama: string }) => void;
}) {
  const [mentorList, setMentorList] = useState<MentorOption[] | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [mentorId, setMentorId] = useState("");
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function muatMentor() {
    setMemuat(true);
    setError(null);
    try {
      const params = new URLSearchParams({ kelasId, enrollmentId });
      const res = await fetch(`/api/admin/enrollment-manual/mentor-offline?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Gagal memuat mentor.");
        return;
      }
      setMentorList((json.mentor as MentorOption[]).filter((m) => m.mentorId !== mentorSekarang?.id));
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setMemuat(false);
    }
  }

  const alasanCukup = alasan.trim().length >= ALASAN_MIN;

  async function handleSimpan() {
    if (!mentorId || !alasanCukup) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/enrollment-manual/mentor-offline", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId, mentorOfflineId: mentorId, alasan }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Gagal menyimpan mentor.");
        setBusy(false);
        return;
      }
      onSaved(json.mentorOffline as { id: string; nama: string });
    } catch {
      setError("Gagal terhubung ke server.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-black">Ubah mentor tatap muka</h2>
        <p className="text-sm text-[#7E7C7C]">
          Siswa: {siswaNama}. Mentor sekarang: {mentorSekarang?.nama ?? "belum ada"}. Sesi yang sudah ditandai mentor
          lama tetap tercatat atas namanya.
        </p>
      </div>

      {mentorList === null ? (
        <Button type="button" variant="secondary" size="md" disabled={memuat} onClick={muatMentor}>
          {memuat ? "Memuat..." : "Tampilkan mentor yang tersedia"}
        </Button>
      ) : mentorList.length === 0 ? (
        <p className="text-sm text-[#E70A0A]">Tidak ada mentor lain yang aktif, bersedia tatap muka, dan mengampu mapel ini.</p>
      ) : (
        <InputField
          type="dropdown"
          size="md"
          placeholder="Pilih mentor baru"
          value={mentorId}
          onChange={(e) => setMentorId(e.target.value)}
          options={mentorList.map((m) => ({ value: m.mentorId, label: `${m.nama} — ${m.asalPtn}` }))}
        />
      )}

      <div className="flex flex-col gap-1">
        <textarea
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          rows={3}
          placeholder="Alasan penggantian (mis. mentor lama pindah kota)"
          className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors placeholder:text-[#AFAFAF] focus:border-black"
        />
        <p className={`text-xs ${alasanCukup || !alasan ? "text-[#7E7C7C]" : "text-[#E70A0A]"}`}>
          Wajib, min. {ALASAN_MIN} karakter. Tercatat di log audit.
        </p>
      </div>

      {error ? <p className="text-sm text-[#E70A0A]">{error}</p> : null}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" size="md" className="flex-1" onClick={onClose}>
          Batal
        </Button>
        <Button
          type="button"
          variant="primary"
          size="md"
          className="flex-1"
          disabled={busy || !mentorId || !alasanCukup}
          onClick={handleSimpan}
        >
          {busy ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </div>
  );
}
