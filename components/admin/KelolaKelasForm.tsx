"use client";

import { useCallback, useState, type FormEvent } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";
import type { JadwalEntry, KelasListItem, MentorOption, SubtesOption } from "@/lib/admin/getKelolaKelasData";
import { PROGRAM_KATEGORI_LABEL, PROGRAM_KATEGORI_ORDER } from "@/lib/shared/kelasLabels";

/**
 * Form Tambah/Edit Kelas — SATU komponen dipakai kedua mode (initialKelas
 * ada = edit, tidak ada = tambah), PRD Bagian 7.5/7.5.3/7.5.4. Subtes
 * multi-select (checklist) — tiap Subtes yang dicentang WAJIB dipasangkan
 * SATU Mentor spesifik lewat dropdown di baris yang sama (kelas_subtes_mentor),
 * dropdown difilter dinamis (cuma mentor aktif yang mapel_dasar/subtes-nya
 * cocok dengan Subtes baris itu). Kalau TIDAK ADA Subtes dicentang sama sekali
 * (kelas Konsultasi/Pendampingan Mahasiswa yang tidak terikat mapel), fallback
 * ke checklist Mentor generik (semua mentor aktif, tanpa cross-check subtes).
 * Jadwal bisa lebih dari satu slot (hari + jam masing-masing lewat picker).
 */

const PROGRAM_KATEGORI_OPTIONS = PROGRAM_KATEGORI_ORDER.map((value) => ({
  label: PROGRAM_KATEGORI_LABEL[value],
  value,
}));

const TINGKAT_KELAS_OPTIONS = [
  { label: "Kelas 10", value: "kelas_10" },
  { label: "Kelas 11", value: "kelas_11" },
  { label: "Kelas 12", value: "kelas_12" },
  { label: "Gap Year", value: "gap_year" },
];

const TIPE_KELAS_OPTIONS = [
  { label: "Private", value: "private" },
  { label: "Semi-Private", value: "semi_private" },
  { label: "Grouping", value: "grouping" },
];

const HARI_OPTIONS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"].map((h) => ({
  label: h,
  value: h,
}));

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function KelolaKelasForm({
  subtesOptions,
  mentorOptions,
  initialKelas,
  onSuccess,
  onCancel,
}: {
  subtesOptions: SubtesOption[];
  mentorOptions: MentorOption[];
  initialKelas?: KelasListItem;
  onSuccess: (kelas: KelasListItem) => void;
  onCancel: () => void;
}) {
  const [nama, setNama] = useState(initialKelas?.nama ?? "");
  const [programKategori, setProgramKategori] = useState(initialKelas?.programKategori ?? "");
  const [tingkatKelas, setTingkatKelas] = useState(initialKelas?.tingkatKelas ?? "");
  const [tipeKelas, setTipeKelas] = useState(initialKelas?.tipeKelas ?? "");
  const [selectedSubtesIds, setSelectedSubtesIds] = useState<string[]>(
    initialKelas?.subtesMentorPairs.map((p) => p.subtesId) ?? [],
  );
  const [subtesMentorMap, setSubtesMentorMap] = useState<Record<string, string>>(
    Object.fromEntries((initialKelas?.subtesMentorPairs ?? []).map((p) => [p.subtesId, p.mentorId])),
  );
  // Fallback TANPA subtes tertentu (Konsultasi/Pendampingan Mahasiswa) — cuma
  // relevan kalau selectedSubtesIds kosong, prefill dari mentorIds lama HANYA
  // kalau kelas ini memang tidak punya pairing (edit kelas lama).
  const [generalMentorIds, setGeneralMentorIds] = useState<string[]>(
    (initialKelas?.subtesMentorPairs.length ?? 0) === 0 ? (initialKelas?.mentorIds ?? []) : [],
  );
  const [kapasitas, setKapasitas] = useState(initialKelas ? String(initialKelas.kapasitas) : "");
  const [harga, setHarga] = useState(initialKelas ? String(initialKelas.harga) : "");
  const [jadwalEntries, setJadwalEntries] = useState<JadwalEntry[]>(initialKelas?.jadwalEntries ?? []);
  const [linkMeet, setLinkMeet] = useState(initialKelas?.linkMeet ?? "");
  const [linkMeetError, setLinkMeetError] = useState<string | null>(null);
  const [linkLynkid, setLinkLynkid] = useState(initialKelas?.linkLynkid ?? "");
  const [linkLynkidError, setLinkLynkidError] = useState<string | null>(null);
  const [deskripsi, setDeskripsi] = useState(initialKelas?.deskripsi ?? "");
  const [isGeneratingDeskripsi, setIsGeneratingDeskripsi] = useState(false);
  const [deskripsiError, setDeskripsiError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cocokkan mentor lewat mapel_dasar (mapel serumpun, mis. Literasi B.
  // Indonesia <-> B. Indonesia) kalau Subtes yang dipilih punya mapel_dasar;
  // fallback ke subtes_id persis sama kalau subtes itu belum dikelompokkan
  // (mapel_dasar NULL) — lihat CLAUDE.md/PRD Bagian 13 (subtes.mapel_dasar).
  const mentorCocokSubtes = useCallback(
    (mentor: MentorOption, targetSubtesId: string): boolean => {
      const targetMapelDasar = subtesOptions.find((s) => s.id === targetSubtesId)?.mapelDasar ?? null;
      if (targetMapelDasar) return mentor.mapelDasarList.includes(targetMapelDasar);
      return mentor.subtesIds.includes(targetSubtesId);
    },
    [subtesOptions],
  );

  const mentorOptionsBySubtes = useCallback(
    (targetSubtesId: string) =>
      mentorOptions
        .filter((m) => mentorCocokSubtes(m, targetSubtesId))
        .map((m) => ({ label: m.nama, value: m.id })),
    [mentorOptions, mentorCocokSubtes],
  );

  function toggleSubtes(subtesIdValue: string) {
    setSelectedSubtesIds((prev) =>
      prev.includes(subtesIdValue) ? prev.filter((id) => id !== subtesIdValue) : [...prev, subtesIdValue],
    );
    // Buang pasangan mentornya juga begitu Subtes di-uncheck — kalau di-check
    // ulang nanti, Admin pilih lagi mentornya dari awal (baris kosong).
    setSubtesMentorMap((prev) => {
      if (!(subtesIdValue in prev)) return prev;
      const next = { ...prev };
      delete next[subtesIdValue];
      return next;
    });
  }

  function setMentorForSubtes(subtesIdValue: string, mentorIdValue: string) {
    setSubtesMentorMap((prev) => ({ ...prev, [subtesIdValue]: mentorIdValue }));
  }

  function toggleGeneralMentor(mentorIdValue: string) {
    setGeneralMentorIds((prev) =>
      prev.includes(mentorIdValue) ? prev.filter((id) => id !== mentorIdValue) : [...prev, mentorIdValue],
    );
  }

  function addJadwalEntry() {
    setJadwalEntries((prev) => [...prev, { hari: "", jamMulai: "" }]);
  }

  function updateJadwalEntry(index: number, patch: Partial<JadwalEntry>) {
    setJadwalEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  }

  function removeJadwalEntry(index: number) {
    setJadwalEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleGenerateDeskripsi() {
    setDeskripsiError(null);
    if (!nama.trim() || !programKategori || !tingkatKelas || !tipeKelas) {
      setDeskripsiError("Isi Nama Kelas, Kategori Program, Tingkat, dan Tipe dulu sebelum generate deskripsi.");
      return;
    }

    setIsGeneratingDeskripsi(true);
    try {
      const response = await fetch("/api/kelola-kelas/generate-deskripsi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namaKelas: nama.trim(),
          programKategori,
          tingkatKelas,
          tipeKelas,
          subtesId: selectedSubtesIds[0] || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setDeskripsiError(json.error ?? "Gagal generate deskripsi. Coba lagi atau isi manual.");
        setIsGeneratingDeskripsi(false);
        return;
      }
      setDeskripsi(json.deskripsi);
      setIsGeneratingDeskripsi(false);
    } catch {
      setDeskripsiError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsGeneratingDeskripsi(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setLinkMeetError(null);
    setLinkLynkidError(null);

    const trimmedLinkMeet = linkMeet.trim();
    if (trimmedLinkMeet && !isValidUrl(trimmedLinkMeet)) {
      setLinkMeetError("Isi dengan link yang valid (harus diawali http:// atau https://).");
      return;
    }

    const trimmedLinkLynkid = linkLynkid.trim();
    if (trimmedLinkLynkid && !isValidUrl(trimmedLinkLynkid)) {
      setLinkLynkidError("Isi dengan link yang valid (harus diawali http:// atau https://).");
      return;
    }

    // Tiap Subtes yang dicentang wajib punya pasangan Mentor — cek di sini
    // dulu supaya errornya jelas per-baris, bukan cuma pesan generik dari API.
    const missingMentorFor = selectedSubtesIds.find((id) => !subtesMentorMap[id]);
    if (missingMentorFor) {
      const subtesNamaMissing = subtesOptions.find((s) => s.id === missingMentorFor)?.nama ?? "Subtes ini";
      setSubmitError(`Pilih Mentor untuk "${subtesNamaMissing}" sebelum menyimpan.`);
      return;
    }

    const completeJadwalEntries = jadwalEntries.filter((entry) => entry.hari && entry.jamMulai);
    const subtesMentorPairs = selectedSubtesIds.map((subtesIdValue) => ({
      subtesId: subtesIdValue,
      mentorId: subtesMentorMap[subtesIdValue],
    }));

    setIsSubmitting(true);
    const payload = {
      nama,
      programKategori,
      tingkatKelas,
      tipeKelas,
      subtesMentorPairs,
      mentorIds: generalMentorIds,
      kapasitas: Number(kapasitas),
      harga: Number(harga),
      jadwalEntries: completeJadwalEntries,
      linkMeet: trimmedLinkMeet || undefined,
      linkLynkid: trimmedLinkLynkid || undefined,
      deskripsi: deskripsi.trim() || undefined,
    };

    try {
      const url = initialKelas ? `/api/kelola-kelas/${initialKelas.id}` : "/api/kelola-kelas";
      const method = initialKelas ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal menyimpan kelas. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      const resolvedSubtesMentorPairs = subtesMentorPairs.map((pair) => ({
        subtesId: pair.subtesId,
        subtesNama: subtesOptions.find((s) => s.id === pair.subtesId)?.nama ?? "-",
        mentorId: pair.mentorId,
        mentorNama: mentorOptions.find((m) => m.id === pair.mentorId)?.nama ?? "-",
      }));
      const subtesNama =
        resolvedSubtesMentorPairs.length > 0 ? resolvedSubtesMentorPairs.map((p) => p.subtesNama).join(", ") : "-";
      const mentorIds = Array.from(
        new Set([...resolvedSubtesMentorPairs.map((p) => p.mentorId), ...generalMentorIds]),
      );
      const mentorNamaList = mentorIds
        .map((id) => mentorOptions.find((m) => m.id === id)?.nama)
        .filter((nama): nama is string => Boolean(nama));
      const jadwalDisplay =
        completeJadwalEntries.length > 0
          ? completeJadwalEntries.map((e) => `${e.hari}, ${e.jamMulai} WIB`).join(" & ")
          : "Jadwal belum diatur";

      onSuccess({
        id: initialKelas?.id ?? (json.id as string),
        nama,
        programKategori,
        tingkatKelas,
        tipeKelas,
        subtesId: resolvedSubtesMentorPairs[0]?.subtesId ?? null,
        subtesNama,
        mentorId: mentorIds[0] ?? null,
        mentorNama: mentorNamaList[0] ?? null,
        mentorIds,
        mentorNamaList,
        subtesMentorPairs: resolvedSubtesMentorPairs,
        kapasitas: Number(kapasitas),
        jumlahSiswa: initialKelas?.jumlahSiswa ?? 0,
        harga: Number(harga),
        jadwalEntries: completeJadwalEntries,
        jadwalDisplay,
        linkMeet: trimmedLinkMeet || null,
        linkLynkid: trimmedLinkLynkid || null,
        deskripsi: deskripsi.trim() || null,
      });
      setIsSubmitting(false);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-black">{initialKelas ? "Edit Kelas" : "Tambah Kelas"}</h2>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Nama Kelas</label>
        <InputField
          type="text"
          size="md"
          required
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Nama kelas"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Kategori Program</label>
        <InputField
          type="dropdown"
          size="md"
          placeholder="Pilih kategori program"
          required
          value={programKategori}
          onChange={(e) => setProgramKategori(e.target.value)}
          options={PROGRAM_KATEGORI_OPTIONS}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Tingkat Kelas</label>
          <InputField
            type="dropdown"
            size="md"
            placeholder="Pilih tingkat"
            required
            value={tingkatKelas}
            onChange={(e) => setTingkatKelas(e.target.value)}
            options={TINGKAT_KELAS_OPTIONS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Tipe Kelas</label>
          <InputField
            type="dropdown"
            size="md"
            placeholder="Pilih tipe"
            required
            value={tipeKelas}
            onChange={(e) => setTipeKelas(e.target.value)}
            options={TIPE_KELAS_OPTIONS}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Subtes (bisa pilih lebih dari satu — paket)</label>
        {subtesOptions.length === 0 ? (
          <p className="text-sm text-[#7E7C7C]">Belum ada subtes yang ditawarkan.</p>
        ) : (
          <div className="modal-content-scrollable flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-[12px] border border-[#AFAFAF] p-2.5">
            {subtesOptions.map((subtes) => (
              <label
                key={subtes.id}
                className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-sm text-black hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedSubtesIds.includes(subtes.id)}
                  onChange={() => toggleSubtes(subtes.id)}
                  className="size-4 accent-[#081EEA]"
                />
                {subtes.nama}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-[#7E7C7C]">
          Boleh dikosongkan sama sekali khusus untuk kategori Konsultasi & Pendampingan Mahasiswa.
        </p>
      </div>

      {selectedSubtesIds.length > 0 ? (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-black">Mentor per Subtes</label>
          <div className="flex flex-col gap-2">
            {selectedSubtesIds.map((subtesIdValue) => {
              const subtesNamaValue = subtesOptions.find((s) => s.id === subtesIdValue)?.nama ?? "-";
              const options = mentorOptionsBySubtes(subtesIdValue);
              return (
                <div key={subtesIdValue} className="flex items-center gap-3">
                  <span className="w-1/3 shrink-0 truncate text-sm text-black" title={subtesNamaValue}>
                    {subtesNamaValue}
                  </span>
                  <div className="flex-1">
                    {options.length === 0 ? (
                      <p className="text-sm text-[#7E7C7C]">Belum ada mentor aktif yang mengampu subtes ini.</p>
                    ) : (
                      <InputField
                        type="dropdown"
                        size="md"
                        placeholder="Pilih mentor"
                        value={subtesMentorMap[subtesIdValue] ?? ""}
                        onChange={(e) => setMentorForSubtes(subtesIdValue, e.target.value)}
                        options={options}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Mentor (bisa pilih lebih dari satu)</label>
          {mentorOptions.length === 0 ? (
            <p className="text-sm text-[#7E7C7C]">Belum ada mentor aktif.</p>
          ) : (
            <div className="modal-content-scrollable flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-[12px] border border-[#AFAFAF] p-2.5">
              {mentorOptions.map((mentor) => (
                <label
                  key={mentor.id}
                  className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-sm text-black hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={generalMentorIds.includes(mentor.id)}
                    onChange={() => toggleGeneralMentor(mentor.id)}
                    className="size-4 accent-[#081EEA]"
                  />
                  {mentor.nama}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Kapasitas</label>
          <InputField
            type="text"
            size="md"
            inputMode="numeric"
            required
            value={kapasitas}
            onChange={(e) => setKapasitas(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Mis. 10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Harga (Rp)</label>
          <InputField
            type="text"
            size="md"
            inputMode="numeric"
            required
            value={harga}
            onChange={(e) => setHarga(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Mis. 500000"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-black">Jadwal</label>
        {jadwalEntries.length === 0 ? (
          <p className="text-sm text-[#7E7C7C]">Belum ada slot jadwal. Klik &quot;+ Tambah Jadwal&quot; di bawah.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {jadwalEntries.map((entry, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1">
                  <InputField
                    type="dropdown"
                    size="md"
                    placeholder="Hari"
                    value={entry.hari}
                    onChange={(e) => updateJadwalEntry(index, { hari: e.target.value })}
                    options={HARI_OPTIONS}
                  />
                </div>
                <input
                  type="time"
                  value={entry.jamMulai}
                  onChange={(e) => updateJadwalEntry(index, { jamMulai: e.target.value })}
                  className="w-32 rounded-[16px] border border-[#AFAFAF] bg-white px-3 py-2.5 text-sm text-black outline-none transition-colors hover:border-[#081EEA] focus:border-black"
                />
                <button
                  type="button"
                  onClick={() => removeJadwalEntry(index)}
                  aria-label="Hapus jadwal ini"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#7E7C7C] transition-colors hover:bg-gray-100"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="size-4" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addJadwalEntry}
          className="w-fit text-sm font-medium text-[#081EEA] hover:underline"
        >
          + Tambah Jadwal
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Link Meet (opsional)</label>
        <InputField
          type="text"
          size="md"
          status={linkMeetError ? "error" : "default"}
          value={linkMeet}
          onChange={(e) => {
            setLinkMeet(e.target.value);
            setLinkMeetError(null);
          }}
          placeholder="https://meet.google.com/..."
        />
        {linkMeetError ? <p className="text-sm text-[#E70A0A]">{linkMeetError}</p> : null}
        <p className="text-xs text-[#7E7C7C]">Bisa dikosongkan — mentor bisa isi sendiri nanti lewat halaman Kelas Saya.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Link Lynk.id (Sementara)</label>
        <InputField
          type="text"
          size="md"
          status={linkLynkidError ? "error" : "default"}
          value={linkLynkid}
          onChange={(e) => {
            setLinkLynkid(e.target.value);
            setLinkLynkidError(null);
          }}
          placeholder="https://lynk.id/..."
        />
        {linkLynkidError ? <p className="text-sm text-[#E70A0A]">{linkLynkidError}</p> : null}
        <p className="text-xs text-[#7E7C7C]">
          Diisi selama Payment otomatis belum aktif — link produk Lynk.id untuk kelas ini. Kosongkan kalau belum ada.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium text-black">Deskripsi Kelas (opsional)</label>
          <button
            type="button"
            onClick={handleGenerateDeskripsi}
            disabled={isGeneratingDeskripsi}
            className="shrink-0 text-sm font-medium text-[#081EEA] hover:underline disabled:opacity-50"
          >
            {isGeneratingDeskripsi ? "Generating..." : "✨ Generate dengan AI"}
          </button>
        </div>
        <textarea
          value={deskripsi}
          onChange={(e) => {
            setDeskripsi(e.target.value);
            setDeskripsiError(null);
          }}
          rows={4}
          placeholder="Deskripsi singkat tentang kelas ini — bisa ditulis manual atau di-generate AI, akan tampil di halaman detail kelas."
          className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors placeholder:text-[#AFAFAF] focus:border-black"
        />
        {deskripsiError ? <p className="text-sm text-[#E70A0A]">{deskripsiError}</p> : null}
      </div>

      {submitError ? <p className="text-sm text-[#E70A0A]">{submitError}</p> : null}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" size="md" className="flex-1" onClick={onCancel} disabled={isSubmitting}>
          Batal
        </Button>
        <Button type="submit" variant="primary" size="md" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Menyimpan..." : initialKelas ? "Simpan Perubahan" : "Tambah Kelas"}
        </Button>
      </div>
    </form>
  );
}
