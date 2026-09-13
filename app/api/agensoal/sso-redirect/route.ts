import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * SSO redirect ke Agensoal (partner Try Out), PRD Bagian 12. Email/nama diambil
 * dari session server (BUKAN query param) supaya siswa tidak bisa generate token
 * atas nama siswa lain. Generator token di bawah ini PERSIS spesifikasi Agensoal
 * (HMAC-SHA256 + base64url) — jangan diubah logicnya.
 */
function getSSOUrl({
  email,
  name,
  redirectUrl = "/dashboard",
}: {
  email: string;
  name: string;
  redirectUrl?: string;
}) {
  const secretKey = process.env.AGENSOAL_SSO_SECRET as string;
  const portalUrl = "https://tryout.dimentoring.id/auth/sso";
  const payload = {
    email,
    name,
    redirectUrl,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 120,
    jti: crypto.randomBytes(16).toString("hex"),
  };
  const base64Url = (obj: Record<string, unknown>) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const headerB64 = base64Url({ typ: "JWT", alg: "HS256" });
  const payloadB64 = base64Url(payload);
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${portalUrl}?token=${headerB64}.${payloadB64}.${signature}`;
}

export async function GET(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    const loginParams = new URLSearchParams({
      message: "Masuk dulu untuk mengerjakan Try Out",
      redirect: "/api/agensoal/sso-redirect",
    });
    return NextResponse.redirect(new URL(`/login?${loginParams.toString()}`, request.url));
  }

  if (!process.env.AGENSOAL_SSO_SECRET) {
    console.error("[agensoal sso-redirect] AGENSOAL_SSO_SECRET belum di-set di environment.");
    return NextResponse.redirect(new URL("/tryout?error=sso_unavailable", request.url));
  }

  const { data: user, error } = await supabaseServer
    .from("users")
    .select("email, nama")
    .eq("id", session.userId)
    .single();

  if (error || !user) {
    console.error("[agensoal sso-redirect] gagal ambil data user:", error);
    return NextResponse.redirect(new URL("/tryout?error=sso_unavailable", request.url));
  }

  const ssoUrl = getSSOUrl({ email: user.email, name: user.nama });
  return NextResponse.redirect(ssoUrl);
}
