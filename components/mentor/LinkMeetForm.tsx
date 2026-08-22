"use client";

import { useState, type FormEvent } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function LinkMeetForm({ kelasId, initialLinkMeet }: { kelasId: string; initialLinkMeet: string | null }) {
  const [linkMeet, setLinkMeet] = useState(initialLinkMeet ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const trimmed = linkMeet.trim();
    if (!isValidUrl(trimmed)) {
      setError("Isi dengan link yang valid (harus diawali http:// atau https://).");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/kelas/${kelasId}/link-meet`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkMeet: trimmed }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error ?? "Gagal menyimpan link. Coba lagi nanti.");
        setIsSaving(false);
        return;
      }
      setLinkMeet(trimmed);
      setSuccess(true);
      setIsSaving(false);
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="link-meet" className="text-sm font-medium text-black">
        Link Meet
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <InputField
            type="text"
            size="md"
            id="link-meet"
            status={error ? "error" : "default"}
            placeholder="https://meet.google.com/..."
            value={linkMeet}
            onChange={(e) => {
              setLinkMeet(e.target.value);
              setError(null);
              setSuccess(false);
            }}
          />
        </div>
        <Button type="submit" variant="primary" size="md" disabled={isSaving}>
          {isSaving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
      {error ? <p className="text-sm text-[#E70A0A]">{error}</p> : null}
      {success ? <p className="text-sm text-[#0CBA00]">Link Meet berhasil disimpan.</p> : null}
    </form>
  );
}
