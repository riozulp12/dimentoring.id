// Konstanta murni (tanpa import node:crypto) supaya bisa dipakai dari
// middleware.ts (Edge runtime) tanpa ikut menarik dependency Node-only.
// lib/auth/session.ts re-export dari sini untuk tetap backward-compatible
// dengan call site lain (login/register route, dsb).

export const SESSION_COOKIE_NAME = "dimentoring_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 hari
