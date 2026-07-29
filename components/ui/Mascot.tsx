import Image from "next/image";
import type { ComponentPropsWithoutRef } from "react";

export type MascotVariant =
  | "Listen"
  | "Guidance"
  | "Sing"
  | "Happy"
  | "Happy1"
  | "Happy With Univ"
  | "Sad"
  | "Angry"
  | "Plenger"
  | "Confuse"
  | "Happy2"
  | "Happy Graduate";

interface MascotAsset {
  src: string;
  width: number;
  height: number;
}

const MASCOT_ASSETS: Record<MascotVariant, MascotAsset> = {
  Listen: { src: "/mascots/mascot-listen.png", width: 957, height: 1142 },
  Guidance: { src: "/mascots/mascot-guidance.png", width: 883, height: 1142 },
  Sing: { src: "/mascots/mascot-sing.png", width: 883, height: 1142 },
  Happy: { src: "/mascots/mascot-happy.png", width: 945, height: 1081 },
  Happy1: { src: "/mascots/mascot-happy-1.png", width: 945, height: 1081 },
  "Happy With Univ": {
    src: "/mascots/mascot-happy-with-univ.png",
    width: 997,
    height: 1243,
  },
  Sad: { src: "/mascots/mascot-sad.png", width: 945, height: 1081 },
  Angry: { src: "/mascots/mascot-angry.png", width: 914, height: 1112 },
  Plenger: { src: "/mascots/mascot-plenger.png", width: 945, height: 1142 },
  Confuse: { src: "/mascots/mascot-confuse.png", width: 883, height: 1142 },
  Happy2: { src: "/mascots/mascot-happy-2.png", width: 982, height: 1470 },
  "Happy Graduate": {
    src: "/mascots/mascot-happy-graduate.png",
    width: 997,
    height: 1171,
  },
};

export interface MascotProps
  extends Omit<
    ComponentPropsWithoutRef<typeof Image>,
    "src" | "width" | "height" | "alt"
  > {
  variant: MascotVariant;
  alt?: string;
}

export default function Mascot({ variant, alt, ...props }: MascotProps) {
  const asset = MASCOT_ASSETS[variant];

  return (
    <Image
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={alt ?? `Dimentoring mascot - ${variant}`}
      {...props}
    />
  );
}
