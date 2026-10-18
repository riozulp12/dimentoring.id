"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Modal from "@/components/ui/Modal";
import SelectField from "@/components/ui/SelectField";
import { LEAD_CATATAN_MAX, LEAD_STATUS, LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/shared/leadConsent";
import type { LeadItem } from "@/lib/admin/leads";

/**
 * Halaman Admin "Leads" (PRD 7.4.6, BR-38): daftar lead terbaru, filter
 * status/sumber/utm_campaign, cari nomor/nama, ubah status & catatan,
 * buka WhatsApp, export CSV. Semua filter diproses server
 * (GET /api/admin/leads); export memakai filter yang sama.
 */

const TANPA_CAMPAIGN = "__tanpa__"; // sama dengan lib/admin/leads.ts

const SUMBER_LABEL: Record<string, string> = { assessment_snbp: "Assessment SNBP" };

const STATUS_BADGE: Record<LeadStatus, string> = {
  baru: "bg-[#EEF0FF] text-[#081EEA]",
  dihubungi: "bg-[#FFF5BA] text-[#988101]",
  daftar: "bg-[#E8F8EE] text-[#137A3A]",
  tidak_tertarik: "bg-gray-100 text-[#7E7C7C]",
};

function formatTanggalWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 6281234567890 -> +62 812-3456-7890 (tampilan saja). */
function formatNoWa(noWa: string) {
  const lokal = noWa.slice(2);
  return `+62 ${lokal.slice(0, 3)}-${lokal.slice(3, 7)}-${lokal.slice(7)}`;
}

interface Filter {
  status: string;
  sumber: string;
  campaign: string;
  q: string;
}

function filterKeQuery(filter: Filter): string {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.sumber) params.set("sumber", filter.sumber);
  if (filter.campaign) params.set("utm_campaign", filter.campaign);
  if (filter.q.trim()) params.set("q", filter.q.trim());
  return params.toString();
}

export default function LeadsClient({
  initialLeads,
  initialCampaignOptions,
  loadError,
}: {
  initialLeads: LeadItem[];
  initialCampaignOptions: string[];
  loadError: boolean;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [campaignOptions, setCampaignOptions] = useState(initialCampaignOptions);
  const [filter, setFilter] = useState<Filter>({ status: "", sumber: "", campaign: "", q: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(loadError ? "Gagal memuat leads. Muat ulang halaman." : null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [catatanTarget, setCatatanTarget] = useState<LeadItem | null>(null);
  const [catatanDraft, setCatatanDraft] = useState("");
  const isFirstRender = useRef(true);

  const query = useMemo(() => filterKeQuery(filter), [filter]);

  const muat = useCallback(async (qs: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/leads${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error ?? "Gagal memuat leads.");
        return;
      }
      setLeads(json.leads as LeadItem[]);
      setCampaignOptions(json.campaignOptions as string[]);
    } catch {
      setError("Gagal memuat leads. Periksa koneksi lalu coba lagi.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => void muat(query), 300);
    return () => clearTimeout(timer);
  }, [query, muat]);

  async function simpan(lead: LeadItem, perubahan: { status?: LeadStatus; catatan?: string | null }) {
    setSavingId(lead.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(perubahan),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error ?? "Gagal menyimpan perubahan.");
        return false;
      }
      setLeads((prev) => prev.map((item) => (item.id === lead.id ? (json.lead as LeadItem) : item)));
      return true;
    } catch {
      setError("Gagal menyimpan perubahan. Periksa koneksi lalu coba lagi.");
      return false;
    } finally {
      setSavingId(null);
    }
  }

  const statusOptions = [
    { label: "Semua Status", value: "" },
    ...LEAD_STATUS.map((s) => ({ label: LEAD_STATUS_LABEL[s], value: s })),
  ];
  const sumberOptions = [
    { label: "Semua Sumber", value: "" },
    ...Object.entries(SUMBER_LABEL).map(([value, label]) => ({ label, value })),
  ];
  const campaignSelectOptions = [
    { label: "Semua Campaign", value: "" },
    { label: "(Tanpa campaign)", value: TANPA_CAMPAIGN },
    ...campaignOptions.map((c) => ({ label: c, value: c })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex-1 lg:max-w-sm">
          <InputField
            type="text"
            size="md"
            placeholder="Cari nomor WA atau nama..."
            value={filter.q}
            onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex-1">
          <SelectField
            size="md"
            options={statusOptions}
            value={filter.status}
            onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
          />
          <SelectField
            size="md"
            options={sumberOptions}
            value={filter.sumber}
            onChange={(e) => setFilter((f) => ({ ...f, sumber: e.target.value }))}
          />
          <SelectField
            size="md"
            options={campaignSelectOptions}
            value={filter.campaign}
            onChange={(e) => setFilter((f) => ({ ...f, campaign: e.target.value }))}
          />
        </div>
        <a
          href={`/api/admin/leads/export${query ? `?${query}` : ""}`}
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-[#081EEA] px-5 py-2.5 text-sm font-medium text-[#081EEA] hover:bg-[#F9FAFF]"
        >
          Export CSV
        </a>
      </div>

      <p className="text-sm text-[#7E7C7C]">
        {isLoading ? "Memuat..." : `${leads.length} lead (maks. 500 terbaru ditampilkan; export memuat semua yang cocok).`}
      </p>

      {error ? (
        <p role="alert" className="text-sm text-[#E70A0A]">
          {error}
        </p>
      ) : null}

      {leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">Belum ada lead yang cocok.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E3E3E3] text-[#7E7C7C]">
                <th className="px-4 py-3 font-medium">Masuk</th>
                <th className="px-4 py-3 font-medium">Nomor WA</th>
                <th className="px-4 py-3 font-medium">Nama</th>
                <th className="px-4 py-3 font-medium">Sumber</th>
                <th className="px-4 py-3 font-medium">UTM</th>
                <th className="px-4 py-3 font-medium">Submit</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-[#E3E3E3] align-top last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 text-[#7E7C7C]">{formatTanggalWaktu(lead.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      <span className="font-medium text-black">{formatNoWa(lead.noWa)}</span>
                      <a
                        href={`https://wa.me/${lead.noWa}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[#137A3A] hover:underline"
                      >
                        Buka WhatsApp ↗
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-black">{lead.nama ?? <span className="text-[#7E7C7C]">-</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-black">{SUMBER_LABEL[lead.sumber] ?? lead.sumber}</td>
                  <td className="px-4 py-3 text-xs text-[#7E7C7C]">
                    {lead.utmSource || lead.utmCampaign ? (
                      <div className="flex flex-col gap-0.5">
                        <span>source: {lead.utmSource ?? "-"}</span>
                        <span>medium: {lead.utmMedium ?? "-"}</span>
                        <span className="font-medium text-black">campaign: {lead.utmCampaign ?? "-"}</span>
                      </div>
                    ) : (
                      "Organic/Tidak diketahui"
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-black">{lead.jumlahSubmit}</td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Status lead ${formatNoWa(lead.noWa)}`}
                      value={lead.status}
                      disabled={savingId === lead.id}
                      onChange={(e) => void simpan(lead, { status: e.target.value as LeadStatus })}
                      className={`rounded-full border-0 px-3 py-1 text-xs font-medium ${STATUS_BADGE[lead.status]}`}
                    >
                      {LEAD_STATUS.map((s) => (
                        <option key={s} value={s}>
                          {LEAD_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="max-w-[260px] px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCatatanTarget(lead);
                        setCatatanDraft(lead.catatan ?? "");
                      }}
                      className="text-left text-sm text-black hover:text-[#081EEA]"
                    >
                      {lead.catatan ? (
                        <span className="line-clamp-2 whitespace-pre-line">{lead.catatan}</span>
                      ) : (
                        <span className="text-[#081EEA]">+ Tambah catatan</span>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={catatanTarget !== null} onClose={() => setCatatanTarget(null)}>
        {catatanTarget ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await simpan(catatanTarget, { catatan: catatanDraft });
              if (ok) setCatatanTarget(null);
            }}
          >
            <h2 className="text-lg font-semibold text-black">Catatan — {formatNoWa(catatanTarget.noWa)}</h2>
            <textarea
              value={catatanDraft}
              onChange={(e) => setCatatanDraft(e.target.value)}
              maxLength={LEAD_CATATAN_MAX}
              rows={6}
              className="w-full rounded-[16px] border border-[#CAC9C9] px-4 py-3 text-sm text-black focus:border-[#081EEA] focus:outline-none"
              placeholder="Mis. sudah dihubungi 20/10, tertarik kelas SNBT"
            />
            {error ? <p className="text-sm text-[#E70A0A]">{error}</p> : null}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setCatatanTarget(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={savingId === catatanTarget.id}>
                {savingId === catatanTarget.id ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
