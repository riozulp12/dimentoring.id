import type { AccountMenuItem } from "@/components/dashboard/AccountMenu";

/**
 * Item dropdown menu akun BEDA per role (PRD 7.0.6 FR-1.9) — plain function,
 * SENGAJA dipisah dari components/dashboard/AccountMenu.tsx (file "use
 * client") supaya bisa dipanggil langsung dari Server Component
 * (app/page.tsx, app/(protected)/layout.tsx) tanpa error RSC boundary.
 */

const ROLE_URL_SLUG: Record<"student" | "mentor" | "admin", "siswa" | "mentor" | "admin"> = {
  student: "siswa",
  mentor: "mentor",
  admin: "admin",
};

export function getAccountMenuItems(
  role: "student" | "mentor" | "admin",
  canApplyMentor: boolean,
): AccountMenuItem[] {
  const slug = ROLE_URL_SLUG[role];
  const items: AccountMenuItem[] = [
    { label: "Profil", href: "/profil", icon: "profil" },
    { label: "Dashboard", href: `/dashboard/${slug}`, icon: "dashboard" },
    { label: "Pengaturan", href: `/pengaturan/${slug}`, icon: "pengaturan" },
  ];

  if (role === "student" && canApplyMentor) {
    items.push({ label: "Jadi Mentor", href: "/jadi-mentor", icon: "jadi-mentor" });
  }

  items.push({ label: "Logout", href: "/api/auth/logout", icon: "logout" });
  return items;
}
