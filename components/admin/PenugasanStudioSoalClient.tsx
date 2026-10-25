"use client";

import { useMemo, useState } from "react";
import type { PenugasanStudioSoalData } from "@/lib/admin/getPenugasanStudioSoalData";
import {
  PESAN_PERINGATAN,
  kunciPenugasan,
  ringkasPenugasan,
  terapkanAksi,
  type AksiPenugasan,
  type PenugasanRow,
} from "@/lib/shared/studio-soal/penugasan";

/**
 * Penugasan mentor ke subtes Studio Soal (Admin) — PR 3a, revisi K2.
 * Admin memilih sendiri subtes tiap mentor (tidak ada seleksi otomatis).
 * Label "mengajar subtes ini" = isi profil mengajar mentor
 * (mentor_subtes_diampu), hanya petunjuk: tidak memberi hak dan tidak diubah
 * dari halaman ini. Setiap perubahan tercatat di log audit lewat RPC.
 */

interface PesanMentor {
  jenis: "ok" | "gagal";
  teks: string;
}

export default function PenugasanStudioSoalClient({ initialData }: { initialData: PenugasanStudioSoalData }) {
  const { subtes, mentor } = initialData;
  const [penugasan, setPenugasan] = useState<PenugasanRow[]>(initialData.penugasan);
  const [sibuk, setSibuk] = useState<Set<string>>(new Set());
  const [pesan, setPesan] = useState<Record<string, PesanMentor>>({});
  const [cari, setCari] = useState("");

  const ditugaskan = useMemo(() => new Set(penugasan.map((p) => kunciPenugasan(p.mentorId, p.subtesId))), [penugasan]);
  const ringkasan = useMemo(
    () => ringkasPenugasan(subtes, penugasan, mentor.filter((m) => m.aktif).map((m) => m.id)),
    [subtes, penugasan, mentor],
  );
  const mentorTampil = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    return kata ? mentor.filter((m) => m.nama.toLowerCase().includes(kata)) : mentor;
  }, [mentor, cari]);

  async function ubah(mentorId: string, subtesId: string, aksi: AksiPenugasan) {
    const kunci = kunciPenugasan(mentorId, subtesId);
    setSibuk((prev) => new Set(prev).add(kunci));
    setPesan((prev) => {
      const baru = { ...prev };
      delete baru[mentorId];
      return baru;
    });
    try {
      const response = await fetch("/api/admin/studio-soal/penugasan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentorId, subtesId, aksi }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setPesan((prev) => ({ ...prev, [mentorId]: { jenis: "gagal", teks: json.error ?? "Gagal menyimpan penugasan." } }));
        return;
      }
      setPenugasan((prev) => terapkanAksi(prev, mentorId, subtesId, aksi));
      setPesan((prev) => ({ ...prev, [mentorId]: { jenis: "ok", teks: json.pesan } }));
    } catch {
      setPesan((prev) => ({ ...prev, [mentorId]: { jenis: "gagal", teks: "Gagal terhubung ke server." } }));
    } finally {
      setSibuk((prev) => {
        const baru = new Set(prev);
        baru.delete(kunci);
        return baru;
      });
    }
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium text-black sm:text-xl">Ringkasan per subtes</h2>
          <p className="text-sm text-[#7E7C7C]">
            Hanya mentor aktif yang dihitung. Peer review butuh minimal 2 mentor per subtes.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ringkasan.map((r) => (
            <div
              key={r.subtesId}
              className={[
                "flex flex-col gap-1 rounded-[20px] border-[0.8px] px-4 py-3",
                r.peringatan ? "border-amber-200 bg-amber-50" : "border-[#E3E3E3] bg-white",
              ].join(" ")}
            >
              <p className="text-sm font-medium text-black">{r.nama}</p>
              <p className="text-sm text-[#7E7C7C]">{r.jumlahMentor} mentor</p>
              {r.peringatan ? <p className="text-xs text-amber-700">{PESAN_PERINGATAN[r.peringatan]}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium text-black sm:text-xl">Mentor</h2>
            <p className="text-sm text-[#7E7C7C]">
              Klik subtes untuk menugaskan atau mencabut. Mencabut penugasan tidak menghapus soal yang sudah ditulis.
            </p>
          </div>
          <input
            type="search"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama mentor"
            aria-label="Cari nama mentor"
            className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors placeholder:text-[#AFAFAF] focus:border-black sm:w-64"
          />
        </div>

        {mentor.length === 0 ? (
          <div className="rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
            <p className="text-base text-[#7E7C7C]">Belum ada mentor aktif.</p>
          </div>
        ) : mentorTampil.length === 0 ? (
          <p className="text-sm text-[#7E7C7C]">Tidak ada mentor dengan nama itu.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {mentorTampil.map((m) => {
              const pesanMentor = pesan[m.id];
              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-6"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-medium text-black">{m.nama}</p>
                    {m.asalPtn ? <p className="text-sm text-[#7E7C7C]">· {m.asalPtn}</p> : null}
                    {!m.aktif ? (
                      <span className="rounded-full bg-[#F1F1F1] px-2 py-0.5 text-xs font-medium text-[#7E7C7C]">
                        Nonaktif — hanya bisa dicabut
                      </span>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {subtes.map((s) => {
                      const kunci = kunciPenugasan(m.id, s.id);
                      const aktif = ditugaskan.has(kunci);
                      const dikunci = !m.aktif && !aktif;
                      const mengajar = m.subtesProfil.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={aktif}
                          disabled={sibuk.has(kunci) || dikunci}
                          onClick={() => ubah(m.id, s.id, aktif ? "cabut" : "tugaskan")}
                          className={[
                            "flex flex-col items-start gap-0.5 rounded-[12px] border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            aktif
                              ? "border-[#081EEA] bg-[#081EEA] text-white"
                              : "border-[#CAC9C9] bg-white text-black hover:border-[#081EEA]",
                          ].join(" ")}
                        >
                          <span className="font-medium">{s.nama}</span>
                          <span className={["text-xs", aktif ? "text-white/80" : "text-[#7E7C7C]"].join(" ")}>
                            {sibuk.has(kunci) ? "Menyimpan…" : aktif ? "Ditugaskan" : "Belum ditugaskan"}
                            {mengajar ? " · mengajar subtes ini" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {pesanMentor ? (
                    <p className={["text-sm", pesanMentor.jenis === "ok" ? "text-[#0A7D2C]" : "text-[#E70A0A]"].join(" ")}>
                      {pesanMentor.teks}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
