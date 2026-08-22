"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Modal from "@/components/ui/Modal";

export type Jalur = "snbp" | "snbt" | "mandiri";

export interface PtnJurusanCheckOption {
  id: string;
  namaUniversitas: string;
  namaJurusan: string;
  jenjang: string;
  jalur: Jalur;
}

interface KeketatanCheckResult {
  namaUniversitas: string;
  namaJurusan: string;
  jenjang: string;
  keketatanScore: number;
  keketatanLabel: string;
  tahunData: number;
}

const JALUR_OPTIONS: { value: Jalur; label: string }[] = [
  { value: "snbp", label: "SNBP" },
  { value: "snbt", label: "SNBT" },
  { value: "mandiri", label: "Jalur Mandiri" },
];

function formatScore(value: number): string {
  return value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Sama seperti pola warna di Hasil Assessment (PRD 7.4.3): merah=ketat, hijau=sedang, biru=longgar. */
function keketatanColorClass(label: string): string {
  if (label.includes("Ketat")) return "text-[#E70A0A]";
  if (label.includes("Sedang")) return "text-[#0CBA00]";
  if (label.includes("Longgar")) return "text-[#006ABD]";
  return "text-black";
}

export default function Prediction({ ptnJurusanOptions }: { ptnJurusanOptions: PtnJurusanCheckOption[] }) {
  const [jalur, setJalur] = useState<Jalur | null>(null);
  const [universitas, setUniversitas] = useState("");
  const [ptnJurusanId, setPtnJurusanId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KeketatanCheckResult | null>(null);

  const universitasOptions = useMemo(() => {
    if (!jalur) return [];
    const names = new Set(
      ptnJurusanOptions.filter((row) => row.jalur === jalur).map((row) => row.namaUniversitas),
    );
    return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ label: name, value: name }));
  }, [ptnJurusanOptions, jalur]);

  const jurusanOptions = useMemo(() => {
    if (!jalur || !universitas) return [];
    return ptnJurusanOptions
      .filter((row) => row.jalur === jalur && row.namaUniversitas === universitas)
      .map((row) => ({ label: `${row.jenjang} ${row.namaJurusan}`, value: row.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [ptnJurusanOptions, jalur, universitas]);

  function handleJalurClick(next: Jalur) {
    setJalur(next);
    setUniversitas("");
    setPtnJurusanId("");
    setError(null);
  }

  function handleUniversitasChange(value: string) {
    setUniversitas(value);
    setPtnJurusanId("");
    setError(null);
  }

  async function handleCekKeketatan() {
    if (!ptnJurusanId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/keketatan-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ptnJurusanId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Gagal menghitung Keketatan. Coba lagi.");
        return;
      }
      setResult(json as KeketatanCheckResult);
    } catch {
      setError("Gagal menghubungi server. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex w-full flex-col items-center gap-8 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:gap-12 lg:px-[120px] lg:py-16">
      <div className="flex flex-col items-center gap-3 text-center sm:gap-5">
        <h4 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl">
          Lihat Keketatan Jurusan dan PTN Pilihanmu
        </h4>
        <p className="text-lg leading-[1.5] tracking-[-0.36px] text-[#7E7C7C]">
          Keketatan ini dihitung berdasarkan data kuota dan jumlah peminat tahun sebelumnya
        </p>
      </div>

      <div className="flex w-full flex-col gap-6 lg:gap-8">
        <div className="flex flex-col gap-3 sm:gap-5">
          <p className="text-lg leading-[1.5] font-medium tracking-[-0.36px] text-black">Pilih Jalur</p>
          <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:gap-6">
            {JALUR_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={jalur === option.value ? "primary" : "secondary"}
                size="md"
                className="w-full flex-1 sm:w-[200px] sm:flex-none"
                onClick={() => handleJalurClick(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-6 rounded-[20px] border border-[#CAC9C9] bg-white p-6 shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)] sm:rounded-[24px] sm:p-10 lg:gap-8 lg:rounded-[32px] lg:p-16">
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:gap-8 lg:gap-16">
            <InputField
              type="dropdown"
              placeholder={jalur ? "Pilih Universitas" : "Pilih Jalur dulu"}
              options={universitasOptions}
              value={universitas}
              disabled={!jalur}
              onChange={(e) => handleUniversitasChange(e.target.value)}
              className="flex-1 shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)]"
            />
            <InputField
              type="dropdown"
              placeholder={universitas ? "Pilih Jurusan" : "Pilih Universitas dulu"}
              options={jurusanOptions}
              value={ptnJurusanId}
              disabled={!universitas}
              onChange={(e) => setPtnJurusanId(e.target.value)}
              className="flex-1 shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)]"
            />
          </div>

          {jalur && universitasOptions.length === 0 ? (
            <p className="text-sm text-[#7E7C7C]">Belum ada data program studi untuk jalur ini.</p>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            className="w-full sm:w-[300px]"
            disabled={!ptnJurusanId || loading}
            onClick={handleCekKeketatan}
          >
            {loading ? "Menghitung..." : "Cek Keketatan"}
          </Button>

          {error ? <p className="text-sm text-[#E70A0A]">{error}</p> : null}
        </div>
      </div>

      <Modal open={result !== null} onClose={() => setResult(null)}>
        {result ? (
          <div className="flex flex-col gap-5 sm:gap-6">
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="text-lg font-semibold text-black sm:text-xl">
                {result.jenjang} {result.namaJurusan}
              </p>
              <p className="text-base font-medium text-[#081EEA] sm:text-lg">{result.namaUniversitas}</p>
            </div>

            <div className="flex flex-col items-center gap-2 rounded-[16px] bg-[#F9FAFF] px-5 py-4 text-center">
              <p className="text-sm text-[#7E7C7C]">Keketatan</p>
              <p className={`text-2xl font-semibold tracking-[-0.02em] sm:text-3xl ${keketatanColorClass(result.keketatanLabel)}`}>
                {formatScore(result.keketatanScore)}% - {result.keketatanLabel}
              </p>
            </div>

            <p className="text-left text-sm text-[#7E7C7C]">
              Estimasi berdasarkan data tahun {result.tahunData}, bukan jaminan kelulusan.
            </p>

            <Link href="/assessment" className="w-full">
              <Button variant="primary" size="lg" className="w-full !px-[40px] !py-[18px]">
                Cek Peluang Kamu
              </Button>
            </Link>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
