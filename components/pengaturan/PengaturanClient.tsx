"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Toggle from "@/components/ui/Toggle";
import LogoutConfirmModal from "@/components/shared/LogoutConfirmModal";
import type { SessionRole } from "@/lib/auth/session";

/** Halaman Pengaturan — SATU komponen, 5 section berurutan. Section 3
 * (Privasi) disembunyikan untuk role Admin (PRD 8 BR-14/BR-25 cuma relevan
 * untuk Siswa & Mentor yang tampil di leaderboard). */

const MIN_PASSWORD_LENGTH = 8;

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-5 sm:p-8">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-base font-semibold text-black sm:text-lg">{children}</h2>;
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-black sm:text-base">{label}</span>
        <span className="text-xs text-[#7E7C7C] sm:text-sm">{description}</span>
      </div>
      <Toggle checked={checked} onChange={onToggle} disabled={disabled} label={label} />
    </div>
  );
}

function formatTanggalIndonesia(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function PengaturanClient({
  role,
  notifEmail: initialNotifEmail,
  notifWa: initialNotifWa,
  optOutLeaderboard: initialOptOut,
  consentLeaderboardLokasi: initialConsent,
  permintaanHapusAkun: initialPermintaan,
  tanggalPermintaanHapus: initialTanggalPermintaan,
}: {
  role: SessionRole;
  notifEmail: boolean;
  notifWa: boolean;
  optOutLeaderboard: boolean;
  consentLeaderboardLokasi: boolean;
  permintaanHapusAkun: boolean;
  tanggalPermintaanHapus: string | null;
}) {
  // ---- Section 1: Ganti Password ----
  const [passwordSaatIni, setPasswordSaatIni] = useState("");
  const [passwordBaru, setPasswordBaru] = useState("");
  const [konfirmasiPasswordBaru, setKonfirmasiPasswordBaru] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  async function handleGantiPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!passwordSaatIni || !passwordBaru || !konfirmasiPasswordBaru) {
      setPasswordError("Semua field wajib diisi.");
      return;
    }
    if (passwordBaru !== konfirmasiPasswordBaru) {
      setPasswordError("Password Baru dan Konfirmasi Password Baru tidak sama.");
      return;
    }
    if (passwordBaru.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password Baru minimal ${MIN_PASSWORD_LENGTH} karakter.`);
      return;
    }

    setIsSubmittingPassword(true);
    try {
      const response = await fetch("/api/pengaturan/ganti-password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passwordSaatIni, passwordBaru, konfirmasiPasswordBaru }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setPasswordError(json.error ?? "Gagal mengganti password. Coba lagi nanti.");
        setIsSubmittingPassword(false);
        return;
      }
      setPasswordSuccess(true);
      setPasswordSaatIni("");
      setPasswordBaru("");
      setKonfirmasiPasswordBaru("");
    } catch {
      setPasswordError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
    } finally {
      setIsSubmittingPassword(false);
    }
  }

  // ---- Section 2 & 3: Notifikasi & Privasi (satu endpoint, PATCH per toggle) ----
  const [notifEmail, setNotifEmail] = useState(initialNotifEmail);
  const [notifWa, setNotifWa] = useState(initialNotifWa);
  const [tampilkanDiLeaderboard, setTampilkanDiLeaderboard] = useState(!initialOptOut);
  const [consentLeaderboardLokasi, setConsentLeaderboardLokasi] = useState(initialConsent);
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function patchPrivasi(field: string, value: boolean, apply: () => void, revert: () => void) {
    setPendingToggle(field);
    setToggleError(null);
    apply();
    try {
      const response = await fetch("/api/pengaturan/privasi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        revert();
        setToggleError(json.error ?? "Gagal menyimpan. Coba lagi nanti.");
      }
    } catch {
      revert();
      setToggleError("Gagal terhubung ke server.");
    } finally {
      setPendingToggle(null);
    }
  }

  // ---- Section 4: Unduh Data & Hapus Akun ----
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [hapusAkunModalOpen, setHapusAkunModalOpen] = useState(false);
  const [alasanHapus, setAlasanHapus] = useState("");
  const [isSubmittingHapus, setIsSubmittingHapus] = useState(false);
  const [hapusError, setHapusError] = useState<string | null>(null);
  const [permintaanHapusAkun, setPermintaanHapusAkun] = useState(initialPermintaan);
  const [tanggalPermintaanHapus, setTanggalPermintaanHapus] = useState(initialTanggalPermintaan);

  async function handleUnduhData() {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch("/api/pengaturan/unduh-data");
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        setDownloadError(json?.error ?? "Gagal mengunduh data. Coba lagi nanti.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "dimentoring-data-saya.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Gagal terhubung ke server.");
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleHapusAkun() {
    setIsSubmittingHapus(true);
    setHapusError(null);
    try {
      const response = await fetch("/api/pengaturan/hapus-akun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alasan: alasanHapus.trim() || undefined }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setHapusError(json.error ?? "Gagal mengirim permintaan. Coba lagi nanti.");
        setIsSubmittingHapus(false);
        return;
      }
      setPermintaanHapusAkun(true);
      setTanggalPermintaanHapus(new Date().toISOString());
      setHapusAkunModalOpen(false);
      setAlasanHapus("");
    } catch {
      setHapusError("Gagal terhubung ke server.");
    } finally {
      setIsSubmittingHapus(false);
    }
  }

  // ---- Section 5: Keluar ----
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Section 1: Akun & Keamanan */}
      <Card>
        <SectionTitle>Akun & Keamanan</SectionTitle>
        <form onSubmit={handleGantiPassword} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Password Saat Ini</label>
            <InputField
              type="password"
              size="md"
              value={passwordSaatIni}
              onChange={(e) => setPasswordSaatIni(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Password Baru</label>
            <InputField
              type="password"
              size="md"
              value={passwordBaru}
              onChange={(e) => setPasswordBaru(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Konfirmasi Password Baru</label>
            <InputField
              type="password"
              size="md"
              value={konfirmasiPasswordBaru}
              onChange={(e) => setKonfirmasiPasswordBaru(e.target.value)}
            />
          </div>
          {passwordError ? <p className="text-sm text-[#E70A0A]">{passwordError}</p> : null}
          {passwordSuccess ? <p className="text-sm text-[#0CBA00]">Password berhasil diganti.</p> : null}
          <div>
            <Button type="submit" variant="primary" size="md" disabled={isSubmittingPassword}>
              {isSubmittingPassword ? "Menyimpan..." : "Ganti Password"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Section 2: Notifikasi */}
      <Card>
        <SectionTitle>Notifikasi</SectionTitle>
        <p className="text-xs text-[#7E7C7C] sm:text-sm">
          Preferensi ini akan dipakai begitu sistem notifikasi otomatis aktif sepenuhnya.
        </p>
        <ToggleRow
          label="Notifikasi Email"
          description="Terima info penting lewat email."
          checked={notifEmail}
          disabled={pendingToggle === "notifEmail"}
          onToggle={() => {
            const next = !notifEmail;
            patchPrivasi(
              "notifEmail",
              next,
              () => setNotifEmail(next),
              () => setNotifEmail(!next),
            );
          }}
        />
        <ToggleRow
          label="Notifikasi WhatsApp"
          description="Terima info penting lewat WhatsApp."
          checked={notifWa}
          disabled={pendingToggle === "notifWa"}
          onToggle={() => {
            const next = !notifWa;
            patchPrivasi(
              "notifWa",
              next,
              () => setNotifWa(next),
              () => setNotifWa(!next),
            );
          }}
        />
        {toggleError ? <p className="text-sm text-[#E70A0A]">{toggleError}</p> : null}
      </Card>

      {/* Section 3: Privasi — disembunyikan untuk Admin */}
      {role !== "admin" ? (
        <Card>
          <SectionTitle>Privasi</SectionTitle>
          <ToggleRow
            label="Tampilkan saya di leaderboard publik"
            description="Kalau dimatikan, skor dan poin kamu tetap tersimpan tapi tidak muncul di ranking yang bisa dilihat orang lain."
            checked={tampilkanDiLeaderboard}
            disabled={pendingToggle === "tampilkanDiLeaderboard"}
            onToggle={() => {
              const next = !tampilkanDiLeaderboard;
              patchPrivasi(
                "tampilkanDiLeaderboard",
                next,
                () => setTampilkanDiLeaderboard(next),
                () => setTampilkanDiLeaderboard(!next),
              );
            }}
          />
          <ToggleRow
            label="Izinkan leaderboard berdasarkan lokasi (kota/provinsi)"
            description="Fitur ranking per kota/provinsi akan hadir di masa depan — izin ini disiapkan dari sekarang."
            checked={consentLeaderboardLokasi}
            disabled={pendingToggle === "consentLeaderboardLokasi"}
            onToggle={() => {
              const next = !consentLeaderboardLokasi;
              patchPrivasi(
                "consentLeaderboardLokasi",
                next,
                () => setConsentLeaderboardLokasi(next),
                () => setConsentLeaderboardLokasi(!next),
              );
            }}
          />
        </Card>
      ) : null}

      {/* Section 4: Data Saya */}
      <Card>
        <SectionTitle>Data Saya</SectionTitle>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-black">Unduh salinan data kamu di Dimentoring dalam format JSON.</p>
          <div>
            <Button type="button" variant="secondary" size="md" onClick={handleUnduhData} disabled={isDownloading}>
              {isDownloading ? "Menyiapkan..." : "Unduh Data Saya"}
            </Button>
          </div>
          {downloadError ? <p className="text-sm text-[#E70A0A]">{downloadError}</p> : null}
          <Link href="/kebijakan-privasi" target="_blank" rel="noopener noreferrer" className="text-sm text-[#081EEA] underline underline-offset-2">
            Baca Kebijakan Privasi lengkap
          </Link>
        </div>

        <div className="flex flex-col gap-2 border-t border-[#E3E3E3] pt-5">
          {permintaanHapusAkun ? (
            <p className="text-sm text-[#7E7C7C]">
              Permintaan hapus akun kamu sedang diproses
              {tanggalPermintaanHapus ? ` sejak ${formatTanggalIndonesia(tanggalPermintaanHapus)}` : ""}.
            </p>
          ) : (
            <>
              <p className="text-sm text-black">
                Hapus akun kamu secara permanen. Tim kami akan proses permintaan ini secara manual.
              </p>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  className="border-[#E70A0A] text-[#E70A0A] drop-shadow-[2px_2px_0px_#E70A0A]"
                  onClick={() => setHapusAkunModalOpen(true)}
                >
                  Hapus Akun
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Section 5: Keluar */}
      <Card>
        <SectionTitle>Keluar</SectionTitle>
        <div>
          <Button type="button" variant="secondary" size="md" onClick={() => setLogoutModalOpen(true)}>
            Keluar dari Akun
          </Button>
        </div>
      </Card>

      <Modal open={hapusAkunModalOpen} onClose={() => setHapusAkunModalOpen(false)}>
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-black">Hapus Akun</h3>
          <p className="text-sm text-[#7E7C7C]">
            Permintaan ini diproses tim kami secara manual, bukan penghapusan instan. Akun kamu tetap aktif sampai
            proses selesai.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Alasan (opsional)</label>
            <textarea
              rows={4}
              value={alasanHapus}
              onChange={(e) => setAlasanHapus(e.target.value)}
              placeholder="Ceritakan alasan kamu (opsional)"
              className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black transition-colors outline-none placeholder:text-[#AFAFAF] focus:border-black sm:px-5 sm:py-3 sm:text-base"
            />
          </div>
          {hapusError ? <p className="text-sm text-[#E70A0A]">{hapusError}</p> : null}
          <div className="flex w-full gap-3">
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={() => setHapusAkunModalOpen(false)}
              disabled={isSubmittingHapus}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex-1"
              onClick={handleHapusAkun}
              disabled={isSubmittingHapus}
            >
              {isSubmittingHapus ? "Mengirim..." : "Kirim Permintaan Hapus"}
            </Button>
          </div>
        </div>
      </Modal>

      <LogoutConfirmModal open={logoutModalOpen} onClose={() => setLogoutModalOpen(false)} />
    </div>
  );
}
