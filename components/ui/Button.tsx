"use client";

import type { ButtonHTMLAttributes } from "react";

export type ButtonSize = "sm" | "md" | "lg";
export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "text-base tracking-[-0.32px]",
  md: "text-xl tracking-[-0.4px]",
  lg: "text-2xl tracking-[-0.48px]",
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
    "border border-solid border-transparent drop-shadow-[2px_2px_0px_#081EEA]",
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
        "inline-flex items-center justify-center rounded-xl px-8 py-2.5",
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
