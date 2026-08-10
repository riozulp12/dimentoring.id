import type { Metadata } from "next";
import VerifikasiClient from "./VerifikasiClient";

export const metadata: Metadata = {
  title: "Verifikasi Akun | Dimentoring.id",
};

export default async function VerifikasiPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;

  return <VerifikasiClient email={params.email ?? ""} />;
}
