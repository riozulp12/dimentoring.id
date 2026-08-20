import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Logout — hapus session cookie, redirect ke landing page. Dipakai sebagai
 * plain link (GET) dari menu akun (Navbar/Header) & sidebar dashboard,
 * supaya tidak perlu JS tambahan untuk aksi logout.
 */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
