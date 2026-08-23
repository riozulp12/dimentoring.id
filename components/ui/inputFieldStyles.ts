/**
 * Token style dasar dipakai bareng InputField.tsx (text/password/file) dan
 * SelectField.tsx — dipisah ke sini (bukan di InputField.tsx) supaya
 * SelectField.tsx tidak perlu import dari InputField.tsx (InputField.tsx
 * sendiri yang import SelectField untuk type="dropdown" — hindari circular
 * import antar dua file itu).
 */

export type InputFieldStatus = "default" | "success" | "error";
export type InputFieldSize = "md" | "lg";

export const ICONS = {
  eye: { src: "/icons/input-eye.svg", size: 32 },
  chevronDown: { src: "/icons/input-chevron-down.svg", size: 24 },
  upload: { src: "/icons/input-upload.svg", size: 32 },
} as const;

export const ICON_SIZES: Record<InputFieldSize, { eye: number; chevronDown: number }> = {
  md: { eye: 22, chevronDown: 20 },
  lg: { eye: 32, chevronDown: 24 },
};

export const FIELD_BASE =
  "w-full border flex items-center font-normal leading-[1.5] tracking-[-0.02em] transition-colors";

export const FIELD_SIZES: Record<InputFieldSize, string> = {
  md: "rounded-[16px] px-4 py-2.5 sm:px-5 sm:py-3 gap-2.5 sm:gap-3 text-sm sm:text-base",
  lg: "rounded-[20px] px-5 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5 gap-3 sm:gap-4 lg:gap-5 text-base sm:text-lg lg:text-xl",
};

export function fieldTone(status: InputFieldStatus, disabled?: boolean) {
  if (disabled) {
    return "bg-[#F9F9F9] border-[#AFAFAF] text-[#7E7C7C] cursor-not-allowed";
  }
  if (status === "error") {
    return "bg-[#FFEBEB] border-[#E70A0A] text-[#E70A0A]";
  }
  if (status === "success") {
    return "bg-white border-[#0CBA00] text-[#7E7C7C]";
  }
  return "bg-white border-[#AFAFAF] text-[#7E7C7C] hover:border-[#081EEA] focus-within:border-black focus-within:text-black";
}
