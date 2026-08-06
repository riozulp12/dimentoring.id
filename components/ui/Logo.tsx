import Image from "next/image";

export type LogoVariant = "primary" | "secondary";
export type LogoMark = "full" | "name" | "icon";

export interface LogoProps {
  variant?: LogoVariant;
  mark?: LogoMark;
  className?: string;
  priority?: boolean;
}

const DIMENSIONS: Record<LogoMark, { width: number; height: number }> = {
  full: { width: 150, height: 40 },
  name: { width: 128, height: 40 },
  icon: { width: 27, height: 40 },
};

const SOURCES: Record<LogoVariant, Record<LogoMark, string>> = {
  primary: {
    full: "/icons/logo-full-primary.svg",
    name: "/icons/logo-name-primary.svg",
    icon: "/icons/logo-icon-primary.svg",
  },
  secondary: {
    full: "/icons/logo-full-secondary.svg",
    name: "/icons/logo-name-secondary.svg",
    icon: "/icons/logo-icon-secondary.svg",
  },
};

const ALT_TEXT: Record<LogoMark, string> = {
  full: "dimentoring.id",
  name: "dimentoring",
  icon: "",
};

export default function Logo({ variant = "primary", mark = "full", className, priority }: LogoProps) {
  const { width, height } = DIMENSIONS[mark];

  return (
    <Image
      src={SOURCES[variant][mark]}
      width={width}
      height={height}
      alt={ALT_TEXT[mark]}
      className={className}
      priority={priority}
    />
  );
}
