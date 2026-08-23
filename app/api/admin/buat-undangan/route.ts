import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/** Buat undangan Admin baru — PRD Bagian 8 BR-3, Bagian 13 (admin_invitations). */

const EXPIRY_HOURS = 48;

interface BuatUndanganBody {
  label?: string;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa membuat undangan Admin baru.", 403);
  }

  let body: BuatUndanganBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;
  const token = randomBytes(32).toString("hex");
  const expiredAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error: insertError } = await supabaseServer
    .from("admin_invitations")
    .insert({ invited_by_id: session.userId, label, token, expired_at: expiredAt })
    .select("id, created_at, expired_at")
    .single();

  if (insertError) {
    console.error("[buat-undangan] insert failed:", JSON.stringify(insertError, null, 2));
    return errorResponse("Gagal membuat undangan. Coba lagi nanti.", 500);
  }

  // Link lengkap dihitung dari header `host` request (sama pola dengan link
  // referral di app/(protected)/(siswa)/referral/page.tsx) — benar di domain
  // manapun tanpa perlu env var terpisah yang bisa lupa di-set di deploy baru.
  const host = request.headers.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const link = `${protocol}://${host}/daftar-admin?token=${token}`;

  return NextResponse.json(
    {
      success: true,
      link,
      invitation: {
        id: data.id as string,
        label,
        createdAt: data.created_at as string,
        expiredAt: data.expired_at as string,
      },
    },
    { status: 201 },
  );
}
