"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import type { MenungguDiterimaItem } from "@/lib/mentor/getKelasSayaData";

/**
 * "Menunggu diterima" (Mentor) — siswa-subtes yang dipegang >=2 mentor aktif dan
 * belum diterima siapa pun. Siapa menekan "Terima siswa" lebih dulu yang
 * mengajar siswa itu; server menjaganya dengan klaim atomik (POST
 * /api/mentor/terima-siswa). Bila sudah keduluan (409) baris menampilkan
 * "Siswa sudah diterima mentor lain" beberapa detik, lalu dilepas dari daftar
 * dan halaman disegarkan supaya mengikuti keadaan server.
 */

const JEDA_LEPAS_MS = 2500;

interface BarisState {
  busy: boolean;
  error: string | null;
  /** Keduluan mentor lain — tampil sebagai info, bukan galat. */
  keduluan: boolean;
  diterima: boolean;
}

const AWAL: BarisState = { busy: false, error: null, keduluan: false, diterima: false };

export default function MenungguDiterimaList({ items }: { items: MenungguDiterimaItem[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [state, setState] = useState<Record<string, BarisState>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const aktif = timers.current;
    return () => aktif.forEach(clearTimeout);
  }, []);

  /** Pesan hasil tampil sebentar, lalu baris dilepas & halaman disegarkan. */
  const lepasLaluSegarkan = (id: string) => {
    timers.current.push(
      setTimeout(() => {
        setRows((prev) => prev.filter((row) => row.enrollmentSubtesId !== id));
        router.refresh();
      }, JEDA_LEPAS_MS),
    );
  };

  const ubah = (id: string, patch: Partial<BarisState>) =>
    setState((prev) => ({ ...prev, [id]: { ...(prev[id] ?? AWAL), ...patch } }));

  async function handleTerima(item: MenungguDiterimaItem) {
    const id = item.enrollmentSubtesId;
    ubah(id, { busy: true, error: null, keduluan: false });
    try {
      const response = await fetch("/api/mentor/terima-siswa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentSubtesId: id }),
      });
      const json = await response.json();
      if (response.status === 409) {
        ubah(id, { busy: false, keduluan: true });
        lepasLaluSegarkan(id);
        return;
      }
      if (!response.ok || !json.success) {
        ubah(id, { busy: false, error: json.error ?? "Gagal menerima siswa. Coba lagi nanti." });
        return;
      }
      ubah(id, { busy: false, diterima: true });
      lepasLaluSegarkan(id);
    } catch {
      ubah(id, { busy: false, error: "Gagal terhubung ke server." });
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Menunggu diterima</h2>
        <p className="text-sm text-[#7E7C7C]">
          Subtes ini dipegang beberapa mentor. Siapa yang menerima lebih dulu akan mengajar siswa tersebut.
        </p>
      </div>
      {rows.map((item) => {
        const st = state[item.enrollmentSubtesId] ?? AWAL;
        return (
          <div
            key={item.enrollmentSubtesId}
            className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-medium text-black sm:text-base">{item.siswaNama}</p>
              <span className="inline-flex w-fit items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
                {item.subtesNama || "Subtes"}
              </span>
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              {st.diterima ? (
                <span className="inline-flex items-center rounded-full bg-[#F0FDF4] px-2.5 py-0.5 text-xs font-medium text-[#0CBA00]">
                  Siswa sudah kamu terima
                </span>
              ) : st.keduluan ? (
                <p role="status" className="text-sm text-[#7E7C7C]">
                  Siswa sudah diterima mentor lain
                </p>
              ) : (
                <Button type="button" variant="secondary" size="sm" disabled={st.busy} onClick={() => handleTerima(item)}>
                  {st.busy ? "Menyimpan..." : "Terima siswa"}
                </Button>
              )}
              {st.error ? (
                <p role="alert" className="text-xs text-[#E70A0A]">
                  {st.error}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
