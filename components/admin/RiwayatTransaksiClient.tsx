"use client";

import { useMemo, useState } from "react";
import InputField from "@/components/ui/InputField";
import SelectField from "@/components/ui/SelectField";
import Modal from "@/components/ui/Modal";
import {
  PAYMENT_STATUS_BADGE_CLASS,
  PAYMENT_STATUS_LABEL,
  formatMetode,
  formatRupiah,
} from "@/lib/shared/paymentLabels";
import type { RiwayatTransaksiItem } from "@/lib/admin/getRiwayatTransaksiData";

/**
 * List + Filter Status + Search Nama Siswa + Detail (Modal, read-only) —
 * "Riwayat Transaksi" (Admin), PRD Bagian 8 & 13 (payments). TIDAK ADA jalur
 * ubah status di sini (BR-19: cuma webhook/admin override lewat log audit
 * terpisah yang boleh mengubah payments.status) — halaman ini murni read-only.
 */

type StatusFilter = "semua" | RiwayatTransaksiItem["status"];

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "Semua Status", value: "semua" },
  { label: "Menunggu", value: "menunggu" },
  { label: "Berhasil", value: "berhasil" },
  { label: "Gagal", value: "gagal" },
  { label: "Refunded", value: "refunded" },
];

const ITEM_TYPE_LABEL: Record<string, string> = {
  kelas: "Kelas",
  tryout: "Tryout",
  lainnya: "Lainnya",
};

function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatTanggalWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: RiwayatTransaksiItem["status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        PAYMENT_STATUS_BADGE_CLASS[status] ?? "bg-gray-100 text-[#7E7C7C]"
      }`}
    >
      {PAYMENT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ItemBelanja({ item }: { item: RiwayatTransaksiItem }) {
  if (item.itemType === "kelas") {
    return <span>{item.kelasNama ?? "(kelas terhapus)"}</span>;
  }
  return <span>{ITEM_TYPE_LABEL[item.itemType] ?? item.itemType}</span>;
}

function JumlahCell({ item }: { item: RiwayatTransaksiItem }) {
  const punyaDiskon = item.jumlahSebelumDiskon !== item.jumlah;
  if (!punyaDiskon) {
    return <span className="whitespace-nowrap text-black">{formatRupiah(item.jumlah)}</span>;
  }
  return (
    <span className="flex flex-col whitespace-nowrap">
      <span className="text-xs text-[#7E7C7C] line-through">{formatRupiah(item.jumlahSebelumDiskon)}</span>
      <span className="text-black">{formatRupiah(item.jumlah)}</span>
    </span>
  );
}

export default function RiwayatTransaksiClient({
  initialTransaksi,
}: {
  initialTransaksi: RiwayatTransaksiItem[];
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("semua");
  const [search, setSearch] = useState("");
  const [detailTarget, setDetailTarget] = useState<RiwayatTransaksiItem | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialTransaksi.filter((item) => {
      const matchStatus = statusFilter === "semua" || item.status === statusFilter;
      const matchSearch = !q || item.namaSiswa.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [initialTransaksi, statusFilter, search]);

  if (initialTransaksi.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
        <p className="text-base text-[#7E7C7C]">Belum ada transaksi tercatat.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="max-w-md flex-1">
          <InputField
            type="text"
            size="md"
            placeholder="Cari nama siswa..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-full sm:w-56">
          <SelectField
            size="md"
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">Tidak ada transaksi yang cocok dengan filter/pencarian.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E3E3E3] text-[#7E7C7C]">
                <th className="px-4 py-3 font-medium">Nama Siswa</th>
                <th className="px-4 py-3 font-medium">Kelas</th>
                <th className="px-4 py-3 font-medium">Jumlah</th>
                <th className="px-4 py-3 font-medium">Kode Promo</th>
                <th className="px-4 py-3 font-medium">Metode Bayar</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setDetailTarget(item)}
                  className="cursor-pointer border-b border-[#E3E3E3] transition-colors last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-black">{item.namaSiswa}</td>
                  <td className="px-4 py-3 text-[#7E7C7C]">
                    <ItemBelanja item={item} />
                  </td>
                  <td className="px-4 py-3">
                    <JumlahCell item={item} />
                  </td>
                  <td className="px-4 py-3">
                    {item.kodePromo ? (
                      <span className="inline-flex items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
                        {item.kodePromo}
                      </span>
                    ) : (
                      <span className="text-[#7E7C7C]">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">{formatMetode(item.metode)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">{formatTanggal(item.dibuatPada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={detailTarget !== null} onClose={() => setDetailTarget(null)}>
        {detailTarget ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-black">{detailTarget.namaSiswa}</h2>
              <StatusBadge status={detailTarget.status} />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[#7E7C7C]">Email</p>
                <p className="break-all text-black">{detailTarget.emailSiswa}</p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Item Dibeli</p>
                <p className="text-black">
                  <ItemBelanja item={detailTarget} />
                </p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Order ID</p>
                <p className="break-all text-black">{detailTarget.orderId ?? "-"}</p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Gateway Reference</p>
                <p className="break-all text-black">{detailTarget.gatewayReference ?? "-"}</p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Metode Bayar</p>
                <p className="text-black">{formatMetode(detailTarget.metode)}</p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Kode Promo</p>
                <p className="text-black">{detailTarget.kodePromo ?? "-"}</p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Tanggal Dibuat</p>
                <p className="text-black">{formatTanggalWaktu(detailTarget.dibuatPada)}</p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Tanggal Lunas</p>
                <p className="text-black">
                  {detailTarget.tanggalLunas ? formatTanggalWaktu(detailTarget.tanggalLunas) : "Belum lunas"}
                </p>
              </div>
              <div className="col-span-2 border-t border-[#E3E3E3] pt-3">
                <p className="mb-1 text-[#7E7C7C]">Breakdown Harga</p>
                <div className="flex items-center justify-between text-black">
                  <span>Harga Awal</span>
                  <span>{formatRupiah(detailTarget.jumlahSebelumDiskon)}</span>
                </div>
                {detailTarget.jumlahSebelumDiskon !== detailTarget.jumlah ? (
                  <div className="flex items-center justify-between text-[#0CBA00]">
                    <span>Diskon{detailTarget.kodePromo ? ` (${detailTarget.kodePromo})` : ""}</span>
                    <span>-{formatRupiah(detailTarget.jumlahSebelumDiskon - detailTarget.jumlah)}</span>
                  </div>
                ) : null}
                <div className="mt-1 flex items-center justify-between border-t border-[#E3E3E3] pt-1 font-semibold text-black">
                  <span>Total Dibayar</span>
                  <span>{formatRupiah(detailTarget.jumlah)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
