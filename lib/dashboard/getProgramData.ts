import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import {
  PROGRAM_KATEGORI_LABEL,
  PROGRAM_KATEGORI_ORDER,
  PROGRAM_KATEGORI_SLUG,
  TINGKAT_KELAS_LABEL,
  TIPE_KELAS_LABEL,
  MODE_PEMBELAJARAN_LABEL,
  type ProgramKategori,
} from "@/lib/shared/kelasLabels";
import { formatJadwalRingkas } from "@/lib/shared/formatJadwal";
import { hitungHargaSetelahDiskon, normalizeDiskonPersen } from "@/lib/shared/kelasDiskon";
import { hitungKapasitasKelas, tandaiPendaftaranDitutup, type KapasitasKelas } from "@/lib/shared/kapasitasKelas";
import { hitungKetersediaanKelas } from "@/lib/jadwal/slotTerisi";

// jadwal, jadwal_pilih_siswa, subtes_id: dasar kapasitas otomatis kelas private (lib/shared/kapasitasKelas.ts).
export const KELAS_CARD_SELECT =
  "id, nama, tipe_kelas, mode_pembelajaran, jumlah_sesi, harga, diskon_persen, kapasitas, deskripsi, program_kategori, tingkat_kelas, link_lynkid, jadwal, jadwal_pilih_siswa, subtes_id, pendaftaran_ditutup, subtes:subtes_id(nama), mentor:mentor_id(nama)";

/**
 * Data layer halaman publik /program (PRD Bagian 4.3 poin 5, 7.5.4) — 5
 * kategori bisnis kelas, terpisah dari lib/admin/getKelolaKelasData.ts yang
 * khusus Admin (butuh field CRUD, bukan cuma tampilan publik).
 */

/** Diskon yang MELEKAT ke kelas (`kelas.diskon_persen`) — ikut terlihat di harga
 * kartu (harga coret) dan di checkout. Label: "Diskon X%". */
export interface DiskonAktif {
  label: string;
}

export interface KelasCardPreview {
  id: string;
  nama: string;
  tipeKelas: string;
  tipeKelasLabel: string;
  modePembelajaran: string;
  modePembelajaranLabel: string;
  harga: number;
  /** `kelas.diskon_persen` (0-100) — diskon yang MELEKAT ke kelas (tanpa kode
   * promo). 0 = tidak ada diskon, tampilan harga tetap seperti biasa. */
  diskonPersen: number;
  /** harga * (1 - diskonPersen/100), dibulatkan ke rupiah terdekat. Sama
   * dengan `harga` kalau diskonPersen = 0 — card/detail cukup bandingkan
   * diskonPersen > 0 untuk memutuskan tampil harga coret atau tidak. */
  hargaSetelahDiskon: number;
  mentorNama: string | null;
  /** kelas.jumlah_sesi — dasar "Mulai dari" kartu private online (lib/shared/kartuHargaMulai.ts). */
  jumlahSesi?: number | null;
  /** Diskon kelas sendiri (null kalau diskonPersen = 0). Kode promo TIDAK pernah menghasilkan ribbon. */
  diskonAktif: DiskonAktif | null;
  /** SATU sumber kapasitas/penuh/hampir habis (lib/shared/kapasitasKelas.ts). */
  kapasitasInfo: KapasitasKelas;
  deskripsi: string | null;
  programKategori: string;
  tingkatKelas: string;
  subtesNama: string | null;
  /** kelas.link_lynkid ("Input Link Pendaftaran") — tujuan tombol Daftar
   * Sekarang kalau terisi, lihat lib/shared/kelasDaftarTarget.ts. */
  linkLynkid: string | null;
}

export interface ProgramSection {
  kategori: ProgramKategori;
  kategoriLabel: string;
  slug: string;
  items: KelasCardPreview[];
}

type NamaJoin = { nama: string } | { nama: string }[] | null;

function firstNama(value: NamaJoin): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  return row?.nama ?? null;
}

export interface KelasCardRow {
  id: string;
  nama: string;
  tipe_kelas: string;
  mode_pembelajaran: string;
  jumlah_sesi?: number | null;
  harga: number;
  diskon_persen: number | null;
  /** Opsional (boleh kosong) — lihat lib/shared/kapasitasKelas.ts. */
  kapasitas: number | null;
  /** kelas.pendaftaran_ditutup (db/add_pendaftaran_ditutup.sql) — true = tombol daftar dimatikan. */
  pendaftaran_ditutup?: boolean | null;
  deskripsi: string | null;
  program_kategori: string;
  tingkat_kelas: string;
  link_lynkid: string | null;
  jadwal?: unknown;
  jadwal_pilih_siswa?: boolean | null;
  subtes_id?: string | null;
  subtes: NamaJoin;
  mentor: NamaJoin;
}

export function toCardPreview(row: KelasCardRow, kapasitasInfo: KapasitasKelas): KelasCardPreview {
  const harga = Number(row.harga);
  const diskonPersen = normalizeDiskonPersen(row.diskon_persen);
  return {
    id: row.id,
    nama: row.nama,
    tipeKelas: row.tipe_kelas,
    tipeKelasLabel: TIPE_KELAS_LABEL[row.tipe_kelas] ?? row.tipe_kelas,
    modePembelajaran: row.mode_pembelajaran,
    modePembelajaranLabel: MODE_PEMBELAJARAN_LABEL[row.mode_pembelajaran] ?? row.mode_pembelajaran,
    harga,
    diskonPersen,
    hargaSetelahDiskon: hitungHargaSetelahDiskon(harga, diskonPersen),
    mentorNama: firstNama(row.mentor),
    jumlahSesi: typeof row.jumlah_sesi === "number" ? row.jumlah_sesi : null,
    // Ribbon "Diskon X%" HANYA untuk diskon yang ikut terlihat di harga kartu
    // (diskon_persen kelas). Kode promo (diketik di checkout) TIDAK pernah
    // menghasilkan ribbon/label apa pun di kartu.
    diskonAktif: diskonPersen > 0 ? { label: `Diskon ${diskonPersen}%` } : null,
    kapasitasInfo: tandaiPendaftaranDitutup(kapasitasInfo, row.pendaftaran_ditutup),
    deskripsi: row.deskripsi,
    programKategori: row.program_kategori,
    tingkatKelas: row.tingkat_kelas,
    subtesNama: firstNama(row.subtes),
    linkLynkid: row.link_lynkid,
  };
}

/**
 * Kapasitas per kelas (SATU aturan, lib/shared/kapasitasKelas.ts) untuk daftar kelas katalog.
 * Kelas private-online-saklar-1subtes: otomatis dari slot × mentor aktif; kelas lain: kapasitas manual
 * (kosong = tanpa batas). Galat baca → jatuh ke aturan kapasitas manual dengan 0 siswa (sama seperti perilaku
 * lama saat query enrollments gagal) — server (payment/create) tetap penjaga penjualan.
 */
export async function getKapasitasByKelasId(rows: KelasCardRow[]): Promise<Map<string, KapasitasKelas>> {
  const result = new Map<string, KapasitasKelas>();
  if (rows.length === 0) return result;

  const peta = await hitungKetersediaanKelas(
    rows.map((row) => ({
      id: row.id,
      tipe_kelas: row.tipe_kelas,
      mode_pembelajaran: row.mode_pembelajaran,
      jadwal_pilih_siswa: row.jadwal_pilih_siswa ?? null,
      jadwal: row.jadwal,
      kapasitas: typeof row.kapasitas === "number" ? row.kapasitas : null,
      subtes_id: row.subtes_id ?? null,
    })),
  );

  for (const row of rows) {
    result.set(
      row.id,
      peta?.get(row.id)?.kapasitas ??
        hitungKapasitasKelas({ kapasitasManual: typeof row.kapasitas === "number" ? row.kapasitas : null, lunas: 0, otomatis: null }),
    );
  }
  return result;
}

/**
 * SATU-SATUNYA pintu query "kelas yang tampil di katalog" — dipakai /program,
 * /program/[kategori], empty state "Kelas Saya", dan Rekomendasi Kelas
 * (lib/siswa/getKelasSayaData.ts). Kelas dengan `tampil_di_katalog = false`
 * (PRD Bagian 13, db/add_kelas_tampil_di_katalog.sql — mis. kelas
 * lama/legacy) TIDAK pernah lolos dari sini.
 *
 * JANGAN dipakai untuk kelas yang SUDAH diikuti (Kelas Saya siswa/mentor,
 * detail kelas terdaftar, honor, siswa binaan) — saklar itu cuma menutup
 * katalog, rekomendasi & checkout, bukan akses kelas yang sudah berjalan.
 */
export function queryKelasKatalog() {
  return supabaseServer.from("kelas").select(KELAS_CARD_SELECT).eq("tampil_di_katalog", true);
}

/** Baris kelas -> card jualan lengkap (diskon kelas + sisa slot). */
export async function toCardPreviewList(rows: KelasCardRow[]): Promise<KelasCardPreview[]> {
  if (rows.length === 0) return [];

  const kapasitasByKelas = await getKapasitasByKelasId(rows);
  return rows.map((row) => toCardPreview(row, kapasitasByKelas.get(row.id)!));
}

/** Preview tiap kategori (max 4 terbaru) — dipakai app/program/page.tsx. Cuma
 * kategori yang punya isi yang dikembalikan (section kosong disembunyikan,
 * bukan tampil kosong — PRD 7.5.4). */
export async function getProgramPreviewSections(): Promise<ProgramSection[]> {
  const results = await Promise.all(
    PROGRAM_KATEGORI_ORDER.map(async (kategori) => {
      const { data, error } = await queryKelasKatalog()
        .eq("program_kategori", kategori)
        .order("created_at", { ascending: false })
        .limit(4);

      if (error) {
        console.error(`[getProgramPreviewSections] query kategori=${kategori} failed:`, error);
        return null;
      }

      const rows = (data ?? []) as unknown as KelasCardRow[];
      if (rows.length === 0) return null;

      const items = await toCardPreviewList(rows);

      return {
        kategori,
        kategoriLabel: PROGRAM_KATEGORI_LABEL[kategori],
        slug: PROGRAM_KATEGORI_SLUG[kategori],
        items,
      };
    }),
  );

  return results.filter((section): section is ProgramSection => section !== null);
}

export interface KelasGridFilters {
  tipeKelas?: string;
  tingkatKelas?: string;
}

/** Grid penuh 1 kategori (app/program/[kategori]/page.tsx) — filter opsional
 * Tipe Kelas & Tingkat Kelas. */
export async function getKelasByKategori(
  kategori: ProgramKategori,
  filters: KelasGridFilters = {},
): Promise<KelasCardPreview[]> {
  let query = queryKelasKatalog()
    .eq("program_kategori", kategori)
    .order("created_at", { ascending: false });

  if (filters.tipeKelas) query = query.eq("tipe_kelas", filters.tipeKelas);
  if (filters.tingkatKelas) query = query.eq("tingkat_kelas", filters.tingkatKelas);

  const { data, error } = await query;

  if (error) {
    console.error(`[getKelasByKategori] query kategori=${kategori} failed:`, error);
    return [];
  }

  return toCardPreviewList((data ?? []) as unknown as KelasCardRow[]);
}

/** Semua kelas katalog, terbaru dulu — dipakai empty state "Kelas Saya"
 * (siswa belum punya kelas lunas) & fallback Rekomendasi Kelas. */
export async function getKelasKatalog(): Promise<KelasCardPreview[]> {
  const { data, error } = await queryKelasKatalog().order("created_at", { ascending: false });

  if (error) {
    console.error("[getKelasKatalog] query failed:", error);
    return [];
  }

  return toCardPreviewList((data ?? []) as unknown as KelasCardRow[]);
}

/** Urutan relevansi saran kelas: jenjang (tingkat_kelas) yang SAMA dengan kelas acuan lebih dulu; di dalam tiap
 * kelompok urutan bawaan katalog (terbaru dulu) tetap — sort stabil. */
export function urutkanKelasSaran<T extends { tingkat_kelas: string }>(rows: T[], tingkatAcuan: string): T[] {
  return [...rows].sort((a, b) => Number(b.tingkat_kelas === tingkatAcuan) - Number(a.tingkat_kelas === tingkatAcuan));
}

/**
 * "Kelas lain di program ini" (detail kelas publik): kelas LAIN dengan program_kategori yang sama, maksimal
 * `limit`. Memakai queryKelasKatalog() — aturan katalog yang SAMA dengan /program (tampil_di_katalog = true),
 * jadi kelas tersembunyi (mis. [UJI]) tidak pernah lolos. Dua langkah (kategori/jenjang kelas acuan, lalu daftar)
 * berjalan di dalam satu pemanggilan supaya halaman cukup menaruhnya di Promise.all bersama kueri halaman.
 */
export async function getKelasLainDiProgram(kelasId: string, limit = 3): Promise<KelasCardPreview[]> {
  const { data: acuan, error: errorAcuan } = await supabaseServer
    .from("kelas")
    .select("program_kategori, tingkat_kelas")
    .eq("id", kelasId)
    .maybeSingle();
  if (errorAcuan) {
    console.error("[getKelasLainDiProgram] query acuan failed:", errorAcuan);
    return [];
  }
  if (!acuan) return [];

  const { data, error } = await queryKelasKatalog()
    .eq("program_kategori", acuan.program_kategori as string)
    .neq("id", kelasId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[getKelasLainDiProgram] query failed:", error);
    return [];
  }

  const rows = ((data ?? []) as unknown as KelasCardRow[]).filter((row) => row.id !== kelasId);
  // Hitung kapasitas hanya untuk kartu yang benar-benar tampil.
  return toCardPreviewList(urutkanKelasSaran(rows, acuan.tingkat_kelas as string).slice(0, limit));
}

export interface KelasMentorInfo {
  nama: string;
  avatarUrl: string | null;
  asalPtn: string | null;
}

export interface KelasDetailPublic {
  id: string;
  nama: string;
  programKategori: ProgramKategori;
  programKategoriLabel: string;
  subtesNama: string | null;
  tipeKelas: string;
  tipeKelasLabel: string;
  modePembelajaran: string;
  modePembelajaranLabel: string;
  jumlahSesi: number;
  tingkatKelas: string;
  tingkatKelasLabel: string;
  deskripsi: string | null;
  harga: number;
  /** null kalau kelas.jadwal kosong/belum diisi — halaman detail publik
   * WAJIB sembunyikan baris jadwal sepenuhnya kalau null, bukan tampilkan
   * placeholder semacam "Jadwal: -". */
  jadwalDisplay: string | null;
  /** `kelas.diskon_persen` (0-100) — 0 berarti tampilan harga normal. */
  diskonPersen: number;
  hargaSetelahDiskon: number;
  mentorNama: string | null;
  mentors: KelasMentorInfo[];
  /** SATU sumber kapasitas/penuh/hampir habis (lib/shared/kapasitasKelas.ts). */
  kapasitasInfo: KapasitasKelas;
  /** Diskon kelas sendiri saja — lihat KelasCardPreview.diskonAktif. */
  diskonAktif: DiskonAktif | null;
  /** kelas.link_lynkid ("Input Link Pendaftaran") — tujuan tombol Daftar
   * Sekarang kalau terisi, lihat lib/shared/kelasDaftarTarget.ts. */
  linkLynkid: string | null;
  /** `kelas.tampil_di_katalog` — fungsi ini SENGAJA tidak memfilternya
   * (dipakai juga halaman kelas siswa); pemanggil yang memutuskan: halaman
   * publik /program/kelas/[id] → notFound(), halaman kelas siswa → cuma
   * siswa terdaftar yang boleh lihat. */
  tampilDiKatalog: boolean;
}

/** Detail publik 1 kelas (app/program/kelas/[kelasId]/page.tsx). Mentor
 * bersumber dari kelas_mentor (many-to-many) — bisa lebih dari satu mentor
 * per kelas, lihat CLAUDE.md/PRD Bagian 13 (kelas_mentor). */
export async function getKelasDetailPublic(kelasId: string): Promise<KelasDetailPublic | null> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      `id, nama, program_kategori, tipe_kelas, mode_pembelajaran, jumlah_sesi, tingkat_kelas, deskripsi, harga, diskon_persen, jadwal, jadwal_pilih_siswa, kapasitas, link_lynkid, tampil_di_katalog, subtes_id, pendaftaran_ditutup,
       subtes:subtes_id(nama)`,
    )
    .eq("id", kelasId)
    .maybeSingle();

  if (error) {
    console.error("[getKelasDetailPublic] query failed:", error);
    return null;
  }
  if (!data) return null;

  type Row = {
    id: string;
    nama: string;
    program_kategori: ProgramKategori;
    tipe_kelas: string;
    mode_pembelajaran: string;
    jumlah_sesi: number;
    tingkat_kelas: string;
    deskripsi: string | null;
    harga: number;
    diskon_persen: number | null;
    jadwal: unknown;
    jadwal_pilih_siswa: boolean | null;
    kapasitas: number | null;
    link_lynkid: string | null;
    tampil_di_katalog: boolean | null;
    pendaftaran_ditutup: boolean | null;
    subtes_id: string | null;
    subtes: NamaJoin;
  };
  const row = data as unknown as Row;

  type MentorRelRow = {
    users: { id: string; nama: string; avatar_url: string | null; mentor_profiles: { asal_ptn: string | null } | { asal_ptn: string | null }[] | null } | null;
  };

  const [ketersediaan, mentorRelResult] = await Promise.all([
    hitungKetersediaanKelas([
      {
        id: row.id,
        tipe_kelas: row.tipe_kelas,
        mode_pembelajaran: row.mode_pembelajaran,
        jadwal_pilih_siswa: row.jadwal_pilih_siswa,
        jadwal: row.jadwal,
        kapasitas: typeof row.kapasitas === "number" ? row.kapasitas : null,
        subtes_id: row.subtes_id,
      },
    ]),
    supabaseServer
      .from("kelas_mentor")
      .select("users:mentor_id(id, nama, avatar_url, mentor_profiles(asal_ptn))")
      .eq("kelas_id", kelasId),
  ]);

  // Galat baca → aturan kapasitas manual dengan 0 siswa (sama dengan perilaku lama saat count gagal).
  const kapasitasInfo = tandaiPendaftaranDitutup(
    ketersediaan?.get(row.id)?.kapasitas ??
      hitungKapasitasKelas({ kapasitasManual: typeof row.kapasitas === "number" ? row.kapasitas : null, lunas: 0, otomatis: null }),
    row.pendaftaran_ditutup,
  );
  if (mentorRelResult.error) {
    console.error("[getKelasDetailPublic] query kelas_mentor failed:", mentorRelResult.error);
  }

  const mentors: KelasMentorInfo[] = ((mentorRelResult.data ?? []) as unknown as MentorRelRow[])
    .map((rel) => rel.users)
    .filter((u): u is NonNullable<MentorRelRow["users"]> => u !== null)
    .map((u) => {
      const profile = Array.isArray(u.mentor_profiles) ? (u.mentor_profiles[0] ?? null) : u.mentor_profiles;
      return { nama: u.nama, avatarUrl: u.avatar_url, asalPtn: profile?.asal_ptn ?? null };
    });

  const hargaDetail = Number(row.harga);
  const diskonPersenDetail = normalizeDiskonPersen(row.diskon_persen);

  return {
    id: row.id,
    nama: row.nama,
    programKategori: row.program_kategori,
    programKategoriLabel: PROGRAM_KATEGORI_LABEL[row.program_kategori] ?? row.program_kategori,
    subtesNama: firstNama(row.subtes),
    tipeKelas: row.tipe_kelas,
    tipeKelasLabel: TIPE_KELAS_LABEL[row.tipe_kelas] ?? row.tipe_kelas,
    modePembelajaran: row.mode_pembelajaran,
    modePembelajaranLabel: MODE_PEMBELAJARAN_LABEL[row.mode_pembelajaran] ?? row.mode_pembelajaran,
    jumlahSesi: row.jumlah_sesi,
    tingkatKelas: row.tingkat_kelas,
    tingkatKelasLabel: TINGKAT_KELAS_LABEL[row.tingkat_kelas] ?? row.tingkat_kelas,
    deskripsi: row.deskripsi,
    harga: hargaDetail,
    jadwalDisplay: formatJadwalRingkas(row.jadwal),
    diskonPersen: diskonPersenDetail,
    hargaSetelahDiskon: hitungHargaSetelahDiskon(hargaDetail, diskonPersenDetail),
    mentorNama: mentors[0]?.nama ?? null,
    mentors,
    kapasitasInfo,
    diskonAktif: diskonPersenDetail > 0 ? { label: `Diskon ${diskonPersenDetail}%` } : null,
    linkLynkid: row.link_lynkid,
    tampilDiKatalog: row.tampil_di_katalog !== false,
  };
}

export type MateriTipePublic = "video" | "dokumen" | "rangkuman_teks";

export interface MateriPublicItem {
  id: string;
  judul: string;
  tipe: MateriTipePublic;
  snippet: string;
}

function buildMateriSnippet(tipe: MateriTipePublic, konten: string | null): string {
  if (tipe === "rangkuman_teks") {
    const text = (konten ?? "").trim();
    if (!text) return "Rangkuman materi belajar";
    return text.length > 90 ? `${text.slice(0, 90).trimEnd()}…` : text;
  }
  return tipe === "video" ? "Tautan video pembelajaran" : "Tautan dokumen belajar";
}

/** Materi published untuk sidebar "Materi" di detail kelas publik (PRD 7.5.1
 * — cuma status published yang boleh tampil ke siswa, materi draft AI belum
 * direview tetap tersembunyi). */
export async function getMateriPublicByKelasId(kelasId: string): Promise<MateriPublicItem[]> {
  const { data, error } = await supabaseServer
    .from("materi")
    .select("id, judul, tipe, konten")
    .eq("kelas_id", kelasId)
    .eq("status", "published")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getMateriPublicByKelasId] query failed:", error);
    return [];
  }

  return (data ?? []).map((r) => {
    const tipe = r.tipe as MateriTipePublic;
    return {
      id: r.id as string,
      judul: r.judul as string,
      tipe,
      snippet: buildMateriSnippet(tipe, r.konten as string | null),
    };
  });
}
