import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { TRIAL_COOKIE_NAME } from "@/lib/assessment/trial";
import { getNavbarProps, type NavbarSessionProps } from "@/lib/dashboard/getNavbarProps";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";
import Mascot from "@/components/ui/Mascot";
import AssessmentHasilAccordions, {
  type AssessmentHasilData,
  type KelasRekomendasiData,
  type PilihanCardData,
  type TryoutRekomendasiData,
} from "./AssessmentHasilAccordions";

/**
 * Hasil Assessment SNBP — PRD Bagian 7.4.3 (direvisi): 1 card utama (Nilai
 * Akhir + Hasil Prediksi, selalu terbuka) + 4 accordion collapsible
 * (Rekomendasi Jurusan/Kelas/Paket Tryout/Note), Bagian 7.4.1b/BR-29
 * (akses anonim), BR-5 (akses hasil assessment rahasia).
 *
 * PENTING: halaman ini WAJIB public route (sama seperti /assessment) — TIDAK
 * boleh dipindah ke route group yang mewajibkan login, karena user anonim
 * dalam 2x trial gratis harus tetap bisa buka URL ini tanpa akun. Akses
 * sesungguhnya dikontrol manual di bawah (cek user_id/trial cookie), bukan
 * lewat middleware/layout auth guard.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

interface PtnJurusanJoin {
  nama_universitas: string;
  nama_jurusan: string;
  jenjang: string;
  tahun_data: number;
}

interface AssessmentPilihanRow {
  urutan_pilihan: number;
  keketatan_score: number;
  keketatan_label: string;
  peluang_score: number;
  peluang_label: string;
  ptn_jurusan: PtnJurusanJoin | PtnJurusanJoin[] | null;
}

function resolvePtnJurusan(row: AssessmentPilihanRow): PtnJurusanJoin | null {
  const value = row.ptn_jurusan;
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toPilihanCard(row: AssessmentPilihanRow): PilihanCardData | null {
  const ptnJurusan = resolvePtnJurusan(row);
  if (!ptnJurusan) return null;
  return {
    urutanPilihan: row.urutan_pilihan,
    jenjang: ptnJurusan.jenjang,
    namaJurusan: ptnJurusan.nama_jurusan,
    namaUniversitas: ptnJurusan.nama_universitas,
    keketatanScore: row.keketatan_score,
    keketatanLabel: row.keketatan_label,
    peluangScore: row.peluang_score,
    peluangLabel: row.peluang_label,
  };
}

function CenteredMessageState({
  title,
  description,
  navbarProps,
}: {
  title: string;
  description: string;
  navbarProps: NavbarSessionProps;
}) {
  return (
    <div className="flex w-full flex-col">
      <Navbar activeItem="cek-peluang" {...navbarProps} />
      <main className="mx-auto flex min-h-[60vh] w-full max-w-[1760px] flex-col items-center justify-center gap-4 px-5 py-20 text-center sm:px-8 md:px-12 lg:px-20">
        <Mascot variant="Confuse" alt="" className="h-24 w-auto sm:h-32" />
        <p className="text-lg font-semibold text-[#081EEA] sm:text-xl">{title}</p>
        <p className="max-w-md text-base text-[#7E7C7C] sm:text-lg">{description}</p>
      </main>
      <Footer />
    </div>
  );
}

export default async function AssessmentHasilPage({ params }: PageProps) {
  const { id } = await params;

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const trialId = cookieStore.get(TRIAL_COOKIE_NAME)?.value ?? null;
  const navbarProps = await getNavbarProps(session);

  if (!UUID_RE.test(id)) {
    return (
      <CenteredMessageState
        title="Hasil Tidak Ditemukan"
        description="Link hasil Assessment ini tidak valid. Coba isi ulang Assessment untuk dapat hasil baru."
        navbarProps={navbarProps}
      />
    );
  }

  const { data: assessment, error: assessmentError } = await supabaseServer
    .from("assessments")
    .select("id, user_id, anonymous_trial_id, rata_rata_rapor, nilai_prestasi, nilai_akhir, nilai_akhir_label, note_ai")
    .eq("id", id)
    .maybeSingle();

  if (assessmentError) {
    console.error("[assessment/hasil] query assessments failed:", assessmentError);
  }

  if (!assessment) {
    return (
      <CenteredMessageState
        title="Hasil Tidak Ditemukan"
        description="Hasil Assessment yang kamu cari tidak ditemukan. Coba isi ulang Assessment untuk dapat hasil baru."
        navbarProps={navbarProps}
      />
    );
  }

  // ---- Akses control (BR-5 revisi, Bagian 7.4.1b) ----
  const assessmentUserId = assessment.user_id as string | null;
  const anonymousTrialId = assessment.anonymous_trial_id as string | null;

  if (assessmentUserId) {
    if (!session || session.userId !== assessmentUserId) {
      const loginParams = new URLSearchParams({
        message: "Masuk dulu untuk lihat hasil ini",
        redirect: `/assessment/hasil/${id}`,
      });
      redirect(`/login?${loginParams.toString()}`);
    }
  } else if (!trialId || trialId !== anonymousTrialId) {
    // Cookie trial di browser ini tidak cocok (beda browser/cookie sudah dihapus) —
    // BR-5: tidak ada cara pihak lain mengakses hasil assessment anonim orang lain.
    return (
      <CenteredMessageState
        title="Hasil Ini Tidak Bisa Diakses Dari Sini"
        description="Hasil Assessment anonim hanya bisa dibuka lewat browser yang sama saat mengisinya. Isi ulang Assessment kalau kamu ingin lihat hasil baru di sini."
        navbarProps={navbarProps}
      />
    );
  }

  const isLoggedInOwner = Boolean(assessmentUserId);

  const [{ data: pilihanRows }, { data: rekomendasiRows }] = await Promise.all([
    supabaseServer
      .from("assessment_pilihan")
      .select(
        "urutan_pilihan, keketatan_score, keketatan_label, peluang_score, peluang_label, ptn_jurusan:ptn_jurusan_id(nama_universitas, nama_jurusan, jenjang, tahun_data)",
      )
      .eq("assessment_id", id)
      .eq("is_rekomendasi", false)
      .order("urutan_pilihan", { ascending: true }),
    supabaseServer
      .from("assessment_pilihan")
      .select(
        "urutan_pilihan, keketatan_score, keketatan_label, peluang_score, peluang_label, ptn_jurusan:ptn_jurusan_id(nama_universitas, nama_jurusan, jenjang, tahun_data)",
      )
      .eq("assessment_id", id)
      .eq("is_rekomendasi", true)
      .order("urutan_pilihan", { ascending: true }),
  ]);

  const hasilPrediksi = ((pilihanRows ?? []) as AssessmentPilihanRow[])
    .map(toPilihanCard)
    .filter((row): row is PilihanCardData => row !== null);
  const rekomendasiJurusan = ((rekomendasiRows ?? []) as AssessmentPilihanRow[])
    .map(toPilihanCard)
    .filter((row): row is PilihanCardData => row !== null);

  // Disclaimer (BR-4/FR-3.6) wajib tampilkan tahun data — ambil tahun TERBARU
  // di antara seluruh ptn_jurusan yang dipakai di hasil ini.
  const tahunData = [...((pilihanRows ?? []) as AssessmentPilihanRow[]), ...((rekomendasiRows ?? []) as AssessmentPilihanRow[])]
    .map((row) => resolvePtnJurusan(row)?.tahun_data)
    .reduce<number | null>((latest, tahun) => {
      if (typeof tahun !== "number") return latest;
      return latest === null || tahun > latest ? tahun : latest;
    }, null);

  // ---- Accordion 2: Rekomendasi Kelas — hanya untuk assessment yang sudah
  // ditautkan ke akun (butuh mapel_tersulit dari profil siswa). ----
  let kelasRekomendasi: KelasRekomendasiData[] = [];
  if (assessmentUserId) {
    const { data: mapelRows } = await supabaseServer
      .from("user_mapel_tersulit")
      .select("subtes_id")
      .eq("user_id", assessmentUserId);

    const subtesIds = (mapelRows ?? []).map((row) => row.subtes_id as string);
    if (subtesIds.length > 0) {
      const { data: kelasRows } = await supabaseServer
        .from("kelas")
        .select("id, nama, harga")
        .in("subtes_id", subtesIds)
        .order("nama", { ascending: true })
        .limit(3);

      kelasRekomendasi = (kelasRows ?? []).map((row) => ({
        id: row.id as string,
        nama: row.nama as string,
        harga: Number(row.harga),
      }));
    }
  }

  // ---- Accordion 3: Rekomendasi Paket Tryout ----
  // PLACEHOLDER FASE 1: skema belum punya pemetaan eksplisit ptn_jurusan/jurusan_tujuan
  // -> subtes tryout (tryout_kategori tidak punya nilai 'snbp'). Sebagai proxy yang
  // relevan lintas jalur, ambil paket tryout kategori 'tka' (kesiapan materi umum) —
  // perlu divalidasi/diganti tim akademik begitu pemetaan resmi tersedia.
  const keketatanLabelUtama = hasilPrediksi[0]?.keketatanLabel ?? rekomendasiJurusan[0]?.keketatanLabel ?? null;
  const { data: tryoutRows } = await supabaseServer
    .from("tryouts")
    .select("id, nama, tipe_akses")
    .eq("kategori", "tka")
    .order("created_at", { ascending: false })
    .limit(6);

  const tryoutRekomendasi: TryoutRekomendasiData[] = (tryoutRows ?? [])
    .slice()
    .sort((a, b) => (a.tipe_akses === b.tipe_akses ? 0 : a.tipe_akses === "free" ? -1 : 1))
    .slice(0, 3)
    .map((row) => ({
      id: row.id as string,
      nama: row.nama as string,
      tipeAkses: row.tipe_akses as "free" | "premium",
      alasan: keketatanLabelUtama
        ? `Direkomendasikan karena Keketatan pilihan ini ${keketatanLabelUtama} — latihan tryout membantu memperbesar Peluang.`
        : "Direkomendasikan untuk membantu memperbesar Peluang kamu.",
    }));

  // ---- CTA Daftar (item 4): tampil kalau hasil ini masih anonim (sudah pasti
  // trial 1/2 karena akses control di atas sudah memvalidasi cookie trial cocok). ----
  const hasilData: AssessmentHasilData = {
    rataRataRapor: assessment.rata_rata_rapor as number | null,
    nilaiPrestasi: assessment.nilai_prestasi as number | null,
    nilaiAkhir: assessment.nilai_akhir as number | null,
    nilaiAkhirLabel: assessment.nilai_akhir_label as string | null,
    noteAi: assessment.note_ai as string | null,
    hasilPrediksi,
    rekomendasiJurusan,
    isLoggedInOwner,
    kelasRekomendasi,
    tryoutRekomendasi,
    showDaftarCta: !assessmentUserId,
  };

  return (
    <div className="flex w-full flex-col">
      <Navbar activeItem="cek-peluang" {...navbarProps} />
      <main className="mx-auto flex w-full max-w-[1760px] flex-col gap-8 px-5 py-8 sm:gap-10 sm:px-8 sm:py-12 md:px-12 lg:gap-12 lg:px-20 lg:py-16 min-[1440px]:gap-14">
        <header className="flex flex-col gap-4 sm:gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold leading-[1.5] tracking-[-0.02em] text-[#081EEA] sm:text-3xl">
              Hasil Assessment Prediksi SNBP
            </h1>
            <p className="text-base text-[#7E7C7C] sm:text-lg">Jalur nilai raport dan prestasi</p>
          </div>

          <div className="flex w-full items-center gap-4 rounded-[24px] border border-[#FDD803] bg-[#FFF5BA] px-5 py-4 sm:gap-6 sm:rounded-[32px] sm:px-8">
            <p className="min-w-0 flex-1 text-sm leading-[1.5] tracking-[-0.02em] text-[#988101] sm:text-base">
              <span className="font-semibold">Disclaimer: </span>
              Hasil ini adalah estimasi berbasis data keketatan historis (tahun data: {tahunData ?? "-"}), bukan
              jaminan kelulusan. Kebijakan kampus & jumlah peminat tahun berjalan bisa berubah.
            </p>
            <Mascot variant="Guidance" alt="" className="hidden h-14 w-auto shrink-0 sm:block lg:h-16" />
          </div>
        </header>

        <AssessmentHasilAccordions data={hasilData} />
      </main>
      <Footer />
    </div>
  );
}
