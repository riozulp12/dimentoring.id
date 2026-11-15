"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Modal from "@/components/ui/Modal";
import DaftarSiswaManualModal from "@/components/admin/DaftarSiswaManualModal";
import UbahMentorOfflineModal from "@/components/admin/UbahMentorOfflineModal";
import { penuhMenurutKapasitasManual, type KapasitasKelas } from "@/lib/shared/kapasitasKelas";
import { teksSlotTerisi, teksTerisiDetail, type SlotTerisiRingkas } from "@/lib/shared/ringkasanKapasitasAdmin";
import type { PendaftarItem, SlotStatus } from "@/lib/admin/getPendaftarKelas";
import { formatSlot, slotKey, type JadwalSlot } from "@/lib/shared/jadwalPilihan";
import type { OpsiJadwalCheckout } from "@/lib/shared/slotTerisi";
import { isKelasPrivate, isValidLinkUrl } from "@/lib/shared/linkMeet";

/**
 * Daftar pendaftar satu kelas + aksi "Tetapkan jadwal" — PRD 7.5.8. Pilihan
 * siswa cuma preferensi: Admin boleh menetapkan slot mana pun dari
 * kelas.jadwal saat ini. Slot yang sudah dihapus dari kelas tetap tampil
 * dengan badge "slot tidak lagi tersedia".
 *
 * PRD 7.5.10: tombol "Daftarkan Siswa Manual" (siswa yang bayar di luar
 * website) + badge "Manual" untuk enrollment sumber='manual', dan (kelas
 * offline) aksi "Ubah mentor" per siswa.
 */

const STATUS_LABEL: Record<PendaftarItem["statusPembayaran"], string> = {
  menunggu: "Menunggu",
  lunas: "Lunas",
  batal: "Batal",
};

function formatTanggal(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function SlotCell({ value }: { value: SlotStatus | undefined | null }) {
  if (!value) return <span className="text-[#AFAFAF]">-</span>;
  return (
    <span className="flex flex-col gap-1">
      <span className={value.tersedia ? "text-black" : "text-[#7E7C7C] line-through"}>{formatSlot(value.slot)}</span>
      {!value.tersedia ? (
        <span className="w-fit rounded-full bg-[#FFF4E5] px-2 py-0.5 text-xs font-medium text-[#B45309]">
          slot tidak lagi tersedia
        </span>
      ) : null}
    </span>
  );
}

interface RowState extends PendaftarItem {
  selectedKey: string;
  busy: boolean;
  error: string | null;
  /** Link Meet per siswa (kelas private). */
  linkInput: string;
  linkBusy: boolean;
  linkError: string | null;
}

export default function PendaftarKelasClient({
  kelasId,
  kelasNama,
  modePembelajaran,
  tipeKelas,
  subtesPool,
  kapasitas,
  terisi,
  kapasitasEfektif,
  slotTerisi,
  jadwalPilihanAktif,
  slots,
  opsiJadwal,
  initialPendaftar,
}: {
  kelasId: string;
  kelasNama: string;
  modePembelajaran: "online" | "offline";
  tipeKelas: string | null;
  subtesPool: { id: string; nama: string }[];
  /** null = kapasitas manual kosong — pendaftaran manual hanya dibatasi kapasitas manual (sama dengan server). */
  kapasitas: number | null;
  terisi: number;
  /** Kapasitas efektif (sama dengan badge kartu) — dasar teks "Terisi X dari Y". */
  kapasitasEfektif: KapasitasKelas;
  /** Hanya kelas private-online-slot; null = tidak memakai slot. */
  slotTerisi: SlotTerisiRingkas | null;
  jadwalPilihanAktif: boolean;
  slots: JadwalSlot[];
  /** Opsi dropdown jadwal di form pendaftaran manual (kosong = form tanpa kolom jadwal). */
  opsiJadwal: OpsiJadwalCheckout[];
  initialPendaftar: PendaftarItem[];
}) {
  const router = useRouter();
  const [manualOpen, setManualOpen] = useState(false);
  // Refresh data setelah modal ditutup (bukan saat sukses) — refresh me-remount
  // komponen ini (key di page) dan akan menutup layar sukses terlalu cepat.
  const perluRefresh = useRef(false);
  function tutupManual() {
    setManualOpen(false);
    if (perluRefresh.current) {
      perluRefresh.current = false;
      router.refresh();
    }
  }
  const [ubahMentorId, setUbahMentorId] = useState<string | null>(null);
  const penuh = penuhMenurutKapasitasManual(kapasitas, terisi);
  const slotOptions = slots.map((s) => ({ label: formatSlot(s), value: slotKey(s) }));
  const tersediaKeys = new Set(slotOptions.map((o) => o.value));

  const [rows, setRows] = useState<RowState[]>(
    initialPendaftar.map((item) => {
      // Default dropdown: jadwal yang sudah ditetapkan, lalu Pilihan 1/2 yang masih tersedia.
      const candidates = [item.ditetapkan, ...item.pilihan].filter((v): v is SlotStatus => Boolean(v));
      const preset = candidates.find((v) => tersediaKeys.has(slotKey(v.slot)));
      return {
        ...item,
        selectedKey: preset ? slotKey(preset.slot) : "",
        busy: false,
        error: null,
        linkInput: item.linkMeet ?? "",
        linkBusy: false,
        linkError: null,
      };
    }),
  );

  function updateRow(enrollmentId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.enrollmentId === enrollmentId ? { ...r, ...patch } : r)));
  }

  /** Admin menimpa (atau mengosongkan, linkMeet=null) link Meet per siswa. */
  async function handleSimpanLink(row: RowState, linkMeet: string | null) {
    if (linkMeet !== null && !isValidLinkUrl(linkMeet)) {
      updateRow(row.enrollmentId, { linkError: "Link Meet harus berupa URL yang valid (diawali http:// atau https://)." });
      return;
    }
    updateRow(row.enrollmentId, { linkBusy: true, linkError: null });
    try {
      const response = await fetch(`/api/kelola-kelas/${kelasId}/pendaftar/${row.enrollmentId}/link-meet`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkMeet }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        updateRow(row.enrollmentId, { linkBusy: false, linkError: json.error ?? "Gagal menyimpan link Meet." });
        return;
      }
      const baru = (json.linkMeet as string | null) ?? null;
      updateRow(row.enrollmentId, {
        linkBusy: false,
        linkMeet: baru,
        linkMeetPengisi: baru ? "Admin" : null,
        linkInput: baru ?? "",
      });
    } catch {
      updateRow(row.enrollmentId, { linkBusy: false, linkError: "Gagal terhubung ke server." });
    }
  }

  async function handleTetapkan(row: RowState) {
    const slot = slots.find((s) => slotKey(s) === row.selectedKey);
    if (!slot) {
      updateRow(row.enrollmentId, { error: "Pilih jadwal dulu." });
      return;
    }
    updateRow(row.enrollmentId, { busy: true, error: null });
    try {
      const response = await fetch(`/api/kelola-kelas/${kelasId}/pendaftar/${row.enrollmentId}/jadwal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        updateRow(row.enrollmentId, { busy: false, error: json.error ?? "Gagal menetapkan jadwal." });
        return;
      }
      updateRow(row.enrollmentId, {
        busy: false,
        ditetapkan: { slot: json.slot as JadwalSlot, tersedia: true },
        ditetapkanAt: json.ditetapkanAt as string,
      });
    } catch {
      updateRow(row.enrollmentId, { busy: false, error: "Gagal terhubung ke server." });
    }
  }

  const header = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5 text-sm text-[#7E7C7C]">
        <p>
          {teksTerisiDetail(kapasitasEfektif)}
          {kapasitasEfektif.penuh
            ? penuh
              ? " — kelas penuh"
              : " — penuh untuk checkout siswa (pendaftaran manual Admin masih bisa)"
            : ""}
        </p>
        {teksSlotTerisi(slotTerisi) ? <p>{teksSlotTerisi(slotTerisi)}</p> : null}
      </div>
      <Button type="button" variant="primary" size="md" disabled={penuh} onClick={() => setManualOpen(true)}>
        Daftarkan Siswa Manual
      </Button>
    </div>
  );

  const ubahTarget = rows.find((r) => r.enrollmentId === ubahMentorId) ?? null;

  const modal = (
    <>
      <Modal open={ubahTarget !== null} onClose={() => setUbahMentorId(null)}>
        {ubahTarget ? (
          <UbahMentorOfflineModal
            kelasId={kelasId}
            enrollmentId={ubahTarget.enrollmentId}
            siswaNama={ubahTarget.siswaNama}
            mentorSekarang={ubahTarget.mentorOffline}
            onClose={() => setUbahMentorId(null)}
            onSaved={(mentor) => {
              updateRow(ubahTarget.enrollmentId, { mentorOffline: mentor });
              setUbahMentorId(null);
            }}
          />
        ) : null}
      </Modal>
      <Modal open={manualOpen} onClose={tutupManual}>
        <DaftarSiswaManualModal
          kelasId={kelasId}
          kelasNama={kelasNama}
          modePembelajaran={modePembelajaran}
          subtesPool={subtesPool}
          opsiJadwal={opsiJadwal}
          onClose={tutupManual}
          onSuccess={() => {
            perluRefresh.current = true;
          }}
        />
      </Modal>
    </>
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">Belum ada pendaftar di kelas ini.</p>
        </div>
        {modal}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {header}
      {rows.map((row) => (
        <div
          key={row.enrollmentId}
          className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-6"
        >
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-4 sm:text-base">
            <div>
              <p className="text-[#7E7C7C]">Siswa</p>
              <p className="flex flex-wrap items-center gap-2 text-black">
                {row.siswaNama}
                {row.sumber === "manual" ? (
                  <span className="rounded-full bg-[#EEF0FF] px-2 py-0.5 text-xs font-medium text-[#081EEA]">Manual</span>
                ) : null}
              </p>
              <p className="text-xs text-[#7E7C7C]">Daftar {formatTanggal(row.tanggalDaftar)}</p>
            </div>
            <div>
              <p className="text-[#7E7C7C]">Status</p>
              <p className="text-black">{STATUS_LABEL[row.statusPembayaran] ?? row.statusPembayaran}</p>
            </div>
            <div>
              <p className="text-[#7E7C7C]">Pilihan 1</p>
              <SlotCell value={row.pilihan[0]} />
            </div>
            <div>
              <p className="text-[#7E7C7C]">Pilihan 2</p>
              <SlotCell value={row.pilihan[1]} />
            </div>
          </div>

          {modePembelajaran === "offline" ? (
            <div className="flex flex-col gap-2 border-t border-[#E3E3E3] pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p>
                <span className="text-[#7E7C7C]">Mentor tatap muka: </span>
                <span className="text-black">{row.mentorOffline?.nama ?? "Belum ada"}</span>
              </p>
              {row.statusPembayaran === "lunas" ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setUbahMentorId(row.enrollmentId)}>
                  Ubah mentor
                </Button>
              ) : null}
            </div>
          ) : null}

          {isKelasPrivate(tipeKelas) && row.statusPembayaran === "lunas" ? (
            <div className="flex flex-col gap-2 border-t border-[#E3E3E3] pt-3 text-sm">
              <p>
                <span className="text-[#7E7C7C]">Link Meet siswa: </span>
                {row.linkMeet ? (
                  <span className="break-all text-black">
                    {row.linkMeet} <span className="text-xs text-[#7E7C7C]">(diisi {row.linkMeetPengisi ?? "-"})</span>
                  </span>
                ) : (
                  <span className="text-black">Belum diisi</span>
                )}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="sm:w-96">
                  <InputField
                    type="text"
                    size="md"
                    placeholder="https://meet.google.com/..."
                    value={row.linkInput}
                    onChange={(e) => updateRow(row.enrollmentId, { linkInput: e.target.value, linkError: null })}
                  />
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={row.linkBusy || row.linkInput.trim() === ""}
                  onClick={() => handleSimpanLink(row, row.linkInput.trim())}
                >
                  {row.linkBusy ? "Menyimpan..." : "Simpan link"}
                </Button>
                {row.linkMeet ? (
                  <Button type="button" variant="secondary" size="md" disabled={row.linkBusy} onClick={() => handleSimpanLink(row, null)}>
                    Hapus link
                  </Button>
                ) : null}
              </div>
              {row.linkError ? <p className="text-sm text-[#E70A0A]">{row.linkError}</p> : null}
            </div>
          ) : null}

          {jadwalPilihanAktif ? (
            <div className="flex flex-col gap-2 border-t border-[#E3E3E3] pt-3">
              <div className="text-sm">
                <span className="text-[#7E7C7C]">Jadwal ditetapkan: </span>
                {row.ditetapkan ? <SlotCell value={row.ditetapkan} /> : <span className="text-black">Belum</span>}
              </div>
              {row.statusPembayaran === "lunas" ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="sm:w-72">
                    <InputField
                      type="dropdown"
                      size="md"
                      placeholder="Pilih jadwal"
                      value={row.selectedKey}
                      onChange={(e) => updateRow(row.enrollmentId, { selectedKey: e.target.value, error: null })}
                      options={slotOptions}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    disabled={row.busy || !row.selectedKey}
                    onClick={() => handleTetapkan(row)}
                  >
                    {row.busy ? "Menyimpan..." : row.ditetapkan ? "Ubah jadwal" : "Tetapkan jadwal"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-[#7E7C7C]">Jadwal bisa ditetapkan setelah pembayaran lunas.</p>
              )}
              {row.error ? <p className="text-sm text-[#E70A0A]">{row.error}</p> : null}
            </div>
          ) : null}
        </div>
      ))}
      {modal}
    </div>
  );
}
