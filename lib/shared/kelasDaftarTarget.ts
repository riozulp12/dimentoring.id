import type { SessionRole } from "@/lib/auth/session";

/**
 * SATU-SATUNYA sumber aturan tujuan tombol "Daftar Sekarang" kelas — dipakai
 * card /program (+ Rekomendasi Kelas) lewat components/program/KelasDaftarButton.tsx
 * dan halaman detail publik app/program/kelas/[kelasId]/page.tsx. Fungsi murni
 * (tanpa React/env) supaya bisa dites langsung.
 *
 * Urutan aturan:
 * 1. Kelas penuh -> disabled.
 * 2. `link_lynkid` ("Input Link Pendaftaran" di Kelola Kelas) terisi & valid
 *    (HANYA http/https) -> ke link itu, semua pengunjung/role, TANPA wajib
 *    login. Host domain Dimentoring sendiri -> link internal biasa (tab sama);
 *    host lain -> tab baru.
 * 3. Link kosong (atau tidak valid):
 *    - pengaman NEXT_PUBLIC_PENDAFTARAN_MANUAL aktif -> disabled "Pendaftaran
 *      segera dibuka" (checkout internal dianggap belum siap, JANGAN diarahkan
 *      ke /checkout).
 *    - belum login -> /login?returnTo=<detail kelas>
 *    - Siswa -> /checkout/[kelasId]
 *    - role lain (Mentor/Admin) -> disabled, pendaftaran cuma untuk Siswa.
 */

export type KelasDaftarAction =
  | { kind: "external"; href: string }
  | { kind: "internal"; href: string }
  | {
      kind: "disabled";
      label: string;
      /** Label pendek untuk card 2 kolom di mobile (whitespace-nowrap). */
      labelCompact: string;
      keterangan: string;
    };

/** Host yang dianggap "Dimentoring sendiri". SENGAJA tidak mencakup subdomain
 * lain (mis. tryout.dimentoring.id milik partner Agensoal) — itu tetap eksternal. */
const DIMENTORING_HOSTS = new Set(["dimentoring.id", "www.dimentoring.id"]);

/** URL http/https yang valid, atau null (termasuk `javascript:`, `data:`, teks bebas). */
export function parseLinkPendaftaran(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export interface ResolveKelasDaftarParams {
  kelasId: string;
  sisaSlot: number;
  linkPendaftaran: string | null;
  sessionRole: SessionRole | null;
  isPendaftaranManual: boolean;
}

export function resolveKelasDaftarAction({
  kelasId,
  sisaSlot,
  linkPendaftaran,
  sessionRole,
  isPendaftaranManual,
}: ResolveKelasDaftarParams): KelasDaftarAction {
  if (sisaSlot <= 0) {
    return {
      kind: "disabled",
      label: "Kelas Penuh",
      labelCompact: "Kelas Penuh",
      keterangan: "Kelas ini sudah penuh, kuota sudah terisi semua.",
    };
  }

  const link = parseLinkPendaftaran(linkPendaftaran);
  if (link) {
    if (DIMENTORING_HOSTS.has(link.hostname)) {
      return { kind: "internal", href: `${link.pathname}${link.search}${link.hash}` };
    }
    return { kind: "external", href: link.href };
  }

  if (isPendaftaranManual) {
    return {
      kind: "disabled",
      label: "Pendaftaran segera dibuka",
      labelCompact: "Segera Dibuka",
      keterangan: "Pendaftaran kelas ini segera dibuka. Coba lagi nanti.",
    };
  }

  if (!sessionRole) {
    return {
      kind: "internal",
      href: `/login?returnTo=${encodeURIComponent(`/program/kelas/${kelasId}`)}`,
    };
  }

  if (sessionRole === "student") {
    return { kind: "internal", href: `/checkout/${kelasId}` };
  }

  return {
    kind: "disabled",
    label: "Daftar Sekarang",
    labelCompact: "Daftar Sekarang",
    keterangan: "Pendaftaran hanya untuk akun Siswa",
  };
}
