import Image from "next/image";

export type TaglineVariant = "primary" | "secondary";

export interface TaglineProps {
  variant?: TaglineVariant;
  className?: string;
  priority?: boolean;
}

const WIDTH = 247;
const HEIGHT = 40;

const SOURCES: Record<TaglineVariant, string> = {
  primary: "/icons/tagline-primary.svg",
  secondary: "/icons/tagline-secondary.svg",
};

export default function Tagline({ variant = "primary", className, priority }: TaglineProps) {
  return (
    <Image
      src={SOURCES[variant]}
      width={WIDTH}
      height={HEIGHT}
      alt="Bertumbuh Bersama, Dimentorin Sampai Berhasil"
      className={className}
      priority={priority}
    />
  );
}
