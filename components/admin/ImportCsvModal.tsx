"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";

/**
 * Import Massal data PTN via CSV — PRD Bagian 7.4.2/BR-28 (Admin, Kelola
 * Assessment). Baris yang berhasil langsung masuk DB satu-satu di server
 * (bukan bulk insert) supaya baris gagal tidak menggagalkan baris lain.
 * Setelah selesai, list di-refresh lewat router.refresh() (bukan optimistic
 * update manual) karena jumlah baris yang masuk bisa banyak sekaligus.
 */

type FailCategory = "duplikat" | "provinsi_tidak_ditemukan" | "lainnya";

interface FailedRow {
  row: number;
  reason: string;
  category: FailCategory;
}

interface ImportResult {
  totalRows: number;
  successCount: number;
  failed: FailedRow[];
}

const CATEGORY_LABEL: Record<FailCategory, string> = {
  duplikat: "duplikat",
  provinsi_tidak_ditemukan: "provinsi tidak ditemukan",
  lainnya: "alasan lain",
};

function summarize(result: ImportResult): string {
  const parts = [`${result.successCount} berhasil`];
  const byCategory = new Map<FailCategory, number>();
  for (const row of result.failed) {
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + 1);
  }
  for (const [category, count] of byCategory) {
    parts.push(`${count} gagal karena ${CATEGORY_LABEL[category]}`);
  }
  return parts.join(", ");
}

export default function ImportCsvModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFilesSelected(files: FileList | null) {
    setError(null);
    setResult(null);
    setFile(files?.[0] ?? null);
  }

  async function handleImport() {
    if (!file) return;
    setError(null);
    setIsImporting(true);
    try {
      const csvText = await file.text();
      const response = await fetch("/api/kelola-assessment/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error ?? "Gagal mengimpor file CSV. Coba lagi nanti.");
        setIsImporting(false);
        return;
      }
      setResult({ totalRows: json.totalRows, successCount: json.successCount, failed: json.failed });
      setIsImporting(false);
      if (json.successCount > 0) router.refresh();
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-black">Import dari CSV</h2>
      <p className="text-sm text-[#7E7C7C]">
        Kolom wajib: nama_universitas, nama_jurusan, jenjang, provinsi, kuota_tahun_berjalan,
        jumlah_peminat_tahun_lalu, jalur, rumpun (saintek/soshum), tahun_data. Opsional: sumber_data,
        rata_rata_nilai_diterima.
      </p>

      <InputField type="file" size="md" accept=".csv,text/csv" onFilesSelected={handleFilesSelected} />
      {file ? <p className="text-sm text-black">File dipilih: {file.name}</p> : null}

      {error ? <p className="text-sm text-[#E70A0A]">{error}</p> : null}

      {result ? (
        <div className="flex flex-col gap-2 rounded-[16px] bg-[#F9FAFF] px-4 py-3">
          <p className="text-sm font-medium text-black">{summarize(result)}</p>
          {result.failed.length > 0 ? (
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs text-[#7E7C7C]">
              {result.failed.map((f, idx) => (
                <p key={idx}>
                  Baris {f.row}: {f.reason}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" size="md" className="flex-1" onClick={onClose}>
          {result ? "Tutup" : "Batal"}
        </Button>
        {!result ? (
          <Button
            type="button"
            variant="primary"
            size="md"
            className="flex-1"
            disabled={!file || isImporting}
            onClick={handleImport}
          >
            {isImporting ? "Mengimpor..." : "Import"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
