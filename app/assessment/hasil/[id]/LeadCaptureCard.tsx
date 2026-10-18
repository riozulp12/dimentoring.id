"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Mascot from "@/components/ui/Mascot";
import { LEAD_CONSENT_TEXT, LEAD_NAMA_MAX } from "@/lib/shared/leadConsent";
import { normalisasiNoWa } from "@/lib/shared/noWa";

/**
 * Kartu Lead Capture di halaman hasil Assessment (PRD 7.4.6, BR-38).
 * Hasil Assessment TIDAK dikunci — kartu ini sepenuhnya opsional.
 * Checkbox persetujuan sengaja tidak tercentang dari awal.
 */
export default function LeadCaptureCard({
  assessmentId,
  sudahTerkirim,
}: {
  assessmentId: string;
  sudahTerkirim: boolean;
}) {
  const [noWa, setNoWa] = useState("");
  const [nama, setNama] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(
    sudahTerkirim ? "Nomor WhatsApp kamu sudah kami terima. Tim Dimentoring akan menghubungi kamu." : null,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!normalisasiNoWa(noWa)) {
      setError("Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.");
      return;
    }
    if (!consent) {
      setError("Centang persetujuan dulu supaya kami boleh menghubungi kamu lewat WhatsApp.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noWa, nama: nama.trim() || null, consent, assessmentId, website }),
      });
      const json = (await response.json().catch(() => null)) as
        | { success: boolean; error?: string; message?: string }
        | null;
      if (!response.ok || !json?.success) {
        setError(json?.error ?? "Gagal mengirim. Coba lagi nanti.");
        return;
      }
      setSukses(json.message ?? "Terima kasih! Tim Dimentoring akan menghubungi kamu lewat WhatsApp.");
    } catch {
      setError("Gagal mengirim. Periksa koneksi internet kamu lalu coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="relative flex w-full flex-col gap-5 rounded-[24px] border border-[#081EEA]/30 bg-[#F9FAFF] px-5 py-6 sm:gap-6 sm:rounded-[32px] sm:px-8 sm:py-8">
      <div className="flex items-center gap-4">
        <Mascot variant="Guidance" alt="" className="h-14 w-auto shrink-0 sm:h-16" />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold leading-[1.4] tracking-[-0.02em] text-[#081EEA] sm:text-xl">
            Mau analisis lengkap dan konsultasi jurusan gratis via WhatsApp?
          </h2>
          <p className="text-sm text-[#7E7C7C] sm:text-base">
            Tinggalkan nomormu, tim Dimentoring akan bantu membaca hasil ini bareng kamu.
          </p>
        </div>
      </div>

      {sukses ? (
        <p role="status" className="rounded-[16px] bg-[#E8F8EE] px-4 py-3 text-sm font-medium text-[#137A3A] sm:text-base">
          {sukses}
        </p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-black">Nomor WhatsApp</span>
              <InputField
                type="text"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0812 3456 7890"
                value={noWa}
                onChange={(e) => setNoWa(e.target.value)}
                maxLength={20}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-black">
                Nama panggilan <span className="font-normal text-[#7E7C7C]">(opsional)</span>
              </span>
              <InputField
                type="text"
                autoComplete="nickname"
                placeholder="Nama panggilan"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                maxLength={LEAD_NAMA_MAX}
              />
            </label>
          </div>

          {/* Honeypot: disembunyikan dari manusia & pembaca layar. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Website
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
          </div>

          <label className="flex items-start gap-3 text-sm leading-[1.6] text-black sm:text-base">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-[#081EEA]"
            />
            <span>
              {LEAD_CONSENT_TEXT} Baca{" "}
              <Link href="/kebijakan-privasi" target="_blank" rel="noopener noreferrer" className="font-medium text-[#081EEA]">
                Kebijakan Privasi
              </Link>
              .
            </span>
          </label>

          {error ? (
            <p role="alert" className="text-sm text-[#E70A0A] sm:text-base">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full sm:w-auto sm:self-start">
            {isSubmitting ? "Mengirim..." : "Kirim ke WhatsApp Saya"}
          </Button>
        </form>
      )}
    </section>
  );
}
