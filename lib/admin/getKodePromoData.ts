import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer "Kode Promo" (Admin) — PRD Bagian 13 (kode_promo, TERPISAH dari
 * iklan_campaign, link campaign cuma opsional buat pelaporan).
 */

export interface KodePromoListItem {
  id: string;
  kode: string;
  tipeDiskon: string;
  nilaiDiskon: number;
  tanggalMulai: string | null;
  tanggalSelesai: string | null;
  kuotaPemakaian: number | null;
  jumlahTerpakai: number;
  status: string;
  campaignTerkaitId: string | null;
  campaignTerkaitNama: string | null;
  labelSekolah: string | null;
  berlakuSemuaKelas: boolean;
  kelasIds: string[];
  kelasNama: string[];
}

export interface CampaignOption {
  id: string;
  namaCampaign: string;
}

export interface KelasOption {
  id: string;
  nama: string;
}

type NamaCampaignOnly = { nama_campaign: string };

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type NamaKelasOnly = { nama: string };

interface KodePromoKelasRow {
  kelas_id: string;
  kelas: NamaKelasOnly | NamaKelasOnly[] | null;
}

interface KodePromoRow {
  id: string;
  kode: string;
  tipe_diskon: string;
  nilai_diskon: number;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  kuota_pemakaian: number | null;
  jumlah_terpakai: number;
  status: string;
  campaign_terkait_id: string | null;
  campaign_terkait: NamaCampaignOnly | NamaCampaignOnly[] | null;
  label_sekolah: string | null;
  berlaku_semua_kelas: boolean;
  kode_promo_kelas: KodePromoKelasRow[] | null;
}

/** List semua kode promo — dipakai halaman Kode Promo. */
export async function getKodePromoList(): Promise<KodePromoListItem[]> {
  const { data, error } = await supabaseServer
    .from("kode_promo")
    .select(
      `id, kode, tipe_diskon, nilai_diskon, tanggal_mulai, tanggal_selesai, kuota_pemakaian, jumlah_terpakai, status, campaign_terkait_id, label_sekolah, berlaku_semua_kelas,
       campaign_terkait:campaign_terkait_id(nama_campaign),
       kode_promo_kelas(kelas_id, kelas:kelas_id(nama))`,
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getKodePromoList] query failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as KodePromoRow[]).map((row) => {
    const campaign = firstOrNull(row.campaign_terkait);
    const kelasRows = row.kode_promo_kelas ?? [];
    return {
      id: row.id,
      kode: row.kode,
      tipeDiskon: row.tipe_diskon,
      nilaiDiskon: Number(row.nilai_diskon),
      tanggalMulai: row.tanggal_mulai,
      tanggalSelesai: row.tanggal_selesai,
      kuotaPemakaian: row.kuota_pemakaian,
      jumlahTerpakai: row.jumlah_terpakai,
      status: row.status,
      campaignTerkaitId: row.campaign_terkait_id,
      campaignTerkaitNama: campaign?.nama_campaign ?? null,
      labelSekolah: row.label_sekolah,
      berlakuSemuaKelas: row.berlaku_semua_kelas,
      kelasIds: kelasRows.map((k) => k.kelas_id),
      kelasNama: kelasRows.map((k) => firstOrNull(k.kelas)?.nama).filter((nama): nama is string => Boolean(nama)),
    };
  });
}

/** Opsi dropdown Campaign Terkait — semua campaign iklan yang sudah ada. */
export async function getCampaignOptions(): Promise<CampaignOption[]> {
  const { data, error } = await supabaseServer
    .from("iklan_campaign")
    .select("id, nama_campaign")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getCampaignOptions] query failed:", error);
    return [];
  }
  return (data ?? []).map((row) => ({ id: row.id as string, namaCampaign: row.nama_campaign as string }));
}

/** Opsi checklist Kelas — dipakai scoping "Berlaku untuk Semua Kelas" (kode_promo_kelas). */
export async function getKelasOptions(): Promise<KelasOption[]> {
  const { data, error } = await supabaseServer.from("kelas").select("id, nama").order("nama", { ascending: true });

  if (error) {
    console.error("[getKelasOptions] query failed:", error);
    return [];
  }
  return (data ?? []).map((row) => ({ id: row.id as string, nama: row.nama as string }));
}
