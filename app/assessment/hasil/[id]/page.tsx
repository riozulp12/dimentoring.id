import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { TRIAL_COOKIE_NAME } from "@/lib/assessment/trial";
import { harusTampilLeadCapture, isLeadCaptureEnabled } from "@/lib/shared/leadCaptureFlag";
import { kalimatSaran, kalimatTanpaSaran, tingkatKeketatan, URUTAN_TINGKAT } from "@/lib/shared/saranJurusan";
import { CATATAN_CADANGAN, rapikanCatatan } from "@/lib/shared/catatanAssessment";
import {
  aksiKartuKelas,
  aksiTryout,
  pilihKelasUmum,
  type StatusKelasPengguna,
} from "@/lib/shared/saranProdukAssessment";
import { hitungHargaSetelahDiskon, normalizeDiskonPersen } from "@/lib/shared/kelasDiskon";
import { getNavbarProps, type NavbarSessionProps } from "@/lib/dashboard/getNavbarProps";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";
import Mascot from "@/components/ui/Mascot";
import AssessmentHasilAccordions, {
  type AssessmentHasilData,
  type KelasRekomendasiData,
  type PilihanCardData,
  type RekomendasiJurusanGroup,
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

const KELAS_SELECT = "id, nama, harga, diskon_persen, program_kategori, tingkat_kelas";

interface KelasQueryRow {
  id: string;
  nama: string;
  harga: number | string;
  diskon_persen: number | null;
  program_kategori: string;
  tingkat_kelas: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

interface PtnJurusanJoin {
  nama_universitas: string;
  nama_jurusan: string;
  jenjang: string;
  tahun_data: number;
  kuota_tahun_berjalan: number;
  jumlah_peminat_tahun_lalu: number;
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
    kuotaTahunBerjalan: ptnJurusan.kuota_tahun_berjalan,
    jumlahPeminatTahunLalu: ptnJurusan.jumlah_peminat_tahun_lalu,
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

  const [{ data: pilihanRows }, { data: rekomendasiRows }] = await Promise.all([
    supabaseServer
      .from("assessment_pilihan")
      .select(
        "urutan_pilihan, keketatan_score, keketatan_label, peluang_score, peluang_label, ptn_jurusan:ptn_jurusan_id(nama_universitas, nama_jurusan, jenjang, tahun_data, kuota_tahun_berjalan, jumlah_peminat_tahun_lalu)",
      )
      .eq("assessment_id", id)
      .eq("is_rekomendasi", false)
      .order("urutan_pilihan", { ascending: true }),
    supabaseServer
      .from("assessment_pilihan")
      .select(
        "urutan_pilihan, keketatan_score, keketatan_label, peluang_score, peluang_label, ptn_jurusan:ptn_jurusan_id(nama_universitas, nama_jurusan, jenjang, tahun_data, kuota_tahun_berjalan, jumlah_peminat_tahun_lalu)",
      )
      .eq("assessment_id", id)
      .eq("is_rekomendasi", true)
      .order("urutan_pilihan", { ascending: true }),
  ]);

  const hasilPrediksi = ((pilihanRows ?? []) as AssessmentPilihanRow[])
    .map(toPilihanCard)
    .filter((row): row is PilihanCardData => row !== null);

  // Rekomendasi Jurusan (DIREVISI, per-pilihan): backend menyimpan
  // urutan_pilihan baris rekomendasi = urutan PILIHAN ASAL-nya (bukan index
  // rekomendasi sendiri), lihat app/api/assessment/snbp/route.ts — jadi
  // tinggal di-map balik ke tiap pilihan siswa. Satu grup per pilihan siswa
  // (1 atau 2), `rekomendasi: null` kalau pilihan itu tidak dapat kandidat
  // qualify — TIDAK menyembunyikan grup pilihan lain yang masih dapat.
  const rekomendasiByAsal = new Map(
    ((rekomendasiRows ?? []) as AssessmentPilihanRow[])
      .map(toPilihanCard)
      .filter((row): row is PilihanCardData => row !== null)
      .map((row) => [row.urutanPilihan, row]),
  );
  const rekomendasiJurusan: RekomendasiJurusanGroup[] = hasilPrediksi.map((pilihan) => {
    const rekomendasi = rekomendasiByAsal.get(pilihan.urutanPilihan) ?? null;
    // Alasan kosong diturunkan dari tingkat keketatan pilihan itu sendiri
    // (lib/shared/saranJurusan.ts): paling longgar = memang tidak dicarikan.
    const sudahPalingLonggar = tingkatKeketatan(pilihan.keketatanScore) >= URUTAN_TINGKAT.length - 1;
    return {
      pilihanAsalUrutan: pilihan.urutanPilihan,
      rekomendasi,
      keterangan: rekomendasi
        ? kalimatSaran(pilihan, rekomendasi)
        : kalimatTanpaSaran(sudahPalingLonggar ? "sudah_paling_longgar" : "tidak_ada_kandidat"),
    };
  });

  // Disclaimer (BR-4/FR-3.6) wajib tampilkan tahun data — ambil tahun TERBARU
  // di antara seluruh ptn_jurusan yang dipakai di hasil ini.
  const tahunData = [...((pilihanRows ?? []) as AssessmentPilihanRow[]), ...((rekomendasiRows ?? []) as AssessmentPilihanRow[])]
    .map((row) => resolvePtnJurusan(row)?.tahun_data)
    .reduce<number | null>((latest, tahun) => {
      if (typeof tahun !== "number") return latest;
      return latest === null || tahun > latest ? tahun : latest;
    }, null);

  // ---- Accordion 2: Saran Kelas (revisi v2) — tampil untuk SEMUA pengunjung.
  // Personal (mapel tersulit) kalau hasil ini milik akun dan ada kecocokan;
  // selain itu kelas umum persiapan PTN dari katalog. Kartu hanya membuka
  // detail publik (alur beli & login ada di sana), lihat
  // lib/shared/saranProdukAssessment.ts. ----
  let kelasRows: KelasQueryRow[] = [];
  let kelasPersonal = false;
  if (assessmentUserId) {
    const { data: mapelRows } = await supabaseServer
      .from("user_mapel_tersulit")
      .select("subtes_id")
      .eq("user_id", assessmentUserId);

    const subtesIds = (mapelRows ?? []).map((row) => row.subtes_id as string);
    if (subtesIds.length > 0) {
      const { data } = await supabaseServer
        .from("kelas")
        .select(KELAS_SELECT)
        .eq("tampil_di_katalog", true)
        .in("subtes_id", subtesIds)
        .order("nama", { ascending: true })
        .limit(3);
      kelasRows = (data ?? []) as KelasQueryRow[];
      kelasPersonal = kelasRows.length > 0;
    }
  }
  if (kelasRows.length === 0) {
    const { data, error } = await supabaseServer
      .from("kelas")
      .select(KELAS_SELECT)
      .eq("tampil_di_katalog", true)
      .limit(50);
    if (error) console.error("[assessment/hasil] query kelas umum failed:", error);
    kelasRows = pilihKelasUmum(
      ((data ?? []) as KelasQueryRow[]).map((row) => ({
        ...row,
        programKategori: row.program_kategori,
        tingkatKelas: row.tingkat_kelas,
      })),
    );
  }

  // Status kepemilikan PENGUNJUNG (bukan pemilik hasil) supaya kelas yang
  // sudah dibeli tidak ditawarkan ulang.
  const statusKelasById = new Map<string, StatusKelasPengguna>();
  if (session && kelasRows.length > 0) {
    const { data: enrollmentRows, error: enrollmentError } = await supabaseServer
      .from("enrollments")
      .select("kelas_id, status_pembayaran")
      .eq("user_id", session.userId)
      .in(
        "kelas_id",
        kelasRows.map((row) => row.id),
      );
    if (enrollmentError) console.error("[assessment/hasil] query enrollments failed:", enrollmentError);
    for (const row of enrollmentRows ?? []) {
      statusKelasById.set(row.kelas_id as string, row.status_pembayaran as StatusKelasPengguna);
    }
  }

  const kelasRekomendasi: KelasRekomendasiData[] = kelasRows.map((row) => {
    const harga = Number(row.harga);
    const aksi = aksiKartuKelas(row.id, statusKelasById.get(row.id) ?? null);
    return {
      id: row.id,
      nama: row.nama,
      harga: hitungHargaSetelahDiskon(harga, normalizeDiskonPersen(row.diskon_persen)),
      href: aksi.href,
      labelAksi: aksi.label,
      status: aksi.status,
    };
  });

  // ---- Accordion 3: Try Out (revisi v2). Try Out berjalan di portal partner
  // lewat /tryout (SSO); tabel `tryouts` di sini belum dipakai dan tidak ada
  // halaman detail per paket, jadi yang ditampilkan satu kartu jujur menuju
  // /tryout. Tamu diarahkan ke login lalu kembali ke /tryout. Dimentoring
  // belum menyimpan data kepemilikan paket tryout, jadi status beli tidak
  // bisa ditampilkan di sini. ----
  const tryoutAksi = aksiTryout(Boolean(session));

  // ---- Lead Capture (PRD 7.4.6, BR-38): hanya kalau bendera
  // NEXT_PUBLIC_LEAD_CAPTURE_ENABLED aktif; tamu, atau user login yang belum
  // punya no_wa. "Sudah terkirim" = sudah ada lead untuk assessment ini. ----
  const leadCaptureEnabled = isLeadCaptureEnabled();
  let userPunyaNoWa = false;
  if (leadCaptureEnabled && assessmentUserId) {
    const { data: userRow } = await supabaseServer
      .from("users")
      .select("no_wa")
      .eq("id", assessmentUserId)
      .maybeSingle();
    // Baris user tidak ditemukan -> jangan tampilkan (sama seperti punya nomor).
    userPunyaNoWa = !userRow || Boolean(userRow.no_wa);
  }
  const showLeadCapture = harusTampilLeadCapture({
    enabled: leadCaptureEnabled,
    milikUserLogin: Boolean(assessmentUserId),
    userPunyaNoWa,
  });
  let leadSudahTerkirim = false;
  if (showLeadCapture) {
    const { data: leadRow, error: leadError } = await supabaseServer
      .from("leads")
      .select("id")
      .eq("assessment_id", id)
      .limit(1)
      .maybeSingle();
    if (leadError) console.error("[assessment/hasil] query leads failed:", leadError);
    leadSudahTerkirim = Boolean(leadRow);
  }

  // ---- CTA Daftar (item 4): tampil kalau hasil ini masih anonim (sudah pasti
  // trial 1/2 karena akses control di atas sudah memvalidasi cookie trial cocok). ----
  const hasilData: AssessmentHasilData = {
    rataRataRapor: assessment.rata_rata_rapor as number | null,
    nilaiPrestasi: assessment.nilai_prestasi as number | null,
    nilaiAkhir: assessment.nilai_akhir as number | null,
    nilaiAkhirLabel: assessment.nilai_akhir_label as string | null,
    // Penyaring gaya juga dijalankan saat tampil, supaya catatan lama (dibuat
    // sebelum penyaring ada) ikut rapi. Aman dijalankan berulang.
    noteAi: rapikanCatatan((assessment.note_ai as string | null) ?? CATATAN_CADANGAN),
    hasilPrediksi,
    rekomendasiJurusan,
    kelasRekomendasi,
    kelasPersonal,
    tryoutAksi,
    isGuest: !session,
    showDaftarCta: !assessmentUserId,
    assessmentId: id,
    showLeadCapture,
    leadSudahTerkirim,
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
