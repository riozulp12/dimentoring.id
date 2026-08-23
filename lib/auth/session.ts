import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Session disimpan sebagai cookie httpOnly berisi payload ter-signed (HMAC-SHA256),
// BUKAN dipercaya mentah dari client — cookie tetap bisa diedit manual oleh user
// (lewat devtools/curl) meski httpOnly mencegah dibaca lewat JS, jadi signature wajib
// diverifikasi tiap request supaya user_id/role tidak bisa dipalsukan (lihat aturan
// "role tidak boleh dari input client" di CLAUDE.md).

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./session-constants";

// "unassigned" = login SAH (password/Google tervalidasi, cookie signed benar)
// TAPI users.profiling_selesai masih false — user belum pilih role Siswa/Mentor
// & belum isi wizard /lengkapi-profil (PRD 7.0.2 DIREVISI TOTAL, FR-1.15). Beda
// dari "tidak ada session" — token ini valid, cuma role beneran belum ditentukan.
// Sengaja BUKAN nilai role_type di DB (enum role_type cuma student/mentor/admin)
// — murni state sesi sementara, dibuang begitu /lengkapi-profil selesai & session
// di-reissue dengan role asli.
export type SessionRole = "student" | "mentor" | "admin" | "unassigned";

// Dipakai login route (redirect setelah login) & tiap dashboard/{role}/page.tsx
// (guard supaya role session lain tidak bisa buka dashboard role lain lewat URL).
// unassigned -> /lengkapi-profil (BUKAN dashboard) supaya kode yang cuma redirect
// ke ROLE_DASHBOARD_PATH[role] otomatis benar tanpa perlu cek khusus tiap tempat.
export const ROLE_DASHBOARD_PATH: Record<SessionRole, string> = {
  student: "/dashboard/siswa",
  mentor: "/dashboard/mentor",
  admin: "/dashboard/admin",
  unassigned: "/lengkapi-profil",
};

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
      (payload.role === "student" ||
        payload.role === "mentor" ||
        payload.role === "admin" ||
        payload.role === "unassigned")
    ) {
      return payload as SessionPayload;
    }
    return null;
  } catch {
    return null;
  }
}
