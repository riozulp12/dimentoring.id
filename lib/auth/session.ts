import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Session disimpan sebagai cookie httpOnly berisi payload ter-signed (HMAC-SHA256),
// BUKAN dipercaya mentah dari client — cookie tetap bisa diedit manual oleh user
// (lewat devtools/curl) meski httpOnly mencegah dibaca lewat JS, jadi signature wajib
// diverifikasi tiap request supaya user_id/role tidak bisa dipalsukan (lihat aturan
// "role tidak boleh dari input client" di CLAUDE.md).

export const SESSION_COOKIE_NAME = "dimentoring_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 hari

export type SessionRole = "student" | "mentor" | "admin";

export interface SessionPayload {
  userId: string;
  role: SessionRole;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET belum di-set di environment (.env.local) — wajib ada untuk sign session cookie.",
    );
  }
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createSessionToken(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = sign(data);
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (
      payload &&
      typeof payload.userId === "string" &&
      (payload.role === "student" || payload.role === "mentor" || payload.role === "admin")
    ) {
      return payload as SessionPayload;
    }
    return null;
  } catch {
    return null;
  }
}
