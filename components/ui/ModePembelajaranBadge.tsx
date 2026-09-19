import { MODE_PEMBELAJARAN_LABEL } from "@/lib/shared/kelasLabels";

/**
 * Badge kecil "Online"/"Offline (Tatap Muka)" — dipakai di sisi Siswa (card
 * /program, Rekomendasi Kelas, Kelas Saya, detail kelas publik & terdaftar)
 * supaya mode pembelajaran kelas kelihatan sekilas tanpa buka detail. Warna
 * beda per mode biar gampang dibedakan: Online pakai biru brand (sama seperti
 * badge tipe_kelas di KelasCardMeta), Offline pakai ungu (sama seperti badge
 * kategori/intensif di KelasCardVisual) — reuse token warna yang sudah ada,
 * bukan warna baru.
 */
export default function ModePembelajaranBadge({ modePembelajaran }: { modePembelajaran: string }) {
  const isOffline = modePembelajaran === "offline";
  const label = MODE_PEMBELAJARAN_LABEL[modePembelajaran] ?? modePembelajaran;

  return (
    <span
      className={[
        "inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        isOffline ? "bg-[#EDE9FE] text-[#6D28D9]" : "bg-[#F9FAFF] text-[#081EEA]",
      ].join(" ")}
    >
      {label}
    </span>
  );
}
