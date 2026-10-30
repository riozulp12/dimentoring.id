/**
 * Ikon SVG Studio Soal (pola sama dengan components/dashboard/*Icons.tsx —
 * repo tidak memakai pustaka ikon). Warna mengikuti currentColor.
 * Ikon bersifat hiasan (aria-hidden); nama tombol diberi lewat aria-label.
 */
type IkonProps = { className?: string };

export function IkonTongSampah({ className = "size-5" }: IkonProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Panah ke bawah; putar 180° (rotate-180) saat terbuka. */
export function IkonChevron({ className = "size-5" }: IkonProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
