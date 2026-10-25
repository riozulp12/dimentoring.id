import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";

/**
 * Guard halaman Studio Soal (PR 3b): mentor login + role mentor 'active'
 * (BR-27). Selain itu dialihkan (pola halaman /studio-soal PR 3a).
 * Dipisah dari lib/mentor/studioSoal.ts supaya data layer & API tidak
 * bergantung pada next/navigation. Mengembalikan id mentor.
 */
export async function mentorHalamanStudio(): Promise<string> {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!session) redirect("/login");
  if (session.role !== "mentor") redirect(ROLE_DASHBOARD_PATH[session.role]);
  if ((await getMentorRoleStatus(session.userId)) !== "active") redirect("/dashboard/mentor");
  return session.userId;
}
