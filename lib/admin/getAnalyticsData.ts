import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer Analytics (Admin) — PRD Bagian 13 (users.utm_source/
 * utm_campaign, iklan_campaign, pengeluaran_bisnis, enrollments+kelas).
 * Sumber traffic dibaca APA ADANYA dari kolom utm_source/utm_campaign users
 * (diisi saat register, lihat app/api/auth/register/route.ts &
 * app/api/auth/google-callback/route.ts) — tidak divalidasi terhadap daftar
 * nilai tertentu di sini.
 */

const ORGANIC_LABEL = "Organic/Tidak Diketahui";

export interface MarketingStats {
  totalPendaftaran: number;
  bulanIni: number;
  dariReferral: number;
  dariIklan: number;
}

export interface PendaftaranPerSumber {
  sumber: string;
  jumlah: number;
}

export interface CampaignListItem {
  id: string;
  namaCampaign: string;
  platform: string;
  budget: number | null;
  tanggalMulai: string | null;
  tanggalSelesai: string | null;
  utmCampaignTag: string | null;
  catatan: string | null;
  leads: number;
  /** Cost per Lead = budget / leads — null kalau budget kosong atau leads 0 (hindari div/0). */
  cpl: number | null;
}

export interface BulanTotal {
  /** Kunci bulan format YYYY-MM, urut ASC (bulan terlama duluan). */
  bulan: string;
  /** Label ringkas buat sumbu X chart, mis. "Mar '26". */
  label: string;
  total: number;
}

export interface PengeluaranListItem {
  id: string;
  kategori: string;
  deskripsi: string;
  jumlah: number;
  tanggal: string;
}

/** 4 stat card Analytics. */
export async function getMarketingStats(): Promise<MarketingStats> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [rolesRes, bulanIniRes, referralRes, iklanRes] = await Promise.all([
    // "Total Pendaftaran" = user unik dengan role student ATAU mentor (BUKAN
    // row count user_roles — satu user bisa punya 2 baris kalau dual-role).
    supabaseServer.from("user_roles").select("user_id").in("role_type", ["student", "mentor"]),
    supabaseServer.from("users").select("*", { count: "exact", head: true }).gte("created_at", startOfMonth.toISOString()),
    supabaseServer.from("referrals").select("*", { count: "exact", head: true }),
    supabaseServer.from("users").select("*", { count: "exact", head: true }).not("utm_source", "is", null),
  ]);

  if (rolesRes.error) {
    console.error("[getMarketingStats] query user_roles failed:", rolesRes.error);
  }
  if (bulanIniRes.error) console.error("[getMarketingStats] query bulan ini failed:", bulanIniRes.error);
  if (referralRes.error) console.error("[getMarketingStats] query referrals failed:", referralRes.error);
  if (iklanRes.error) console.error("[getMarketingStats] query dari iklan failed:", iklanRes.error);

  const uniqueRegisteredUsers = new Set((rolesRes.data ?? []).map((r) => r.user_id as string));

  return {
    totalPendaftaran: uniqueRegisteredUsers.size,
    bulanIni: bulanIniRes.count ?? 0,
    dariReferral: referralRes.count ?? 0,
    dariIklan: iklanRes.count ?? 0,
  };
}

/** Chart "Pendaftaran per Sumber" — GROUP BY utm_source, DESC, NULL jadi "Organic/Tidak Diketahui". */
export async function getPendaftaranPerSumber(): Promise<PendaftaranPerSumber[]> {
  const { data, error } = await supabaseServer.from("users").select("utm_source");

  if (error) {
    console.error("[getPendaftaranPerSumber] query failed:", error);
    return [];
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const sumber = (row.utm_source as string | null)?.trim() || ORGANIC_LABEL;
    counts.set(sumber, (counts.get(sumber) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([sumber, jumlah]) => ({ sumber, jumlah }))
    .sort((a, b) => b.jumlah - a.jumlah);
}

/** Section "Campaign Iklan" — leads dihitung dari users.utm_campaign yang cocok PERSIS ke utm_campaign_tag. */
export async function getCampaignList(): Promise<CampaignListItem[]> {
  const [campaignRes, usersRes] = await Promise.all([
    supabaseServer
      .from("iklan_campaign")
      .select("id, nama_campaign, platform, budget, tanggal_mulai, tanggal_selesai, utm_campaign_tag, catatan")
      .order("created_at", { ascending: false }),
    supabaseServer.from("users").select("utm_campaign").not("utm_campaign", "is", null),
  ]);

  if (campaignRes.error) {
    console.error("[getCampaignList] query iklan_campaign failed:", campaignRes.error);
    return [];
  }
  if (usersRes.error) {
    console.error("[getCampaignList] query users.utm_campaign failed:", usersRes.error);
  }

  const leadsPerTag = new Map<string, number>();
  for (const row of usersRes.data ?? []) {
    const tag = row.utm_campaign as string;
    leadsPerTag.set(tag, (leadsPerTag.get(tag) ?? 0) + 1);
  }

  return (campaignRes.data ?? []).map((row) => {
    const utmCampaignTag = row.utm_campaign_tag as string | null;
    const budget = row.budget !== null ? Number(row.budget) : null;
    const leads = utmCampaignTag ? (leadsPerTag.get(utmCampaignTag) ?? 0) : 0;
    const cpl = budget !== null && leads > 0 ? budget / leads : null;

    return {
      id: row.id as string,
      namaCampaign: row.nama_campaign as string,
      platform: row.platform as string,
      budget,
      tanggalMulai: row.tanggal_mulai as string | null,
      tanggalSelesai: row.tanggal_selesai as string | null,
      utmCampaignTag,
      catatan: row.catatan as string | null,
      leads,
      cpl,
    };
  });
}

/** 6 bulan terakhir (termasuk bulan berjalan), urut ASC — dipakai chart Sales & Pengeluaran. */
function last6Bulan(): { key: string; label: string }[] {
  const now = new Date();
  const bulan: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
    bulan.push({ key, label });
  }
  return bulan;
}

function bulanKeyFrom(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface EnrollmentSalesRow {
  tanggal_daftar: string;
  kelas: { harga: number | string } | { harga: number | string }[] | null;
}

/**
 * Chart "Sales" (Pendapatan per Bulan) — enrollments dengan status_pembayaran
 * 'lunas' JOIN kelas.harga, GROUP BY bulan dari tanggal_daftar, 6 bulan
 * terakhir. Akan selalu Rp 0 sebelum sistem Payment aktif (BUKAN bug — belum
 * ada enrollment yang bisa mencapai status 'lunas').
 */
export async function getSalesPerBulan(): Promise<BulanTotal[]> {
  const bulanList = last6Bulan();
  const startDate = `${bulanList[0].key}-01`;

  const { data, error } = await supabaseServer
    .from("enrollments")
    .select("tanggal_daftar, kelas:kelas_id(harga)")
    .eq("status_pembayaran", "lunas")
    .gte("tanggal_daftar", startDate);

  if (error) {
    console.error("[getSalesPerBulan] query failed:", error);
    return bulanList.map((b) => ({ bulan: b.key, label: b.label, total: 0 }));
  }

  const totals = new Map(bulanList.map((b) => [b.key, 0]));
  for (const row of (data ?? []) as unknown as EnrollmentSalesRow[]) {
    const key = bulanKeyFrom(row.tanggal_daftar);
    if (!totals.has(key)) continue;
    const kelas = firstOrNull(row.kelas);
    totals.set(key, (totals.get(key) ?? 0) + Number(kelas?.harga ?? 0));
  }

  return bulanList.map((b) => ({ bulan: b.key, label: b.label, total: totals.get(b.key) ?? 0 }));
}

/**
 * Chart "Pengeluaran per Bulan" — gabungan SUM(pengeluaran_bisnis.jumlah)
 * GROUP BY bulan dari `tanggal` + SUM(iklan_campaign.budget) GROUP BY bulan
 * dari `tanggal_mulai`, 6 bulan terakhir.
 */
export async function getPengeluaranPerBulan(): Promise<BulanTotal[]> {
  const bulanList = last6Bulan();
  const startDate = `${bulanList[0].key}-01`;

  const [pengeluaranRes, campaignRes] = await Promise.all([
    supabaseServer.from("pengeluaran_bisnis").select("tanggal, jumlah").gte("tanggal", startDate),
    supabaseServer
      .from("iklan_campaign")
      .select("tanggal_mulai, budget")
      .not("tanggal_mulai", "is", null)
      .not("budget", "is", null)
      .gte("tanggal_mulai", startDate),
  ]);

  if (pengeluaranRes.error) {
    console.error("[getPengeluaranPerBulan] query pengeluaran_bisnis failed:", pengeluaranRes.error);
  }
  if (campaignRes.error) {
    console.error("[getPengeluaranPerBulan] query iklan_campaign failed:", campaignRes.error);
  }

  const totals = new Map(bulanList.map((b) => [b.key, 0]));

  for (const row of pengeluaranRes.data ?? []) {
    const key = bulanKeyFrom(row.tanggal as string);
    if (!totals.has(key)) continue;
    totals.set(key, (totals.get(key) ?? 0) + Number(row.jumlah));
  }
  for (const row of campaignRes.data ?? []) {
    const key = bulanKeyFrom(row.tanggal_mulai as string);
    if (!totals.has(key)) continue;
    totals.set(key, (totals.get(key) ?? 0) + Number(row.budget));
  }

  return bulanList.map((b) => ({ bulan: b.key, label: b.label, total: totals.get(b.key) ?? 0 }));
}

/** List Pengeluaran (section CRUD sederhana) — urut tanggal terbaru dulu. */
export async function getPengeluaranList(): Promise<PengeluaranListItem[]> {
  const { data, error } = await supabaseServer
    .from("pengeluaran_bisnis")
    .select("id, kategori, deskripsi, jumlah, tanggal")
    .order("tanggal", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getPengeluaranList] query failed:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    kategori: row.kategori as string,
    deskripsi: row.deskripsi as string,
    jumlah: Number(row.jumlah),
    tanggal: row.tanggal as string,
  }));
}
