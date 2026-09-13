"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Button from "@/components/ui/Button";
import Toggle from "@/components/ui/Toggle";

/**
 * Section "Foto untuk Landing Page" di halaman detail Manajemen Mentor
 * (Admin) — PRD Bagian 13 mentor_profiles.foto_landing_url/tampil_di_landing
 * (BARU). Upload disimpan ke Supabase Storage bucket "mentor-landing" lewat
 * app/api/admin/mentor-landing/route.ts (POST upload, PATCH toggle).
 *
 * Preview pakai background SAMA PERSIS dengan card di landing page
 * (components/sections/Mentor.tsx) supaya Admin lihat hasil akhirnya
 * sebelum menyalakan toggle, bukan cuma foto mengambang di kotak abu-abu.
 */

const PREVIEW_BG_CLASS = "bg-[#F3F5FF]";

export default function MentorLandingFotoSection({
  mentorUserId,
  nama,
  initialFotoUrl,
  initialTampilDiLanding,
}: {
  mentorUserId: string;
  nama: string;
  initialFotoUrl: string | null;
  initialTampilDiLanding: boolean;
}) {
  const router = useRouter();
  const [fotoUrl, setFotoUrl] = useState(initialFotoUrl);
  const [tampilDiLanding, setTampilDiLanding] = useState(initialTampilDiLanding);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isTogglePending, setIsTogglePending] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    setUploadError(null);

    if (file.type !== "image/png" || !file.name.toLowerCase().endsWith(".png")) {
      setUploadError("Harus PNG dengan background transparan.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadError("Ukuran file maksimal 8MB.");
      return;
    }

    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("mentorUserId", mentorUserId);
      fd.append("file", file);
      const response = await fetch("/api/admin/mentor-landing", { method: "POST", body: fd });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setUploadError(json.error ?? "Gagal mengunggah foto. Coba lagi nanti.");
        return;
      }
      setFotoUrl(json.fotoLandingUrl as string);
      router.refresh();
    } catch {
      setUploadError("Gagal terhubung ke server saat unggah foto.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleToggle() {
    const next = !tampilDiLanding;
    if (next && !fotoUrl) {
      setToggleError("Upload foto PNG dulu sebelum menampilkan di landing page.");
      return;
    }

    setIsTogglePending(true);
    setToggleError(null);
    setTampilDiLanding(next);
    try {
      const response = await fetch("/api/admin/mentor-landing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentorUserId, tampilDiLanding: next }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setTampilDiLanding(!next);
        setToggleError(json.error ?? "Gagal menyimpan perubahan. Coba lagi nanti.");
        return;
      }
      router.refresh();
    } catch {
      setTampilDiLanding(!next);
      setToggleError("Gagal terhubung ke server.");
    } finally {
      setIsTogglePending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-5 sm:px-8 sm:py-6">
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Foto untuk Landing Page</h2>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div
          className={`relative h-[220px] w-[180px] shrink-0 overflow-hidden rounded-[16px] ${PREVIEW_BG_CLASS}`}
        >
          {fotoUrl ? (
            <Image src={fotoUrl} alt={nama} fill className="object-contain object-bottom" sizes="180px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center text-xs text-[#7E7C7C]">
              Belum ada foto landing
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? "Mengunggah..." : fotoUrl ? "Ganti Foto" : "Upload Foto"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,image/png"
            className="hidden"
            onChange={handleFileChange}
          />
          <p className="text-xs text-[#7E7C7C]">PNG dengan background transparan — maks 8MB</p>
          {uploadError ? <p className="text-xs text-[#E70A0A]">{uploadError}</p> : null}

          <div className="mt-3 flex items-center gap-3">
            <Toggle
              checked={tampilDiLanding}
              onChange={handleToggle}
              disabled={isTogglePending}
              label="Tampilkan di Landing Page"
            />
            <span className="text-sm font-medium text-black">Tampilkan di Landing Page</span>
          </div>
          {toggleError ? <p className="text-xs text-[#E70A0A]">{toggleError}</p> : null}
        </div>
      </div>
    </div>
  );
}
