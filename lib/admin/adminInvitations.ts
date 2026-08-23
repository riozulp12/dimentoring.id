import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer "Undang Admin" — PRD Bagian 8 BR-3 (Akun Admin hanya lewat
 * undangan Admin lain), Bagian 13 (admin_invitations, user_roles).
 */

export type AdminInvitationStatus = "menunggu" | "sudah_dipakai" | "kadaluarsa";

export interface AdminInvitationItem {
  id: string;
  label: string | null;
  invitedByNama: string;
  usedByNama: string | null;
  status: AdminInvitationStatus;
  createdAt: string;
  expiredAt: string;
}

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function computeStatus(usedAt: string | null, expiredAt: string): AdminInvitationStatus {
  if (usedAt) return "sudah_dipakai";
  if (new Date(expiredAt).getTime() <= Date.now()) return "kadaluarsa";
  return "menunggu";
}

/** Semua undangan (bukan cuma milik Admin yang login) — tim masih kecil, transparansi antar-Admin wajar. */
export async function getAdminInvitations(): Promise<AdminInvitationItem[]> {
  const { data, error } = await supabaseServer
    .from("admin_invitations")
    .select(
      "id, label, created_at, expired_at, used_at, invited_by:invited_by_id(nama), used_by:used_by_id(nama)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getAdminInvitations] query failed:", JSON.stringify(error, null, 2));
    return [];
  }

  type NamaJoin = { nama: string };
  type Row = {
    id: string;
    label: string | null;
    created_at: string;
    expired_at: string;
    used_at: string | null;
    invited_by: NamaJoin | NamaJoin[] | null;
    used_by: NamaJoin | NamaJoin[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    label: row.label,
    invitedByNama: firstOrNull(row.invited_by)?.nama ?? "-",
    usedByNama: firstOrNull(row.used_by)?.nama ?? null,
    status: computeStatus(row.used_at, row.expired_at),
    createdAt: row.created_at,
    expiredAt: row.expired_at,
  }));
}

export interface ValidAdminInvitation {
  id: string;
  invitedById: string;
}

/**
 * Validasi token undangan — dipakai DUA tempat: app/(auth)/daftar-admin/page.tsx
 * (tampilkan/sembunyikan form) DAN app/api/auth/daftar-admin/route.ts (validasi
 * ULANG di server saat submit — jangan pernah percaya validasi client saja).
 * Valid HANYA kalau token ada, belum dipakai (used_at IS NULL), dan belum
 * kadaluarsa (expired_at > now) — "Batalkan" di halaman Undang Admin cuma
 * meng-set expired_at=now(), jadi otomatis ditolak lewat kondisi yang sama.
 */
export async function validateAdminInvitationToken(token: string): Promise<ValidAdminInvitation | null> {
  const { data, error } = await supabaseServer
    .from("admin_invitations")
    .select("id, invited_by_id, used_at, expired_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("[validateAdminInvitationToken] query failed:", JSON.stringify(error, null, 2));
    return null;
  }
  if (!data) return null;
  if (data.used_at) return null;
  if (new Date(data.expired_at as string).getTime() <= Date.now()) return null;

  return { id: data.id as string, invitedById: data.invited_by_id as string };
}
