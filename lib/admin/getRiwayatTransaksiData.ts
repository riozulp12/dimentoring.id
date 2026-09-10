import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer "Riwayat Transaksi" (Admin) — PRD Bagian 8 (BR-19: status
 * pembayaran hanya berubah lewat webhook/admin override) & Bagian 13
 * (payments, kode_promo). Read-only — halaman ini TIDAK punya jalur ubah
 * status, konsisten dengan BR-19 (satu-satunya jalur mengubah payments.status
 * ada di app/api/payment/webhook/route.ts).
 *
 * item_id di payments bersifat polymorphic (kelas.id ATAU tryouts.id, tidak
 * ada FK asli di skema) — jadi JOIN nama kelas dilakukan lewat query terpisah
 * (batch by id), bukan embed relasi PostgREST, sama pola lib/payment/getPaymentStatus.ts.
 */

export interface RiwayatTransaksiItem {
  id: string;
  orderId: string | null;
  gatewayReference: string | null;
  namaSiswa: string;
  emailSiswa: string;
  itemType: string;
  kelasNama: string | null;
  jumlahSebelumDiskon: number;
  jumlah: number;
  metode: string | null;
  status: "menunggu" | "berhasil" | "gagal" | "refunded";
  kodePromo: string | null;
  dibuatPada: string;
  tanggalLunas: string | null;
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type NamaEmailOnly = { nama: string; email: string };
type KodeOnly = { kode: string };

interface PaymentRow {
  id: string;
  order_id: string | null;
  gateway_reference: string | null;
  item_type: string;
  item_id: string;
  jumlah_sebelum_diskon: number;
  jumlah: number;
  metode: string | null;
  status: RiwayatTransaksiItem["status"];
  dibuat_pada: string;
  tanggal_lunas: string | null;
  user: NamaEmailOnly | NamaEmailOnly[] | null;
  kode_promo: KodeOnly | KodeOnly[] | null;
}

/** List semua transaksi, terbaru dulu — dipakai halaman Riwayat Transaksi. */
export async function getRiwayatTransaksiList(): Promise<RiwayatTransaksiItem[]> {
  const { data, error } = await supabaseServer
    .from("payments")
    .select(
      `id, order_id, gateway_reference, item_type, item_id, jumlah_sebelum_diskon, jumlah, metode, status, dibuat_pada, tanggal_lunas,
       user:user_id(nama, email),
       kode_promo:kode_promo_id(kode)`,
    )
    .order("dibuat_pada", { ascending: false });

  if (error) {
    console.error("[getRiwayatTransaksiList] query payments failed:", error);
    return [];
  }

  const rows = (data ?? []) as unknown as PaymentRow[];

  const kelasIds = Array.from(new Set(rows.filter((row) => row.item_type === "kelas").map((row) => row.item_id)));
  const kelasNamaById = new Map<string, string>();
  if (kelasIds.length > 0) {
    const { data: kelasRows, error: kelasError } = await supabaseServer
      .from("kelas")
      .select("id, nama")
      .in("id", kelasIds);
    if (kelasError) {
      console.error("[getRiwayatTransaksiList] query kelas failed:", kelasError);
    } else {
      for (const kelas of kelasRows ?? []) {
        kelasNamaById.set(kelas.id as string, kelas.nama as string);
      }
    }
  }

  return rows.map((row) => {
    const user = firstOrNull(row.user);
    const kodePromo = firstOrNull(row.kode_promo);
    return {
      id: row.id,
      orderId: row.order_id,
      gatewayReference: row.gateway_reference,
      namaSiswa: user?.nama ?? "(akun terhapus)",
      emailSiswa: user?.email ?? "-",
      itemType: row.item_type,
      kelasNama: row.item_type === "kelas" ? (kelasNamaById.get(row.item_id) ?? null) : null,
      jumlahSebelumDiskon: Number(row.jumlah_sebelum_diskon),
      jumlah: Number(row.jumlah),
      metode: row.metode,
      status: row.status,
      kodePromo: kodePromo?.kode ?? null,
      dibuatPada: row.dibuat_pada,
      tanggalLunas: row.tanggal_lunas,
    };
  });
}
