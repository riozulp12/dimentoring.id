"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Modal from "@/components/ui/Modal";
import type {
  BulanTotal,
  CampaignListItem,
  MarketingStats,
  PendaftaranPerSumber,
  PengeluaranListItem,
} from "@/lib/admin/getAnalyticsData";

/**
 * Analytics (Admin) — PRD Bagian 13. Stat card + chart breakdown sumber
 * traffic (utm_source) + CRUD manual Campaign Iklan (leads/CPL dihitung dari
 * users.utm_campaign yang cocok persis ke utm_campaign_tag) + chart Sales
 * (enrollments lunas) + section Pengeluaran (pengeluaran_bisnis + budget
 * iklan_campaign).
 */

const PLATFORM_OPTIONS = [
  { label: "Meta", value: "meta" },
  { label: "Google", value: "google" },
  { label: "TikTok", value: "tiktok" },
  { label: "Lainnya", value: "lainnya" },
];

const PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  lainnya: "Lainnya",
};

const KATEGORI_PENGELUARAN_OPTIONS = [
  { label: "Operasional", value: "operasional" },
  { label: "Gaji & Honor", value: "gaji_honor" },
  { label: "Lainnya", value: "lainnya" },
];

const KATEGORI_PENGELUARAN_LABEL: Record<string, string> = {
  operasional: "Operasional",
  gaji_honor: "Gaji & Honor",
  lainnya: "Lainnya",
};

function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

/** Versi ringkas buat tick sumbu chart, mis. Rp1.5Jt, supaya tidak overflow di layar sempit. */
function formatRupiahCompact(value: number): string {
  if (value >= 1_000_000_000) return `Rp${(value / 1_000_000_000).toFixed(1)}M`;
  if (value >= 1_000_000) return `Rp${(value / 1_000_000).toFixed(1)}Jt`;
  if (value >= 1_000) return `Rp${(value / 1_000).toFixed(0)}Rb`;
  return `Rp${value}`;
}

function formatTanggal(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function formatPeriode(mulai: string | null, selesai: string | null): string {
  if (!mulai && !selesai) return "Periode belum diatur";
  if (mulai && selesai) return `${formatTanggal(mulai)} - ${formatTanggal(selesai)}`;
  return formatTanggal((mulai ?? selesai) as string);
}

/** Sumber traffic bisa panjang (mis. "Organic/Tidak Diketahui") — dipotong di tick YAxis, nama penuh tetap muncul di Tooltip. */
function truncateLabel(value: string, max = 14): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-5 ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <Card className="items-center justify-center gap-3 text-center sm:gap-4">
      <p className="whitespace-nowrap text-base text-[#7E7C7C]">{label}</p>
      <p className="flex items-end gap-2 text-xl font-semibold tracking-[-0.02em] text-black">
        {value.toLocaleString("id-ID")}
        <span className="text-base font-normal">{unit}</span>
      </p>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="text-base text-[#7E7C7C]">{text}</p>
    </div>
  );
}

interface CampaignFormState {
  namaCampaign: string;
  platform: string;
  budget: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  utmCampaignTag: string;
  catatan: string;
}

const EMPTY_CAMPAIGN_FORM: CampaignFormState = {
  namaCampaign: "",
  platform: "",
  budget: "",
  tanggalMulai: "",
  tanggalSelesai: "",
  utmCampaignTag: "",
  catatan: "",
};

interface PengeluaranFormState {
  kategori: string;
  deskripsi: string;
  jumlah: string;
  tanggal: string;
}

const EMPTY_PENGELUARAN_FORM: PengeluaranFormState = {
  kategori: "",
  deskripsi: "",
  jumlah: "",
  tanggal: "",
};

export default function AnalyticsClient({
  stats,
  perSumber,
  salesPerBulan,
  pengeluaranPerBulan,
  initialCampaigns,
  initialPengeluaran,
}: {
  stats: MarketingStats;
  perSumber: PendaftaranPerSumber[];
  salesPerBulan: BulanTotal[];
  pengeluaranPerBulan: BulanTotal[];
  initialCampaigns: CampaignListItem[];
  initialPengeluaran: PengeluaranListItem[];
}) {
  const router = useRouter();

  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(EMPTY_CAMPAIGN_FORM);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // initialPengeluaran dari Server Component cuma dipakai React sebagai initial
  // state saat mount pertama — setelah Tambah Pengeluaran memicu router.refresh()
  // untuk ambil chart & list terbaru dari server, useState TIDAK otomatis
  // re-sync ke prop baru, jadi disinkronkan manual lewat perbandingan ini.
  const [pengeluaranList, setPengeluaranList] = useState(initialPengeluaran);
  const [prevInitialPengeluaran, setPrevInitialPengeluaran] = useState(initialPengeluaran);
  if (initialPengeluaran !== prevInitialPengeluaran) {
    setPrevInitialPengeluaran(initialPengeluaran);
    setPengeluaranList(initialPengeluaran);
  }

  const [pengeluaranFormOpen, setPengeluaranFormOpen] = useState(false);
  const [pengeluaranForm, setPengeluaranForm] = useState<PengeluaranFormState>(EMPTY_PENGELUARAN_FORM);
  const [pengeluaranError, setPengeluaranError] = useState<string | null>(null);
  const [isPengeluaranSubmitting, setIsPengeluaranSubmitting] = useState(false);

  function openForm() {
    setForm(EMPTY_CAMPAIGN_FORM);
    setSubmitError(null);
    setFormOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/analytics/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namaCampaign: form.namaCampaign,
          platform: form.platform,
          budget: form.budget || undefined,
          tanggalMulai: form.tanggalMulai || undefined,
          tanggalSelesai: form.tanggalSelesai || undefined,
          utmCampaignTag: form.utmCampaignTag || undefined,
          catatan: form.catatan || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal menyimpan campaign. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      setCampaigns((prev) => [
        {
          id: json.id as string,
          namaCampaign: form.namaCampaign,
          platform: form.platform,
          budget: form.budget ? Number(form.budget) : null,
          tanggalMulai: form.tanggalMulai || null,
          tanggalSelesai: form.tanggalSelesai || null,
          utmCampaignTag: form.utmCampaignTag || null,
          catatan: form.catatan || null,
          leads: 0,
          cpl: null,
        },
        ...prev,
      ]);
      setFormOpen(false);
      setIsSubmitting(false);
      // Budget campaign ikut kepakai di chart "Pengeluaran per Bulan", jadi
      // sekalian refresh supaya chart itu ikut update tanpa perlu reload manual.
      router.refresh();
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  function openPengeluaranForm() {
    setPengeluaranForm(EMPTY_PENGELUARAN_FORM);
    setPengeluaranError(null);
    setPengeluaranFormOpen(true);
  }

  async function handlePengeluaranSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPengeluaranError(null);
    setIsPengeluaranSubmitting(true);

    try {
      const response = await fetch("/api/analytics/pengeluaran", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kategori: pengeluaranForm.kategori,
          deskripsi: pengeluaranForm.deskripsi,
          jumlah: pengeluaranForm.jumlah,
          tanggal: pengeluaranForm.tanggal,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setPengeluaranError(json.error ?? "Gagal menyimpan pengeluaran. Coba lagi nanti.");
        setIsPengeluaranSubmitting(false);
        return;
      }

      setPengeluaranFormOpen(false);
      setIsPengeluaranSubmitting(false);
      // List & chart Pengeluaran dihitung server-side — refresh supaya data baru
      // langsung kepakai di list maupun chart "Pengeluaran per Bulan".
      router.refresh();
    } catch {
      setPengeluaranError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsPengeluaranSubmitting(false);
    }
  }

  // salesPerBulan & pengeluaranPerBulan sama-sama dihasilkan dari fungsi bulan
  // 6-terakhir yang sama di server (urutan & panjang array selalu identik),
  // jadi aman digabung per index tanpa perlu re-match lewat key `bulan`.
  const salesVsPengeluaran = salesPerBulan.map((s, index) => ({
    label: s.label,
    sales: s.total,
    pengeluaran: pengeluaranPerBulan[index]?.total ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6 sm:gap-8 lg:gap-10">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4 lg:gap-8">
        <StatCard label="Total Pendaftaran" value={stats.totalPendaftaran} unit="Akun" />
        <StatCard label="Bulan Ini" value={stats.bulanIni} unit="Akun" />
        <StatCard label="Dari Referral" value={stats.dariReferral} unit="Akun" />
        <StatCard label="Dari Iklan" value={stats.dariIklan} unit="Akun" />
      </div>

      <Card className="gap-4 sm:gap-5">
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Pendaftaran per Sumber</h3>
        {perSumber.length === 0 ? (
          <EmptyState text="Belum ada data pendaftaran." />
        ) : (
          <div className="w-full overflow-x-auto">
            <ResponsiveContainer width="100%" height={Math.max(200, perSumber.length * 44)} minWidth={280}>
              <BarChart data={perSumber} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="sumber"
                  width={110}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value: string) => truncateLabel(value)}
                />
                <Tooltip formatter={(value) => [`${Number(value).toLocaleString("id-ID")} akun`, "Jumlah"]} />

                <Bar dataKey="jumlah" fill="#081EEA" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="gap-4 sm:gap-5">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Sales (Pendapatan per Bulan)</h3>
          <p className="mt-1 text-sm text-[#7E7C7C]">Data akan mulai terisi begitu sistem Payment aktif.</p>
        </div>
        <div className="w-full overflow-x-auto">
          <ResponsiveContainer width="100%" height={260} minWidth={280}>
            <LineChart data={salesPerBulan} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={56} tickFormatter={formatRupiahCompact} />
              <Tooltip formatter={(value) => [formatRupiah(Number(value)), "Pendapatan"]} />
              <Line type="monotone" dataKey="total" name="Pendapatan" stroke="#081EEA" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="gap-4 sm:gap-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Pengeluaran</h3>
          <Button type="button" variant="primary" size="sm" onClick={openPengeluaranForm}>
            + Tambah Pengeluaran
          </Button>
        </div>

        {pengeluaranList.length === 0 ? (
          <EmptyState text="Belum ada pengeluaran yang dicatat. Klik &quot;Tambah Pengeluaran&quot; untuk mulai." />
        ) : (
          <div className="flex flex-col">
            {pengeluaranList.map((p, index) => (
              <div key={p.id}>
                {index > 0 ? <div className="h-px w-full bg-[#E3E3E3]" /> : null}
                <div className="flex items-center justify-between gap-3 py-2.5 sm:py-3">
                  <div className="min-w-0">
                    <p className="truncate text-base text-black">{p.deskripsi}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-sm text-[#7E7C7C]">
                      <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
                        {KATEGORI_PENGELUARAN_LABEL[p.kategori] ?? p.kategori}
                      </span>
                      {formatTanggal(p.tanggal)}
                    </p>
                  </div>
                  <p className="shrink-0 text-base font-medium text-black">{formatRupiah(p.jumlah)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="gap-4 sm:gap-5">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Pengeluaran per Bulan</h3>
          <p className="mt-1 text-sm text-[#7E7C7C]">Gabungan pengeluaran manual + budget Campaign Iklan.</p>
        </div>
        <div className="w-full overflow-x-auto">
          <ResponsiveContainer width="100%" height={260} minWidth={280}>
            <BarChart data={pengeluaranPerBulan} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={56} tickFormatter={formatRupiahCompact} />
              <Tooltip formatter={(value) => [formatRupiah(Number(value)), "Pengeluaran"]} />
              <Bar dataKey="total" name="Pengeluaran" fill="#E70A0A" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="gap-4 sm:gap-5">
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Sales vs Pengeluaran</h3>
        <div className="w-full overflow-x-auto">
          <ResponsiveContainer width="100%" height={280} minWidth={280}>
            <BarChart data={salesVsPengeluaran} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={56} tickFormatter={formatRupiahCompact} />
              <Tooltip formatter={(value) => formatRupiah(Number(value))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="sales" name="Sales" fill="#081EEA" radius={[6, 6, 0, 0]} />
              <Bar dataKey="pengeluaran" name="Pengeluaran" fill="#E70A0A" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="gap-4 sm:gap-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Campaign Iklan</h3>
          <Button type="button" variant="primary" size="sm" onClick={openForm}>
            + Tambah Campaign
          </Button>
        </div>

        {campaigns.length === 0 ? (
          <EmptyState text="Belum ada campaign iklan yang dicatat. Klik &quot;Tambah Campaign&quot; untuk mulai." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 rounded-[16px] border border-[#E3E3E3] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-base font-semibold text-black">{c.namaCampaign}</p>
                  <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
                    {PLATFORM_LABEL[c.platform] ?? c.platform}
                  </span>
                </div>
                <p className="text-sm text-[#7E7C7C]">{formatPeriode(c.tanggalMulai, c.tanggalSelesai)}</p>
                <p className="text-sm text-black">Budget: {c.budget !== null ? formatRupiah(c.budget) : "Belum diatur"}</p>
                <div className="mt-1 flex items-center justify-between gap-3 border-t border-[#E3E3E3] pt-2">
                  <p className="text-sm text-[#7E7C7C]">
                    Leads: <span className="font-medium text-black">{c.leads}</span>
                  </p>
                  {c.cpl !== null ? (
                    <p className="text-sm text-[#7E7C7C]">
                      CPL: <span className="font-medium text-black">{formatRupiah(c.cpl)}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={formOpen} onClose={() => setFormOpen(false)}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-black">Tambah Campaign</h2>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Nama Campaign</label>
            <InputField
              type="text"
              size="md"
              required
              value={form.namaCampaign}
              onChange={(e) => setForm((prev) => ({ ...prev, namaCampaign: e.target.value }))}
              placeholder="Mis. Gaspol Agustus"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Platform</label>
            <InputField
              type="dropdown"
              size="md"
              placeholder="Pilih platform"
              required
              value={form.platform}
              onChange={(e) => setForm((prev) => ({ ...prev, platform: e.target.value }))}
              options={PLATFORM_OPTIONS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-black">Tanggal Mulai</label>
              <input
                type="date"
                value={form.tanggalMulai}
                onChange={(e) => setForm((prev) => ({ ...prev, tanggalMulai: e.target.value }))}
                className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-3 py-2.5 text-sm text-black outline-none transition-colors hover:border-[#081EEA] focus:border-black"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-black">Tanggal Selesai</label>
              <input
                type="date"
                value={form.tanggalSelesai}
                onChange={(e) => setForm((prev) => ({ ...prev, tanggalSelesai: e.target.value }))}
                className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-3 py-2.5 text-sm text-black outline-none transition-colors hover:border-[#081EEA] focus:border-black"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Budget (Rp, opsional)</label>
            <InputField
              type="text"
              size="md"
              inputMode="numeric"
              value={form.budget}
              onChange={(e) => setForm((prev) => ({ ...prev, budget: e.target.value.replace(/[^0-9]/g, "") }))}
              placeholder="Mis. 2000000"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">UTM Campaign Tag</label>
            <InputField
              type="text"
              size="md"
              value={form.utmCampaignTag}
              onChange={(e) => setForm((prev) => ({ ...prev, utmCampaignTag: e.target.value }))}
              placeholder="Mis. gaspol-agustus"
            />
            <p className="text-xs text-[#7E7C7C]">
              Wajib SAMA PERSIS (huruf besar/kecil & spasi berpengaruh) dengan <code>utm_campaign</code> yang
              dipasang di link iklan sungguhan — kalau beda dikit, jumlah Leads campaign ini tidak akan terhitung
              benar.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Catatan (opsional)</label>
            <textarea
              value={form.catatan}
              onChange={(e) => setForm((prev) => ({ ...prev, catatan: e.target.value }))}
              rows={3}
              placeholder="Catatan bebas soal campaign ini"
              className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors placeholder:text-[#AFAFAF] focus:border-black"
            />
          </div>

          {submitError ? <p className="text-sm text-[#E70A0A]">{submitError}</p> : null}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" size="md" className="flex-1" onClick={() => setFormOpen(false)} disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="submit" variant="primary" size="md" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Tambah Campaign"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={pengeluaranFormOpen} onClose={() => setPengeluaranFormOpen(false)}>
        <form onSubmit={handlePengeluaranSubmit} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-black">Tambah Pengeluaran</h2>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Kategori</label>
            <InputField
              type="dropdown"
              size="md"
              placeholder="Pilih kategori"
              required
              value={pengeluaranForm.kategori}
              onChange={(e) => setPengeluaranForm((prev) => ({ ...prev, kategori: e.target.value }))}
              options={KATEGORI_PENGELUARAN_OPTIONS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Deskripsi</label>
            <InputField
              type="text"
              size="md"
              required
              value={pengeluaranForm.deskripsi}
              onChange={(e) => setPengeluaranForm((prev) => ({ ...prev, deskripsi: e.target.value }))}
              placeholder="Mis. Sewa domain & hosting Agustus"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Jumlah (Rp)</label>
            <InputField
              type="text"
              size="md"
              required
              inputMode="numeric"
              value={pengeluaranForm.jumlah}
              onChange={(e) => setPengeluaranForm((prev) => ({ ...prev, jumlah: e.target.value.replace(/[^0-9]/g, "") }))}
              placeholder="Mis. 500000"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Tanggal</label>
            <input
              type="date"
              required
              value={pengeluaranForm.tanggal}
              onChange={(e) => setPengeluaranForm((prev) => ({ ...prev, tanggal: e.target.value }))}
              className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-3 py-2.5 text-sm text-black outline-none transition-colors hover:border-[#081EEA] focus:border-black"
            />
          </div>

          {pengeluaranError ? <p className="text-sm text-[#E70A0A]">{pengeluaranError}</p> : null}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={() => setPengeluaranFormOpen(false)}
              disabled={isPengeluaranSubmitting}
            >
              Batal
            </Button>
            <Button type="submit" variant="primary" size="md" className="flex-1" disabled={isPengeluaranSubmitting}>
              {isPengeluaranSubmitting ? "Menyimpan..." : "Tambah Pengeluaran"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
