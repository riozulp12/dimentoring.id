import Mascot, { type MascotVariant } from "./Mascot";

/**
 * Loading indicator terpusat — REUSE ilustrasi maskot penguin yang sama
 * dipakai di seluruh project (components/ui/Mascot.tsx), animasi "loncat-loncat"
 * pelan lewat CSS (.animate-mascot-bounce, app/globals.css), bukan spinner
 * generik. Pengganti semua spinner/loading generik yang sebelumnya tersebar
 * (Assessment submit, Payment checkout, dst) — lihat pemakaian di sana.
 */

export type MaskotLoadingSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<MaskotLoadingSize, string> = {
  sm: "h-6 w-auto",
  md: "h-16 w-auto",
  lg: "h-32 w-auto",
};

export interface MaskotLoadingProps {
  size?: MaskotLoadingSize;
  variant?: MascotVariant;
  label?: string;
  className?: string;
}

export default function MaskotLoading({ size = "md", variant = "Happy", label, className }: MaskotLoadingProps) {
  return (
    <span className={["inline-flex flex-col items-center justify-center gap-2", className].filter(Boolean).join(" ")}>
      <Mascot
        variant={variant}
        alt=""
        className={`animate-mascot-bounce select-none ${SIZE_CLASS[size]}`}
      />
      {label ? <span className="text-sm text-[#7E7C7C]">{label}</span> : null}
    </span>
  );
}
