import "server-only";
import type { SessionPayload } from "@/lib/auth/session";
import { getAccountMenuData } from "@/lib/dashboard/getAccountMenuData";
import { getAccountMenuItems } from "@/lib/dashboard/getAccountMenuItems";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import type { AccountMenuItem } from "@/components/dashboard/AccountMenu";

/**
 * Props Navbar yang bergantung session — dipakai di SETIAP halaman publik
 * yang merender <Navbar /> (landing, /assessment, /assessment/hasil/[id],
 * dst.), supaya tidak ada halaman yang "lupa" di-wire dan Navbar-nya nyangkut
 * di state belum-login padahal user sudah login (PRD 7.0.6/12.1).
 */

export interface NavbarSessionProps {
  isLoggedIn: boolean;
  firstName?: string;
  fullName?: string;
  avatarUrl?: string | null;
  menuItems?: AccountMenuItem[];
  mentorStatus?: "pending";
  /** Level gamifikasi referral (mis. "Rookie Referrer") — ditampilkan di item "Profil" dropdown akun. */
  referralLevel?: string | null;
}

export async function getNavbarProps(session: SessionPayload | null): Promise<NavbarSessionProps> {
  if (!session) return { isLoggedIn: false };

  const [accountData, mentorStatus] = await Promise.all([
    getAccountMenuData(session.userId, session.role),
    session.role === "mentor" ? getMentorRoleStatus(session.userId) : Promise.resolve(null),
  ]);

  return {
    isLoggedIn: true,
    firstName: accountData.firstName,
    fullName: accountData.fullName,
    avatarUrl: accountData.avatarUrl,
    menuItems: getAccountMenuItems(session.role, accountData.canApplyMentor),
    mentorStatus: mentorStatus === "pending" ? "pending" : undefined,
    referralLevel: accountData.referralLevel,
  };
}
