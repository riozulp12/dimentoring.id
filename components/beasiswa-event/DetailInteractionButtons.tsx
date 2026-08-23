"use client";

import { useState } from "react";

/**
 * Tombol "Simpan" / "Tandai Tertarik" di halaman detail /beasiswa-event/[id]
 * — cuma dirender kalau user sudah login (dicek di page.tsx Server Component,
 * BUKAN di sini), insert ke konten_info_interactions lewat
 * app/api/konten-info/[kontenInfoId]/interaksi/route.ts.
 */

type InteractionStatus = "idle" | "saving" | "done" | "error";

function InteractionButton({
  kontenInfoId,
  jenis,
  idleLabel,
  doneLabel,
}: {
  kontenInfoId: string;
  jenis: "disimpan" | "tertarik";
  idleLabel: string;
  doneLabel: string;
}) {
  const [status, setStatus] = useState<InteractionStatus>("idle");

  async function handleClick() {
    setStatus("saving");
    try {
      const response = await fetch(`/api/konten-info/${kontenInfoId}/interaksi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jenis }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={status === "saving" || status === "done"}
        onClick={handleClick}
        className={`inline-flex w-fit items-center justify-center rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed ${
          status === "done"
            ? "border-[#0CBA00] bg-[#F0FDF4] text-[#0CBA00]"
            : "border-[#E3E3E3] text-[#7E7C7C] hover:border-[#081EEA] hover:text-[#081EEA] disabled:opacity-60"
        }`}
      >
        {status === "done" ? doneLabel : idleLabel}
      </button>
      {status === "error" ? <p className="text-xs text-[#E70A0A]">Gagal menyimpan, coba lagi.</p> : null}
    </div>
  );
}

export default function DetailInteractionButtons({ kontenInfoId }: { kontenInfoId: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      <InteractionButton kontenInfoId={kontenInfoId} jenis="disimpan" idleLabel="Simpan" doneLabel="Tersimpan ✓" />
      <InteractionButton
        kontenInfoId={kontenInfoId}
        jenis="tertarik"
        idleLabel="Tandai Tertarik"
        doneLabel="Ditandai Tertarik ✓"
      />
    </div>
  );
}
