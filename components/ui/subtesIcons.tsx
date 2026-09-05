import type { SVGProps } from "react";
import type { SubtesIconKey } from "@/lib/kelas/subtesIconMap";

/**
 * Ikon dekoratif outline per Subtes (PRD 7.5 poin 7, KelasCardVisual). Style
 * outline tipis konsisten (viewBox 24x24, stroke="currentColor", fill="none")
 * — TIDAK pakai library baru (lihat CLAUDE.md), digambar tangan sendiri
 * mengikuti pola inline SVG yang sudah ada di components/dashboard/*Icons.tsx.
 * Nama key mengikuti lib/kelas/subtesIconMap.ts, jangan diubah sepihak.
 */

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  );
}

function CalculatorIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4.5" y="2.5" width="15" height="19" rx="2" />
      <line x1="7" y1="6" x2="17" y2="6" />
      <circle cx="7.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="18" r="0.9" fill="currentColor" stroke="none" />
      <line x1="16.5" y1="13" x2="16.5" y2="19" />
      <line x1="13.7" y1="16" x2="19.3" y2="16" />
    </IconBase>
  );
}

function AtomIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
    </IconBase>
  );
}

function FlaskIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9.5 2.5h5" />
      <path d="M10 3v6.2L4.7 18.4c-.9 1.6.3 3.6 2.1 3.6h10.4c1.8 0 3-2 2.1-3.6L14 9.2V3" />
      <path d="M7.5 15h9" />
    </IconBase>
  );
}

function DnaIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 3c0 6 10 6 10 12" />
      <path d="M17 21c0-6-10-6-10-12" />
      <line x1="7.8" y1="6.5" x2="16.2" y2="6.5" />
      <line x1="6.6" y1="10" x2="17.4" y2="10" />
      <line x1="6.6" y1="14" x2="17.4" y2="14" />
      <line x1="7.8" y1="17.5" x2="16.2" y2="17.5" />
    </IconBase>
  );
}

function BookIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 4.5C4 3.7 4.7 3 5.5 3H12v16.5H5.5c-.8 0-1.5.7-1.5 1.5V4.5Z" />
      <path d="M20 4.5c0-.8-.7-1.5-1.5-1.5H12v16.5h6.5c.8 0 1.5.7 1.5 1.5V4.5Z" />
    </IconBase>
  );
}

function LanguageIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <line x1="3.3" y1="9.5" x2="20.7" y2="9.5" />
      <line x1="3.3" y1="14.5" x2="20.7" y2="14.5" />
    </IconBase>
  );
}

function ChartLineIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M6.5 15.5 10 11l3 2.5 4.5-6" />
      <path d="M14.7 7.5h2.8v2.8" />
    </IconBase>
  );
}

function WorldIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 4 6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-6-4-9s1.5-6.4 4-9Z" />
    </IconBase>
  );
}

function UsersGroupIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8.5" r="2.6" />
      <path d="M3.5 19c.6-3 2.7-4.7 5.5-4.7s4.9 1.7 5.5 4.7" />
      <circle cx="17" cy="9" r="2.1" />
      <path d="M15.2 14.7c2.2.4 3.6 1.9 4.1 4.3" />
    </IconBase>
  );
}

function HourglassIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 2.5h12" />
      <path d="M6 21.5h12" />
      <path d="M6.5 2.5v3.8c0 2 5.5 4.2 5.5 5.7s-5.5 3.7-5.5 5.7v3.8" />
      <path d="M17.5 2.5v3.8c0 2-5.5 4.2-5.5 5.7s5.5 3.7 5.5 5.7v3.8" />
    </IconBase>
  );
}

function FlagIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5.5 2.5v19" />
      <path d="M5.5 4.5c3.3-2 6.7 2 10 0v10c-3.3 2-6.7-2-10 0Z" />
    </IconBase>
  );
}

function UsersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3.3" />
      <path d="M2.7 19.5c.8-3.7 3.2-5.8 6.3-5.8s5.5 2.1 6.3 5.8" />
      <path d="M15.5 5.3c1.5.4 2.6 1.7 2.6 3.3 0 1.6-1.1 2.9-2.6 3.3" />
      <path d="M17.3 14c2 .6 3.4 2.3 4 5" />
    </IconBase>
  );
}

function BulbIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 18.5h6" />
      <path d="M9.5 21h5" />
      <path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.7.5 1.1 1.3 1.1 2.2h5.4c0-.9.4-1.7 1.1-2.2A6.5 6.5 0 0 0 12 2.5Z" />
    </IconBase>
  );
}

function SchoolIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 2.5 2 7.5l10 5 10-5-10-5Z" />
      <path d="M6 10.5v6c0 1.5 2.7 3 6 3s6-1.5 6-3v-6" />
      <path d="M22 7.5v7" />
    </IconBase>
  );
}

export const SUBTES_ICON_COMPONENTS: Record<SubtesIconKey, (props: IconProps) => React.JSX.Element> = {
  calculator: CalculatorIcon,
  "atom-2": AtomIcon,
  flask: FlaskIcon,
  "dna-2": DnaIcon,
  "book-2": BookIcon,
  language: LanguageIcon,
  "chart-line": ChartLineIcon,
  world: WorldIcon,
  "users-group": UsersGroupIcon,
  hourglass: HourglassIcon,
  flag: FlagIcon,
  users: UsersIcon,
  bulb: BulbIcon,
  school: SchoolIcon,
};
