import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import PageTitle from "@/components/dashboard/PageTitle";
import Button from "@/components/ui/Button";
import DaftarBatchImpor from "@/components/admin/DaftarBatchImpor";
import TabStudioSoal from "@/components/admin/TabStudioSoal";
import { CHIP, KARTU, pesanKelas } from "@/components/studio-soal/gaya";
import { requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { getBankSoal, getBatchImpor, getOpsiFilter } from "@/lib/admin/bankSoal";
import { PER_HALAMAN, STATUS_FILTER, parseFilterBank, queryFilter } from "@/lib/shared/studio-soal/bankSoal";
import { LABEL_KESULITAN, LABEL_TIPE } from "@/lib/shared/studio-soal/formSoal";
import { LABEL_STATUS_SOAL, type StatusSoal } from "@/lib/shared/studio-soal/studioMentor";
import { formatTanggalSoal } from "@/lib/shared/studio-soal/tanggalSoal";
import { TINGKAT_KESULITAN, TIPE_SOAL, type TipeSoal } from "@/lib/shared/studio-soal/tipe";

const ISIAN = "w-full rounded-[12px] border border-subtle bg-white px-3 py-2 text-sm text-black outline-none focus:border-primary";

function Pilih({ nama, label, nilai, pilihan }: { nama: string; label: string; nilai: string; pilihan: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-black">
      {label}
      <select name={nama} defaultValue={nilai} className={`${ISIAN} font-normal`}>
        <option value="">Semua</option>
        {pilihan.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

/** "Bank Soal" (Admin) — daftar soal dengan filter, dan batch impor soal Buatan Sendiri. */
export default async function BankSoalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(cookie);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }
  const auth = await requireAdminAktif(cookie);
  const filter = parseFilterBank(await searchParams);
  const [daftar, opsi, batch] = auth.ok
    ? await Promise.all([getBankSoal(filter), getOpsiFilter(), getBatchImpor()])
    : (["gagal", "gagal", "gagal"] as const);

  const galat = (teks: string) => (
    <p role="alert" className={pesanKelas("gagal")}>
      {teks}
    </p>
  );

  return (
    <>
      <PageTitle value="Bank Soal" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <TabStudioSoal aktif="/bank-soal" />
        {!auth.ok ? (
          galat(auth.error)
        ) : (
          <>
            {opsi === "gagal" || daftar === "gagal" ? (
              galat("Daftar soal belum bisa dimuat. Muat ulang halaman sebentar lagi.")
            ) : (
              <section className={KARTU}>
                <h2 className="text-lg font-medium text-black">Soal</h2>
                {/* Form GET biasa: filter tersimpan di alamat halaman. key = isi ulang saat filter berubah. */}
                <form key={queryFilter(filter, { hal: 1 })} method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Pilih nama="subtes" label="Subtes" nilai={filter.subtes} pilihan={opsi.subtes.map((s) => [s.id, s.nama])} />
                  <Pilih
                    nama="topik"
                    label="Topik"
                    nilai={filter.topik}
                    pilihan={opsi.topik
                      .filter((t) => !filter.subtes || t.subtes_id === filter.subtes)
                      .map((t) => [t.id, `${t.nama} (${opsi.subtes.find((s) => s.id === t.subtes_id)?.nama ?? "—"})`])}
                  />
                  <Pilih nama="jenis" label="Jenis" nilai={filter.jenis} pilihan={TIPE_SOAL.map((t) => [t, LABEL_TIPE[t]])} />
                  <Pilih
                    nama="kesulitan"
                    label="Kesulitan"
                    nilai={filter.kesulitan}
                    pilihan={TINGKAT_KESULITAN.map((t) => [t, LABEL_KESULITAN[t]])}
                  />
                  <Pilih nama="status" label="Status" nilai={filter.status} pilihan={STATUS_FILTER.map((s) => [s, LABEL_STATUS_SOAL[s]])} />
                  <Pilih
                    nama="batch"
                    label="Batch impor"
                    nilai={filter.batch}
                    pilihan={opsi.batch.map((b) => [b.id, `${b.nama_berkas || "(tanpa nama)"} · ${formatTanggalSoal(b.dibuat_pada)}`])}
                  />
                  <label className="flex flex-col gap-1 text-sm font-medium text-black sm:col-span-2">
                    Cari di redaksi
                    <input type="search" name="q" defaultValue={filter.q} maxLength={200} className={`${ISIAN} font-normal`} />
                  </label>
                  <div className="flex items-end gap-3">
                    <Button type="submit" size="sm">
                      Terapkan
                    </Button>
                    <Link href="/bank-soal" className="py-2 text-sm text-primary hover:underline">
                      Hapus filter
                    </Link>
                  </div>
                </form>

                <p className="text-sm text-muted">{daftar.total} soal</p>
                {daftar.baris.length === 0 ? (
                  <p className="text-sm text-muted">Tidak ada soal yang cocok.</p>
                ) : (
                  <div className="max-w-full overflow-x-auto">
                    <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-line text-muted">
                          {["Soal", "Subtes", "Topik", "Jenis", "Kesulitan", "Status", "Batch", "Dibuat"].map((j) => (
                            <th key={j} scope="col" className="py-2 pr-3 font-medium">
                              {j}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {daftar.baris.map((s) => (
                          <tr key={s.id} className="border-b border-chip align-top last:border-b-0">
                            <td className="max-w-[320px] py-2 pr-3">
                              <Link href={`/bank-soal/${s.id}`} className="break-words text-primary hover:underline">
                                {s.redaksi}
                              </Link>
                              {s.sumber !== "buatan_sendiri" ? <span className={`${CHIP} mt-1 block`}>Buatan mentor</span> : null}
                            </td>
                            <td className="py-2 pr-3">{s.subtes}</td>
                            <td className="py-2 pr-3">{s.topik ?? "—"}</td>
                            <td className="py-2 pr-3">{LABEL_TIPE[s.tipe as TipeSoal] ?? s.tipe}</td>
                            <td className="py-2 pr-3">{LABEL_KESULITAN[s.kesulitan] ?? s.kesulitan}</td>
                            <td className="py-2 pr-3">
                              {LABEL_STATUS_SOAL[s.status as StatusSoal] ?? s.status}
                              {s.versi > 1 ? <span className="block text-xs text-muted">versi {s.versi}</span> : null}
                            </td>
                            <td className="max-w-[160px] break-all py-2 pr-3">{s.batch ?? "—"}</td>
                            <td className="whitespace-nowrap py-2 pr-3">{formatTanggalSoal(s.dibuatPada)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {daftar.jumlahHalaman > 1 ? (
                  <nav aria-label="Halaman" className="flex items-center justify-between gap-3 text-sm">
                    {daftar.hal > 1 ? (
                      <Link href={`/bank-soal${queryFilter(filter, { hal: daftar.hal - 1 })}`} className="text-primary hover:underline">
                        ← Sebelumnya
                      </Link>
                    ) : (
                      <span />
                    )}
                    <span className="text-muted">
                      Halaman {daftar.hal} dari {daftar.jumlahHalaman} ({PER_HALAMAN} per halaman)
                    </span>
                    {daftar.hal < daftar.jumlahHalaman ? (
                      <Link href={`/bank-soal${queryFilter(filter, { hal: daftar.hal + 1 })}`} className="text-primary hover:underline">
                        Berikutnya →
                      </Link>
                    ) : (
                      <span />
                    )}
                  </nav>
                ) : null}
              </section>
            )}
            {batch === "gagal" ? galat("Daftar batch belum bisa dimuat. Muat ulang halaman sebentar lagi.") : <DaftarBatchImpor batch={batch} />}
          </>
        )}
      </div>
    </>
  );
}
