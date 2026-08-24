/**
 * Data menu sidebar per role (Siswa/Mentor/Admin) — PRD Bagian 5 & 12.1.
 * Sengaja dipisah dari sidebar.tsx supaya penambahan/perubahan menu tidak
 * perlu menyentuh logic komponen, cukup edit data di sini.
 */

export type SidebarRole = "siswa" | "mentor" | "admin";

export type SidebarIconKey =
  | "dashboard"
  | "assessment"
  | "kelas"
  | "tryout"
  | "referral"
  | "beasiswa"
  | "ai-mentor"
  | "setting"
  | "analytics"
  | "logout";

export interface SidebarMenuItem {
  icon: SidebarIconKey;
  label: string;
  href: string;
  /** BR-27: item ini dikunci (disabled + tooltip) selama UserRole Mentor berstatus 'pending'. */
  lockedForPendingMentor?: boolean;
}

export interface SidebarMenuGroup {
  group: string;
  items: SidebarMenuItem[];
}

export const sidebarMenus: Record<SidebarRole, SidebarMenuGroup[]> = {
  siswa: [
    {
      group: "Belajar",
      items: [
        { icon: "dashboard", label: "Dashboard", href: "/dashboard/siswa" },
        { icon: "assessment", label: "Assessment Prediksi PTN", href: "/assessment" },
        { icon: "kelas", label: "Kelas Saya", href: "/kelas" },
        { icon: "tryout", label: "Try Out", href: "/tryout" },
      ],
    },
    {
      group: "Lainnya",
      items: [
        { icon: "referral", label: "Referral & Poin", href: "/referral" },
        { icon: "beasiswa", label: "Beasiswa & Event", href: "/beasiswa-event" },
        { icon: "ai-mentor", label: "AI Mentor", href: "/ai-mentor" },
      ],
    },
  ],
  mentor: [
    {
      group: "Mengajar",
      items: [
        { icon: "dashboard", label: "Dashboard", href: "/dashboard/mentor" },
        { icon: "kelas", label: "Kelas Saya", href: "/kelas-saya", lockedForPendingMentor: true },
        { icon: "referral", label: "Siswa Saya", href: "/siswa-binaan", lockedForPendingMentor: true },
        {
          icon: "assessment",
          label: "Materi & Latihan Soal",
          href: "/review-konten",
          lockedForPendingMentor: true,
        },
        { icon: "beasiswa", label: "Honor", href: "/honor", lockedForPendingMentor: true },
        { icon: "beasiswa", label: "Beasiswa & Event", href: "/beasiswa-event" },
      ],
    },
  ],
  admin: [
    {
      group: "Operasional",
      items: [
        { icon: "dashboard", label: "Dashboard", href: "/dashboard/admin" },
        { icon: "tryout", label: "Manajemen Mentor", href: "/approval-mentor" },
        { icon: "ai-mentor", label: "Manajemen Siswa", href: "/manajemen-siswa" },
        { icon: "kelas", label: "Kelola Kelas", href: "/kelola-kelas" },
        { icon: "assessment", label: "Kelola Assessment", href: "/kelola-assessment" },
        { icon: "setting", label: "Undang Admin", href: "/undang-admin" },
      ],
    },
    {
      group: "Bisnis",
      items: [
        { icon: "beasiswa", label: "Kelola Konten", href: "/kelola-konten" },
        { icon: "referral", label: "Payment", href: "/payment" },
        { icon: "analytics", label: "Analytics", href: "/analytics" },
      ],
    },
  ],
};

/** Item bawah (Pengaturan/Keluar) — sama polanya di semua role, cuma href beda. */
export const sidebarBottomMenus: Record<SidebarRole, SidebarMenuItem[]> = {
  siswa: [
    { icon: "setting", label: "Pengaturan", href: "/pengaturan" },
    { icon: "logout", label: "Keluar", href: "/api/auth/logout" },
  ],
  mentor: [
    { icon: "setting", label: "Pengaturan", href: "/pengaturan" },
    { icon: "logout", label: "Keluar", href: "/api/auth/logout" },
  ],
  admin: [
    { icon: "setting", label: "Pengaturan", href: "/pengaturan" },
    { icon: "logout", label: "Keluar", href: "/api/auth/logout" },
  ],
};
