import Image from "next/image";

/**
 * Avatar reusable — dipakai di navbar dashboard semua role & list siswa
 * binaan mentor. avatarUrl NULL (fitur upload foto belum dibangun) →
 * lingkaran inisial huruf pertama nama, background biru brand, bukan
 * broken image atau kosong.
 */

export type AvatarSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "size-8 sm:size-9 text-sm",
  md: "size-9 text-base",
  lg: "size-16 text-2xl",
  xl: "size-20 sm:size-24 text-3xl",
};

const SIZE_IMAGE_SIZES: Record<AvatarSize, string> = {
  sm: "36px",
  md: "36px",
  lg: "64px",
  xl: "96px",
};

export interface AvatarProps {
  avatarUrl: string | null;
  nama: string;
  size?: AvatarSize;
  className?: string;
}

export default function Avatar({ avatarUrl, nama, size = "md", className = "" }: AvatarProps) {
  const initial = nama.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${SIZE_CLASS[size]} ${avatarUrl ? "bg-[#d9d9d9]" : "bg-[#081EEA]"} ${className}`}
    >
      {avatarUrl ? (
        <Image src={avatarUrl} alt={nama} fill className="object-cover" sizes={SIZE_IMAGE_SIZES[size]} />
      ) : (
        <span className="font-bold text-white">{initial}</span>
      )}
    </div>
  );
}
