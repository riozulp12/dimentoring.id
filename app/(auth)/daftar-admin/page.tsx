import Link from "next/link";
import Mascot from "@/components/ui/Mascot";
import { validateAdminInvitationToken } from "@/lib/admin/adminInvitations";
import DaftarAdminForm from "./DaftarAdminForm";

/**
 * Pendaftaran Admin via token undangan — PRD Bagian 8 BR-3. HALAMAN PUBLIC
 * (siapa saja bisa buka URL-nya), TAPI form cuma tampil kalau token valid —
 * validasi dilakukan di server SEBELUM render apa pun, jangan pernah
 * menampilkan form dulu baru validasi di client (BR-3 wajib server-side).
 */

export default async function DaftarAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invitation = token ? await validateAdminInvitationToken(token) : null;

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#F9FAFF] px-5 py-6 sm:px-8 md:px-10 lg:px-16 lg:py-8">
      <div className="flex w-full max-w-[1150px] items-center justify-center gap-10 xl:justify-between xl:gap-14">
        <div className="relative hidden shrink-0 items-center justify-center xl:flex xl:h-[560px] xl:w-[560px]">
          <div className="absolute inset-0 rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[9%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[18%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[27%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />

          <Mascot
            variant="Happy1"
            alt="Maskot Dimentoring menyambut Anda"
            className="relative h-[440px] w-auto -translate-x-12"
            priority
          />
        </div>

        <div className="flex w-full max-w-[500px] flex-col items-center gap-5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-6 py-6 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:rounded-[24px] sm:px-8 lg:gap-6 lg:rounded-[28px] lg:px-10 lg:py-8">
          {!invitation ? (
            <div className="flex w-full flex-col items-center gap-3 text-center">
              <h1 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl lg:text-2xl">
                Link Undangan Tidak Valid
              </h1>
              <p className="text-sm leading-[1.5] tracking-[-0.28px] text-[#7E7C7C] sm:text-base">
                Link undangan tidak valid atau sudah kadaluarsa. Hubungi Admin yang mengundang kamu untuk
                minta link baru.
              </p>
              <Link
                href="/login"
                className="mt-2 text-sm leading-[1.5] font-medium tracking-[-0.28px] text-[#081EEA] sm:text-base"
              >
                Ke Halaman Login
              </Link>
            </div>
          ) : (
            <DaftarAdminForm token={token as string} />
          )}
        </div>
      </div>
    </main>
  );
}
