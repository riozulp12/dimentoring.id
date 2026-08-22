"use client";

import type { ButtonHTMLAttributes } from "react";

export type ButtonSize = "sm" | "md" | "lg" | "xl";
export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Design Audit: teks tombol/CTA dikunci 14-16px (bukan tumbuh sampai 24px di
 * breakpoint besar seperti sebelumnya) — beda ukuran variant sekarang murni
 * dari padding, bukan font-size, supaya CTA tidak lebih besar dari body text
 * biasa (kecuali hero landing page, yang tetap pakai size="md" seperti biasa).
 */
const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "px-5 py-2 text-sm tracking-[-0.32px]",
  md: "px-6 py-2 sm:px-7 sm:py-2.5 lg:px-8 text-sm sm:text-base tracking-[-0.4px]",
  lg: "px-6 py-2.5 sm:px-7 lg:px-8 text-base tracking-[-0.48px]",
  xl: "px-6 py-3 sm:px-7 sm:py-4 lg:px-8 lg:py-5 text-base tracking-[-0.48px]",
};

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: [
    "bg-[#081EEA] text-white",
    "border border-solid border-transparent drop-shadow-[2px_2px_0px_#000000]",
    "hover:border-white hover:drop-shadow-[0px_0px_5px_#000000]",
    "active:border-white active:drop-shadow-[2px_2px_0px_#000000]",
    "disabled:bg-[#E3E3E3] disabled:text-[#7E7C7C] disabled:border-transparent disabled:drop-shadow-[2px_2px_0px_#000000]",
  ].join(" "),
  secondary: [
    "bg-white text-[#081EEA]",
    "border border-solid border-[#081EEA] drop-shadow-[2px_2px_0px_#081EEA]",
    "hover:border-white hover:drop-shadow-[0px_0px_5px_#081EEA]",
    "active:border-white active:drop-shadow-[2px_2px_0px_#081EEA]",
    "disabled:bg-[#E3E3E3] disabled:text-[#7E7C7C] disabled:border-transparent disabled:drop-shadow-[2px_2px_0px_#FFFFFF]",
  ].join(" "),
};

export default function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center rounded-[18px]",
        "font-medium leading-[1.5] whitespace-nowrap",
        "transition-[filter,border-color] duration-150 ease-out",
        "disabled:cursor-not-allowed disabled:pointer-events-none",
        SIZE_STYLES[size],
        VARIANT_STYLES[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
