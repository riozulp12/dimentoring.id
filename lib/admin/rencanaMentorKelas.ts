import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import {
  hitungPerubahanPasangan,
  pesanMentorTertahan,
  tentukanMentorTertahan,
  type PasanganKelas,
} from "@/lib/shared/lepasMentorKelas";
import {
  subtesPemicuBekukan,
  tentukanPembekuan,
  type BarisEnrollmentSubtes,
  type ItemBekukan,
} from "@/lib/shared/bekukanPemilik";

/**
 * Pemeriksaan sebelum menyimpan mentor-per-subtes sebuah kelas (PATCH /api/kelola-kelas/[id]).
 * Hanya MEMBACA — dipanggil SEBELUM penulisan apa pun supaya penolakan tidak meninggalkan
 * perubahan setengah jalan.
 *
 * Penjaga lepas mentor: mentor yang dilepas dari sebuah subtes di kelas ini ditahan (409) selama
 * masih tercatat sebagai penerima (enrollment_subtes.mentor_id) siswa kelas ini pada subtes itu.
 * Gagal baca di mana pun = 500 fail-closed.
 */

export type HasilPeriksaMentorKelas =
  | { ok: true; lama: PasanganKelas[]; dilepas: PasanganKelas[]; ditambah: PasanganKelas[] }
  | { ok: false; status: 409 | 500; error: string };

const GAGAL_BACA = "Gagal memeriksa mentor kelas. Coba lagi nanti.";

export async function periksaLepasMentorKelas(kelasId: string, pasanganBaru: PasanganKelas[]): Promise<HasilPeriksaMentorKelas> {
  const lamaRes = await supabaseServer.from("kelas_subtes_mentor").select("subtes_id, mentor_id").eq("kelas_id", kelasId);
  if (lamaRes.error) {
    console.error("[rencanaMentorKelas] query kelas_subtes_mentor failed:", lamaRes.error);
    return { ok: false, status: 500, error: GAGAL_BACA };
  }
  const lama: PasanganKelas[] = ((lamaRes.data ?? []) as { subtes_id: string; mentor_id: string }[]).map((r) => ({
    subtesId: r.subtes_id,
    mentorId: r.mentor_id,
  }));

  const { dilepas, ditambah } = hitungPerubahanPasangan(lama, pasanganBaru);
  if (dilepas.length === 0) return { ok: true, lama, dilepas, ditambah };

  // Siswa kelas ini (SEMUA status — konservatif) lalu pilihan-subtes mereka yang penerimanya mentor yang dilepas.
  const enrollmentRes = await supabaseServer.from("enrollments").select("id").eq("kelas_id", kelasId);
  if (enrollmentRes.error) {
    console.error("[rencanaMentorKelas] query enrollments failed:", enrollmentRes.error);
    return { ok: false, status: 500, error: GAGAL_BACA };
  }
  const enrollmentIds = ((enrollmentRes.data ?? []) as { id: string }[]).map((r) => r.id);
  if (enrollmentIds.length === 0) return { ok: true, lama, dilepas, ditambah };

  const mentorDilepas = Array.from(new Set(dilepas.map((p) => p.mentorId)));
  const subtesDilepas = Array.from(new Set(dilepas.map((p) => p.subtesId)));
  const pemegangRes = await supabaseServer
    .from("enrollment_subtes")
    .select("subtes_id, mentor_id")
    .in("enrollment_id", enrollmentIds)
    .in("mentor_id", mentorDilepas)
    .in("subtes_id", subtesDilepas);
  if (pemegangRes.error) {
    console.error("[rencanaMentorKelas] query enrollment_subtes failed:", pemegangRes.error);
    return { ok: false, status: 500, error: GAGAL_BACA };
  }
  const pemegang: PasanganKelas[] = ((pemegangRes.data ?? []) as { subtes_id: string; mentor_id: string }[]).map((r) => ({
    subtesId: r.subtes_id,
    mentorId: r.mentor_id,
  }));

  // Nama dibaca hanya untuk pesan; bila gagal, tetap ditolak (pakai id sebagai nama cadangan).
  const namaMentor = new Map<string, string>();
  const namaSubtes = new Map<string, string>();
  const adaTertahan = tentukanMentorTertahan(dilepas, pemegang, namaMentor, namaSubtes).length > 0;
  if (!adaTertahan) return { ok: true, lama, dilepas, ditambah };

  const [mentorRes, subtesRes] = await Promise.all([
    supabaseServer.from("users").select("id, nama").in("id", mentorDilepas),
    supabaseServer.from("subtes").select("id, nama").in("id", subtesDilepas),
  ]);
  if (mentorRes.error || subtesRes.error) {
    console.error("[rencanaMentorKelas] query nama failed:", mentorRes.error ?? subtesRes.error);
  } else {
    for (const r of (mentorRes.data ?? []) as { id: string; nama: string }[]) namaMentor.set(r.id, r.nama);
    for (const r of (subtesRes.data ?? []) as { id: string; nama: string }[]) namaSubtes.set(r.id, r.nama);
  }

  const tertahan = tentukanMentorTertahan(dilepas, pemegang, namaMentor, namaSubtes);
  return { ok: false, status: 409, error: pesanMentorTertahan(tertahan) };
}

// ---------------------------------------------------------------------------
// Bekukan pemilik (B5) — lihat lib/shared/bekukanPemilik.ts untuk aturannya.
// ---------------------------------------------------------------------------

export type HasilRencanaBekukan = { ok: true; bekukan: ItemBekukan[] } | { ok: false; status: 500; error: string };

const GAGAL_BACA_BEKUKAN = "Gagal memeriksa pemilik siswa kelas. Coba lagi nanti.";

function kelompokkanPerSubtes(pasangan: PasanganKelas[], aktif: Set<string>): Map<string, string[]> {
  const peta = new Map<string, string[]>();
  for (const p of pasangan) {
    if (!aktif.has(p.mentorId)) continue;
    const daftar = peta.get(p.subtesId) ?? [];
    if (!daftar.includes(p.mentorId)) daftar.push(p.mentorId);
    peta.set(p.subtesId, daftar);
  }
  return peta;
}

/**
 * Hanya MEMBACA. Bila perubahan membuat pemegang AKTIF sebuah subtes naik dari 1 menjadi >=2,
 * kembalikan daftar enrollment_subtes (NULL, pendaftaran pada/setelah tanggal pemberlakuan)
 * yang harus dibekukan ke pemegang tunggal lama. Subtes tanpa siswa = daftar kosong.
 * Gagal baca = 500 (tidak ada yang ditulis).
 */
export async function rencanakanBekukanPemilik(
  kelasId: string,
  lama: PasanganKelas[],
  baru: PasanganKelas[],
): Promise<HasilRencanaBekukan> {
  const semuaMentor = Array.from(new Set([...lama, ...baru].map((p) => p.mentorId)));
  if (semuaMentor.length === 0) return { ok: true, bekukan: [] };

  const roleRes = await supabaseServer
    .from("user_roles")
    .select("user_id")
    .in("user_id", semuaMentor)
    .eq("role_type", "mentor")
    .eq("status", "active");
  if (roleRes.error) {
    console.error("[rencanaMentorKelas] query user_roles failed:", roleRes.error);
    return { ok: false, status: 500, error: GAGAL_BACA_BEKUKAN };
  }
  const aktif = new Set(((roleRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id));

  const pemicu = subtesPemicuBekukan(kelompokkanPerSubtes(lama, aktif), kelompokkanPerSubtes(baru, aktif));
  if (pemicu.size === 0) return { ok: true, bekukan: [] };

  const enrollmentRes = await supabaseServer.from("enrollments").select("id, tanggal_daftar").eq("kelas_id", kelasId);
  if (enrollmentRes.error) {
    console.error("[rencanaMentorKelas] query enrollments (bekukan) failed:", enrollmentRes.error);
    return { ok: false, status: 500, error: GAGAL_BACA_BEKUKAN };
  }
  const enrollments = (enrollmentRes.data ?? []) as { id: string; tanggal_daftar: string | null }[];
  if (enrollments.length === 0) return { ok: true, bekukan: [] }; // subtes tanpa siswa: tidak ada pembekuan
  const tanggalPer = new Map(enrollments.map((e) => [e.id, e.tanggal_daftar]));

  const subtesRes = await supabaseServer
    .from("enrollment_subtes")
    .select("id, enrollment_id, subtes_id, mentor_id")
    .in("enrollment_id", enrollments.map((e) => e.id))
    .in("subtes_id", Array.from(pemicu.keys()));
  if (subtesRes.error) {
    console.error("[rencanaMentorKelas] query enrollment_subtes (bekukan) failed:", subtesRes.error);
    return { ok: false, status: 500, error: GAGAL_BACA_BEKUKAN };
  }
  const baris: BarisEnrollmentSubtes[] = (
    (subtesRes.data ?? []) as { id: string; enrollment_id: string; subtes_id: string; mentor_id: string | null }[]
  ).map((r) => ({
    id: r.id,
    subtesId: r.subtes_id,
    mentorId: r.mentor_id ?? null,
    tanggalDaftar: tanggalPer.get(r.enrollment_id) ?? null,
  }));

  return { ok: true, bekukan: tentukanPembekuan(pemicu, baris) };
}

export type HasilSimpanAtomik = { ok: true; dibekukan: number } | { ok: false; status: 409 | 500; error: string };

/**
 * Simpan mentor kelas + bekukan pemilik dalam SATU transaksi database (fungsi SQL
 * simpan_mentor_kelas, db/add_rpc_simpan_mentor_kelas.sql): ganti kelas_mentor, ganti
 * kelas_subtes_mentor, dan isi mentor_id baris yang dibekukan — semuanya berhasil atau tidak sama sekali.
 * Dipakai HANYA bila ada yang perlu dibekukan; tanpa pembekuan simpan mentor memakai jalur biasa.
 */
export async function simpanMentorKelasAtomik(input: {
  kelasId: string;
  pasangan: PasanganKelas[];
  mentorIds: string[];
  bekukan: ItemBekukan[];
}): Promise<HasilSimpanAtomik> {
  const diterimaPada = new Date().toISOString(); // konvensi lib/mentor/terimaSiswa.ts
  const { data, error } = await supabaseServer.rpc("simpan_mentor_kelas", {
    p_kelas_id: input.kelasId,
    p_pasangan: input.pasangan.map((p) => ({ subtes_id: p.subtesId, mentor_id: p.mentorId })),
    p_mentor_ids: input.mentorIds,
    p_bekukan: input.bekukan.map((b) => ({ id: b.id, mentor_id: b.mentorId, diterima_pada: diterimaPada })),
  });
  if (error) {
    console.error("[rencanaMentorKelas] rpc simpan_mentor_kelas failed:", error);
    const belumDipasang = (error as { code?: string }).code === "PGRST202" || /Could not find the function/i.test(error.message ?? "");
    return {
      ok: false,
      status: 500,
      error: belumDipasang
        ? "Fungsi database simpan_mentor_kelas belum dipasang. Jalankan db/add_rpc_simpan_mentor_kelas.sql dulu. Tidak ada yang tersimpan."
        : "Gagal menyimpan mentor kelas. Tidak ada perubahan — coba lagi.",
    };
  }
  const hasil = data as { status?: string; dibekukan?: number } | null;
  if (hasil?.status === "ok") return { ok: true, dibekukan: hasil.dibekukan ?? 0 };
  if (hasil?.status === "mentor_masih_memegang_siswa") {
    return { ok: false, status: 409, error: "Ada mentor yang masih memegang siswa. Muat ulang halaman lalu coba lagi. Tidak ada yang tersimpan." };
  }
  console.error("[rencanaMentorKelas] rpc simpan_mentor_kelas status tak terduga:", hasil?.status);
  return { ok: false, status: 500, error: "Gagal menyimpan mentor kelas. Tidak ada perubahan — coba lagi." };
}
