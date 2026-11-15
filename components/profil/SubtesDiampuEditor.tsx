"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import SelectField from "@/components/ui/SelectField";

/**
 * "Subtes yang Diampu" di kartu Info Mengajar (Profil mentor) — chip dengan tombol
 * hapus (x), "+ Tambah subtes" (dropdown master subtes yang belum dimiliki), Simpan.
 *
 * Perubahan baru dikirim saat Simpan ke PATCH /api/mentor/subtes-diampu (daftar
 * LENGKAP yang diinginkan; server menghitung diff dan menjaga subtes yang masih
 * dipakai di kelas/pendaftaran offline). Subtes yang ditolak penjaga (409) tampil
 * dengan alasannya. Konfirmasi pelepasan INLINE (tanpa window.confirm).
 */

interface Tertahan {
  nama: string;
  alasan: string;
}

export default function SubtesDiampuEditor({
  subtesAwal,
  subtesOptions,
  onTersimpan,
}: {
  /** Subtes yang tersimpan saat ini (nama). */
  subtesAwal: string[];
  /** Master subtes (nama). */
  subtesOptions: string[];
  onTersimpan: (subtes: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(subtesAwal);
  const [tersimpan, setTersimpan] = useState<string[]>(subtesAwal);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tertahan, setTertahan] = useState<Tertahan[]>([]);

  const dilepas = tersimpan.filter((nama) => !draft.includes(nama));
  const ditambah = draft.filter((nama) => !tersimpan.includes(nama));
  const berubah = dilepas.length > 0 || ditambah.length > 0;
  const tersedia = subtesOptions.filter((nama) => !draft.includes(nama));
  const alasanPer = new Map(tertahan.map((t) => [t.nama, t.alasan]));

  function reset() {
    setDraft(tersimpan);
    setKonfirmasi(false);
    setError(null);
    setTertahan([]);
  }

  function tambah(nama: string) {
    if (!nama || draft.includes(nama)) return;
    setDraft((prev) => [...prev, nama]);
    setKonfirmasi(false);
    setError(null);
  }

  function lepas(nama: string) {
    setDraft((prev) => prev.filter((n) => n !== nama));
    setKonfirmasi(false);
    setError(null);
    setTertahan((prev) => prev.filter((t) => t.nama !== nama));
  }

  function batalkanLepas(nama: string) {
    setDraft((prev) => (prev.includes(nama) ? prev : [...prev, nama]));
    setKonfirmasi(false);
  }

  function klikSimpan() {
    if (!berubah || isSaving) return;
    if (draft.length === 0) {
      setError("Pilih minimal satu Subtes yang Diampu.");
      return;
    }
    // Ada yang dilepas -> minta konfirmasi inline dulu. Hanya menambah -> langsung simpan.
    if (dilepas.length > 0 && !konfirmasi) {
      setKonfirmasi(true);
      return;
    }
    void simpan();
  }

  async function simpan() {
    setIsSaving(true);
    setError(null);
    setTertahan([]);
    try {
      const response = await fetch("/api/mentor/subtes-diampu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtesDiampu: draft }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        if (response.status === 409 && Array.isArray(json.tertahan)) {
          setTertahan(json.tertahan as Tertahan[]);
          // Kembalikan chip yang ditahan supaya jelas mana yang tidak bisa dilepas.
          const nama = (json.tertahan as Tertahan[]).map((t) => t.nama);
          setDraft((prev) => Array.from(new Set([...prev, ...nama])));
        }
        setError(json.error ?? "Gagal menyimpan Subtes yang Diampu. Coba lagi nanti.");
        setKonfirmasi(false);
        return;
      }
      setTersimpan(draft);
      setKonfirmasi(false);
      onTersimpan(draft);
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setKonfirmasi(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {draft.length === 0 ? <span className="text-sm text-[#7E7C7C]">Belum diisi</span> : null}
        {draft.map((nama) => {
          const alasan = alasanPer.get(nama);
          return (
            <span
              key={nama}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-black sm:text-sm",
                alasan ? "border-[#E70A0A] bg-red-50" : "border-[#E3E3E3] bg-[#F9F9F9]",
                ditambah.includes(nama) ? "border-[#081EEA]" : "",
              ].join(" ")}
            >
              {nama}
              <button
                type="button"
                aria-label={`Lepas subtes ${nama}`}
                title={draft.length <= 1 ? "Minimal satu subtes" : `Lepas ${nama}`}
                disabled={isSaving || draft.length <= 1}
                onClick={() => lepas(nama)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-[#7E7C7C] hover:bg-[#E3E3E3] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      {dilepas.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#7E7C7C] sm:text-sm">
          <span>Akan dilepas:</span>
          {dilepas.map((nama) => (
            <span key={nama} className="inline-flex items-center gap-1 line-through">
              {nama}
              <button
                type="button"
                disabled={isSaving}
                onClick={() => batalkanLepas(nama)}
                className="text-[#081EEA] no-underline hover:underline disabled:opacity-40"
              >
                batalkan
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {tertahan.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-[#E70A0A] sm:text-sm" role="alert">
          {tertahan.map((t) => (
            <li key={t.nama}>{t.alasan}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64">
          <SelectField
            size="md"
            value=""
            placeholder={tersedia.length === 0 ? "Semua subtes sudah dipilih" : "+ Tambah subtes"}
            disabled={isSaving || tersedia.length === 0}
            options={tersedia.map((nama) => ({ label: nama, value: nama }))}
            onChange={(e) => tambah(e.target.value)}
          />
        </div>
      </div>

      {konfirmasi ? (
        <div className="flex flex-col gap-2 rounded-[12px] border border-[#E3E3E3] bg-[#F9F9F9] p-3 text-sm text-black" role="alertdialog" aria-live="polite">
          <p>
            Lepas <strong>{dilepas.join(", ")}</strong> dari Subtes yang Diampu? Kamu tidak akan menerima review konten untuk subtes ini lagi.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void simpan()} disabled={isSaving}>
              {isSaving ? "Menyimpan..." : "Ya, lepas dan simpan"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setKonfirmasi(false)} disabled={isSaving}>
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={klikSimpan} disabled={!berubah || isSaving}>
            {isSaving ? "Menyimpan..." : "Simpan"}
          </Button>
          {berubah ? (
            <Button type="button" variant="secondary" size="sm" onClick={reset} disabled={isSaving}>
              Batalkan perubahan
            </Button>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="text-sm text-[#E70A0A]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
