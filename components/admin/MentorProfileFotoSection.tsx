"use client";

import { useState } from "react";
import Image from "next/image";
import Button from "@/components/ui/Button";

/**
 * Section "Foto Profil Mentor" di halaman detail Manajemen Mentor (Admin) —
 * PRD Bagian 6. Menampilkan users.avatar_url (foto asli — otomatis dari
 * Google saat daftar, atau upload manual mentor di halaman Profil mereka)
 * dalam ukuran besar, BEDA dari foto_landing_url (curated, lihat
 * MentorLandingFotoSection) yang khusus section Mentor landing page.
 *
 * Tombol download fetch gambar sebagai blob (bukan cuma <a href download>)
 * karena avatar_url adalah URL cross-origin (Supabase Storage) — atribut
 * `download` HTML sering diabaikan browser untuk resource cross-origin dan
 * cuma buka tab baru, bukan benar-benar mengunduh.
 */

function guessExtension(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

function slugifyNama(nama: string): string {
  return nama.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "mentor";
}

export default function MentorProfileFotoSection({
  nama,
  avatarUrl,
}: {
  nama: string;
  avatarUrl: string | null;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    if (!avatarUrl) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch(avatarUrl);
      if (!response.ok) throw new Error("fetch failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `foto-profil-${slugifyNama(nama)}.${guessExtension(blob.type)}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setDownloadError("Gagal mengunduh foto. Coba lagi nanti.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-5 sm:px-8 sm:py-6">
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Foto Profil Mentor</h2>

      {avatarUrl ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="relative h-[320px] w-[320px] max-w-full shrink-0 overflow-hidden rounded-[16px] bg-[#F9F9F9]">
            <Image src={avatarUrl} alt={nama} fill className="object-contain" sizes="320px" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Button type="button" variant="secondary" size="sm" onClick={handleDownload} disabled={isDownloading}>
              {isDownloading ? "Mengunduh..." : "Download Foto Ini"}
            </Button>
            {downloadError ? <p className="text-xs text-[#E70A0A]">{downloadError}</p> : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[16px] bg-[#F9F9F9] px-5 py-10 text-center">
          <p className="text-sm text-[#7E7C7C]">
            Mentor ini belum punya foto profil, hubungi langsung untuk minta foto
          </p>
        </div>
      )}
    </div>
  );
}
