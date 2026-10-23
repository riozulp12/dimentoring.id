import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { buatCsv } from "@/lib/shared/csv";
import {
  LEAD_CATATAN_MAX,
  LEAD_SUMBER,
  isLeadStatus,
  type LeadStatus,
  type LeadSumber,
} from "@/lib/shared/leadConsent";

/**
 * Data layer halaman Admin "Leads" (PRD 7.4.6, BR-38). Dipakai
 * app/(protected)/(admin)/leads/page.tsx dan app/api/admin/leads/**.
 * Otorisasi dilakukan di pemanggil (requireAdminAktif), bukan di sini.
 */

export const LEAD_LIST_LIMIT = 500;
export const LEAD_EXPORT_LIMIT = 10000;
/** Nilai filter khusus: lead tanpa utm_campaign. */
export const TANPA_CAMPAIGN = "__tanpa__";

export interface LeadItem {
  id: string;
  noWa: string;
  nama: string | null;
  sumber: string;
  status: LeadStatus;
  catatan: string | null;
  jumlahSubmit: number;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  fbclid: string | null;
  assessmentId: string | null;
  userId: string | null;
  consentVersi: string;
  consentAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadFilter {
  status?: LeadStatus;
  sumber?: LeadSumber;
  utmCampaign?: string;
  q?: string;
}

const KOLOM =
  "id, no_wa, nama, sumber, status, catatan, jumlah_submit, utm_source, utm_medium, utm_campaign, utm_content, fbclid, assessment_id, user_id, consent_versi, consent_at, created_at, updated_at";

type Row = Record<string, unknown>;

function toItem(row: Row): LeadItem {
  return {
    id: row.id as string,
    noWa: row.no_wa as string,
    nama: (row.nama as string | null) ?? null,
    sumber: row.sumber as string,
    status: row.status as LeadStatus,
    catatan: (row.catatan as string | null) ?? null,
    jumlahSubmit: Number(row.jumlah_submit ?? 1),
    utmSource: (row.utm_source as string | null) ?? null,
    utmMedium: (row.utm_medium as string | null) ?? null,
    utmCampaign: (row.utm_campaign as string | null) ?? null,
    utmContent: (row.utm_content as string | null) ?? null,
    fbclid: (row.fbclid as string | null) ?? null,
    assessmentId: (row.assessment_id as string | null) ?? null,
    userId: (row.user_id as string | null) ?? null,
    consentVersi: row.consent_versi as string,
    consentAt: row.consent_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Filter dari query string — nilai tak dikenal diabaikan, bukan dipercaya. */
export function parseLeadFilter(params: URLSearchParams): LeadFilter {
  const filter: LeadFilter = {};
  const status = params.get("status");
  if (isLeadStatus(status)) filter.status = status;
  const sumber = params.get("sumber");
  if (sumber && (LEAD_SUMBER as readonly string[]).includes(sumber)) filter.sumber = sumber as LeadSumber;
  const campaign = params.get("utm_campaign")?.trim();
  if (campaign) filter.utmCampaign = campaign.slice(0, 150);
  const q = params.get("q")?.trim();
  if (q) filter.q = q.slice(0, 100);
  return filter;
}

/** Hapus karakter yang punya arti di filter `or()` PostgREST / pola ilike. */
function bersihkanKataKunci(q: string): string {
  return q.replace(/[,()%*\\:"'_]/g, " ").replace(/\s+/g, " ").trim();
}

/** Kata kunci nomor: digit saja, awalan 0 / 62 dibuang supaya 0812 cocok dengan 62812. */
function digitPencarian(q: string): string | null {
  if (!/^[+\d\s-]+$/.test(q)) return null;
  const digit = q.replace(/\D/g, "").replace(/^(62|0)/, "");
  return digit.length >= 3 ? digit : null;
}

async function queryLeads(filter: LeadFilter, limit: number): Promise<LeadItem[] | "gagal"> {
  let query = supabaseServer.from("leads").select(KOLOM);
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.sumber) query = query.eq("sumber", filter.sumber);
  if (filter.utmCampaign === TANPA_CAMPAIGN) query = query.is("utm_campaign", null);
  else if (filter.utmCampaign) query = query.eq("utm_campaign", filter.utmCampaign);
  if (filter.q) {
    const digit = digitPencarian(filter.q);
    const kata = bersihkanKataKunci(filter.q);
    if (digit) query = query.ilike("no_wa", `%${digit}%`);
    else if (kata.length >= 2) query = query.ilike("nama", `%${kata}%`);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) {
    console.error("[admin/leads] query leads failed:", error);
    return "gagal";
  }
  return ((data ?? []) as Row[]).map(toItem);
}

export function getLeads(filter: LeadFilter = {}): Promise<LeadItem[] | "gagal"> {
  return queryLeads(filter, LEAD_LIST_LIMIT);
}

/** Daftar utm_campaign yang pernah muncul di leads (untuk dropdown filter). */
export async function getLeadCampaignOptions(): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("leads")
    .select("utm_campaign")
    .not("utm_campaign", "is", null)
    .limit(LEAD_EXPORT_LIMIT);
  if (error) {
    console.error("[admin/leads] query utm_campaign failed:", error);
    return [];
  }
  const set = new Set(((data ?? []) as Row[]).map((row) => row.utm_campaign as string).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b));
}

export interface UbahLeadInput {
  status?: unknown;
  catatan?: unknown;
}

export type UbahLeadHasil =
  | { ok: true; lead: LeadItem }
  | { ok: false; status: number; error: string };

/**
 * Ubah status/catatan satu lead. Perubahan status dicatat di lead_status_log
 * (siapa, dari apa, ke apa). Field lain (no_wa, UTM, consent) tidak bisa
 * diubah lewat jalur ini.
 */
export async function ubahLead(id: string, adminId: string, input: UbahLeadInput): Promise<UbahLeadHasil> {
  const update: Record<string, unknown> = {};
  if (input.status !== undefined) {
    if (!isLeadStatus(input.status)) return { ok: false, status: 400, error: "Status tidak valid." };
    update.status = input.status;
  }
  if (input.catatan !== undefined) {
    if (input.catatan !== null && typeof input.catatan !== "string") {
      return { ok: false, status: 400, error: "Catatan tidak valid." };
    }
    const catatan = typeof input.catatan === "string" ? input.catatan.trim() : "";
    if ([...catatan].length > LEAD_CATATAN_MAX) {
      return { ok: false, status: 400, error: `Catatan maksimal ${LEAD_CATATAN_MAX} karakter.` };
    }
    update.catatan = catatan || null;
  }
  if (Object.keys(update).length === 0) return { ok: false, status: 400, error: "Tidak ada perubahan yang dikirim." };

  const { data: lama, error: lamaError } = await supabaseServer
    .from("leads")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (lamaError) {
    console.error("[admin/leads] query lead failed:", lamaError);
    return { ok: false, status: 500, error: "Gagal memuat lead. Coba lagi nanti." };
  }
  if (!lama) return { ok: false, status: 404, error: "Lead tidak ditemukan." };

  const statusLama = lama.status as string;
  const statusBerubah = update.status !== undefined && update.status !== statusLama;
  update.updated_at = new Date().toISOString();

  const { data: baru, error: updateError } = await supabaseServer
    .from("leads")
    .update(update)
    .eq("id", id)
    .select(KOLOM)
    .maybeSingle();
  if (updateError || !baru) {
    console.error("[admin/leads] update lead failed:", updateError);
    return { ok: false, status: 500, error: "Gagal menyimpan perubahan. Coba lagi nanti." };
  }

  if (statusBerubah) {
    const { error: logError } = await supabaseServer.from("lead_status_log").insert({
      lead_id: id,
      admin_id: adminId,
      status_lama: statusLama,
      status_baru: update.status,
    });
    if (logError) console.error("[admin/leads] insert lead_status_log failed:", logError);
  }

  return { ok: true, lead: toItem(baru as Row) };
}

export const LEAD_CSV_HEADER = [
  "tanggal_masuk",
  "no_wa",
  "nama",
  "status",
  "sumber",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "fbclid",
  "jumlah_submit",
  "catatan",
  "consent_versi",
  "consent_at",
  "terakhir_diperbarui",
];

export function leadsKeCsv(leads: LeadItem[]): string {
  return buatCsv(
    LEAD_CSV_HEADER,
    leads.map((l) => [
      l.createdAt,
      l.noWa,
      l.nama,
      l.status,
      l.sumber,
      l.utmSource,
      l.utmMedium,
      l.utmCampaign,
      l.utmContent,
      l.fbclid,
      l.jumlahSubmit,
      l.catatan,
      l.consentVersi,
      l.consentAt,
      l.updatedAt,
    ]),
  );
}

export function getLeadsUntukExport(filter: LeadFilter): Promise<LeadItem[] | "gagal"> {
  return queryLeads(filter, LEAD_EXPORT_LIMIT);
}
