import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getKelasForCheckout, isKelasSudahLunas } from "@/lib/payment/getKelasForCheckout";
import PageTitle from "@/components/dashboard/PageTitle";
import CheckoutForm from "@/components/siswa/CheckoutForm";

/**
 * Halaman Checkout — PRD Bagian 7.5/Bagian 13 (payments, kode_promo,
 * enrollments). Wajib login (guard di sini + (protected)/layout.tsx sudah
 * memastikan session ada). Harga kelas SELALU dibaca dari server di sini,
 * bukan dikirim dari client.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default async function CheckoutPage({ params }: { params: Promise<{ kelasId: string }> }) {
  const { kelasId } = await params;

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "student") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  if (!UUID_RE.test(kelasId)) {
    redirect(`/kelas?error=${encodeURIComponent("Kelas tidak ditemukan.")}`);
  }

  const kelas = await getKelasForCheckout(kelasId);
  if (!kelas) {
    redirect(`/kelas?error=${encodeURIComponent("Kelas tidak ditemukan.")}`);
  }

  if (await isKelasSudahLunas(session.userId, kelasId)) {
    redirect(`/kelas/${kelasId}`);
  }

  const snapClientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? "";
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";

  return (
    <>
      <PageTitle value="Checkout" />
      <div className="mx-auto flex w-full max-w-[700px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <div className="flex flex-col gap-1 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-black sm:text-2xl">{kelas.nama}</h1>
          <p className="text-base text-[#7E7C7C] sm:text-lg">{formatRupiah(kelas.harga)}</p>
        </div>

        <CheckoutForm
          kelasId={kelas.id}
          harga={kelas.harga}
          snapClientKey={snapClientKey}
          isProduction={isProduction}
        />
      </div>
    </>
  );
}
