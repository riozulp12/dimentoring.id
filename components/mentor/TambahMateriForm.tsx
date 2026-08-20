"use client";

import { useState, type FormEvent } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";

type Jenis = "video" | "dokumen" | "rangkuman_teks";

const JENIS_OPTIONS: { label: string; value: Jenis }[] = [
  { label: "Video", value: "video" },
  { label: "Dokumen", value: "dokumen" },
  { label: "Rangkuman Teks", value: "rangkuman_teks" },
];

/** FR-M4: wajib link yang valid (bukan teks bebas) untuk jenis Video/Dokumen. */
function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function TambahMateriForm({
  kelasId,
  subtesList,
}: {
  kelasId: string;
  subtesList: { id: string; nama: string }[];
}) {
  const [jenis, setJenis] = useState<Jenis>("video");
  const [judul, setJudul] = useState("");
  const [konten, setKonten] = useState("");
  const [subtesId, setSubtesId] = useState("");
  const [kontenError, setKontenError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const isLink = jenis === "video" || jenis === "dokumen";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setKontenError(null);
    setSuccess(false);

    if (isLink && !isValidUrl(konten.trim())) {
      setKontenError("Isi dengan link yang valid (harus diawali http:// atau https://).");
      return;
    }
    if (!isLink && konten.trim().length === 0) {
      setKontenError("Rangkuman tidak boleh kosong.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/materi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kelasId,
          judul,
          tipe: jenis,
          konten,
          subtesId: subtesId || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal menyimpan materi. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }
      setSuccess(true);
      setJudul("");
      setKonten("");
      setSubtesId("");
      setIsSubmitting(false);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-5 sm:p-8"
    >
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-black sm:text-2xl">
        Tambah Materi Manual
      </h1>

      {success ? (
        <p className="rounded-[16px] bg-[#F0FDF4] px-4 py-3 text-sm text-[#0CBA00]">
          Materi berhasil ditambahkan dan langsung tayang untuk siswa.
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Jenis Materi</label>
        <InputField
          type="dropdown"
          size="md"
          value={jenis}
          onChange={(e) => {
            setJenis(e.target.value as Jenis);
            setKontenError(null);
          }}
          options={JENIS_OPTIONS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="materi-judul" className="text-sm font-medium text-black">
          Judul
        </label>
        <InputField
          type="text"
          size="md"
          id="materi-judul"
          placeholder="Judul materi"
          required
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="materi-konten" className="text-sm font-medium text-black">
          {isLink ? `Link ${jenis === "video" ? "Video" : "Dokumen"}` : "Rangkuman"}
        </label>
        {isLink ? (
          <InputField
            type="text"
            size="md"
            id="materi-konten"
            status={kontenError ? "error" : "default"}
            placeholder="https://..."
            required
            value={konten}
            onChange={(e) => {
              setKonten(e.target.value);
              setKontenError(null);
            }}
          />
        ) : (
          <textarea
            id="materi-konten"
            required
            rows={8}
            placeholder="Tulis rangkuman materi di sini..."
            value={konten}
            onChange={(e) => {
              setKonten(e.target.value);
              setKontenError(null);
            }}
            className={`w-full rounded-[16px] border bg-white px-4 py-2.5 text-sm text-[#7E7C7C] transition-colors outline-none placeholder:text-[#AFAFAF] focus:border-black focus:text-black sm:px-5 sm:py-3 sm:text-base ${
              kontenError ? "border-[#E70A0A] bg-[#FFEBEB]" : "border-[#AFAFAF] hover:border-[#081EEA]"
            }`}
          />
        )}
        {kontenError ? <p className="text-sm text-[#E70A0A]">{kontenError}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Subtes (opsional)</label>
        <InputField
          type="dropdown"
          size="md"
          placeholder="Pilih subtes"
          value={subtesId}
          onChange={(e) => setSubtesId(e.target.value)}
          options={subtesList.map((s) => ({ label: s.nama, value: s.id }))}
        />
      </div>

      {submitError ? <p className="text-sm text-[#E70A0A]">{submitError}</p> : null}

      <Button type="submit" variant="primary" size="md" disabled={isSubmitting}>
        {isSubmitting ? "Menyimpan..." : "Simpan Materi"}
      </Button>
    </form>
  );
}
