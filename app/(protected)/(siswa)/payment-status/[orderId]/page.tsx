import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getPaymentStatusForUser } from "@/lib/payment/getPaymentStatus";
import PageTitle from "@/components/dashboard/PageTitle";
import PaymentStatusPoller from "@/components/siswa/PaymentStatusPoller";

/**
 * "Menunggu Konfirmasi" — PRD Bagian 13 (payments.status, order_id). Dituju
 * Snap.js onSuccess/onPending (lihat components/siswa/CheckoutForm.tsx) —
 * BUKAN halaman sukses; status final ditentukan di sini (polling) begitu
 * webhook Midtrans benar-benar mengonfirmasi (BR-19).
 */

export default async function PaymentStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ metode?: string }>;
}) {
  const { orderId } = await params;
  const { metode } = await searchParams;

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "student") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const payment = await getPaymentStatusForUser(orderId, session.userId);
  if (!payment) {
    redirect(`/kelas?error=${encodeURIComponent("Transaksi tidak ditemukan.")}`);
  }

  // Sudah beres bahkan sebelum halaman ini sempat dibuka (mis. webhook lebih
  // cepat dari redirect client) — langsung ke halaman kelas, tidak perlu
  // menampilkan "menunggu" sama sekali.
  if (payment.status === "berhasil") {
    redirect(`/kelas/${payment.itemId}?berhasil=1`);
  }

  return (
    <>
      <PageTitle value="Menunggu Konfirmasi" />
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <PaymentStatusPoller
          orderId={orderId}
          initialStatus={payment.status}
          kelasId={payment.itemId}
          kelasNama={payment.kelasNama}
          metode={metode ?? null}
        />
      </div>
    </>
  );
}
