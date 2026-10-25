/**
 * Laporan Honor Mentor v2 — fungsi hitung MURNI (tanpa database, tanpa fs).
 * Dipakai scripts/laporan-honor-v2.ts dan tests/laporan-honor-v2.test.ts.
 *
 * Status "confirmed" sesi TIDAK dihitung ulang di sini: memakai
 * hitungStatusSesi (lib/shared/statusSesi.ts) yang sama dengan website.
 * Satu-satunya tambahan: sesi yang disangkal lalu disetujui Admin memakai
 * waktu keputusan di sesi_review_log sebagai waktu confirmed.
 */
import { hitungStatusSesi, type SesiWaktuRow, type StatusSesiEfektif } from "../../lib/shared/statusSesi";
import { tanggalWib } from "../../lib/shared/hariWib";

// ============================================================================
// KONFIGURASI — ubah di sini, jangan di dalam fungsi.
// ============================================================================

/** Persen honor kelas private (tipe_kelas = 'private'). */
export const PERSEN_PRIVATE = 65;

/** Tier kelas grup (semi_private / grouping) menurut jumlah siswa aktif pada tanggal sesi. */
export const TIER_GRUP: Readonly<Record<number, number>> = { 1: 65, 2: 55, 3: 50, 4: 45 };
/** Lebih dari ini → pakai tier TIER_GRUP_MAKS dan tandai PERLU DICEK MANUAL. */
export const TIER_GRUP_MAKS = 4;

export const TIPE_PRIVATE = ["private"] as const;
export const TIPE_GRUP = ["semi_private", "grouping"] as const;

/** Selisih harga normal vs harga dibayar (persen dari harga normal) yang dianggap "besar". */
export const BATAS_SELISIH_HARGA_PERSEN = 10;

/**
 * Batas waktu, semua dalam WIB (Asia/Jakarta, UTC+7). Jendela honor Oktober 2026:
 * sesi confirmed pada [PERIODE_MULAI, PERIODE_AKHIR_EKSKLUSIF) dibayar 23–28 Okt.
 * PERIODE_AKHIR_EKSKLUSIF = 23 Okt 00:00 WIB, jadi 22 Okt 23:59:59 WIB masih masuk.
 */
export const PERIODE_MULAI = "2026-09-23T00:00:00+07:00";
export const PERIODE_AKHIR_EKSKLUSIF = "2026-10-23T00:00:00+07:00";
/** Skrip menolak jalan sebelum waktu ini. */
export const BOLEH_JALAN_MULAI = "2026-10-23T00:00:00+07:00";
/** Sesudah ini jendela bayar sudah lewat — hanya peringatan. */
export const JENDELA_BAYAR_AKHIR_EKSKLUSIF = "2026-10-29T00:00:00+07:00";

// ============================================================================
// Tipe data
// ============================================================================

export interface KelasData {
  id: string;
  nama: string;
  tipe_kelas: string;
  mode_pembelajaran: string;
  harga: number;
  jumlah_sesi: number;
  kapasitas: number;
  mentor_id: string | null; // kelas.mentor_id (DEPRECATED) — hanya petunjuk, bukan penerima honor
}

export interface PembayaranData {
  status: string; // payments.status
  jumlah: number; // payments.jumlah (setelah promo)
  jumlah_sebelum_diskon: number;
}

export interface EnrollmentData {
  id: string;
  kelas_id: string;
  status_pembayaran: string; // 'menunggu' | 'lunas' | 'batal'
  tanggal_daftar: string; // ISO
  sumber: string; // 'checkout' | 'manual'
  nominal_dibayar: number | null;
  mentor_offline_id: string | null;
  pembayaran: PembayaranData | null; // payments terbaru (berhasil/refunded) user+kelas ini
  subtes_ids: string[]; // enrollment_subtes
  /** Penanda "diskon dari mentor". Tidak ada di schema saat ini → selalu false dari DB. */
  diskon_dari_mentor: boolean;
}

export interface SesiData extends SesiWaktuRow {
  id: string;
  enrollment_id: string;
  nomor_sesi: number;
  tanggal_dilaksanakan: string | null; // DATE "YYYY-MM-DD"
  mentor_id: string | null; // sesi_kelas.mentor_id = penerima honor
  /** created_at keputusan 'setujui' terbaru di sesi_review_log, bila ada. */
  review_setujui_pada: string | null;
  /** Penanda honor sudah dibayar. null = penanda TIDAK TERSEDIA (tidak diketahui), bukan "belum". */
  sudah_dibayar: boolean | null;
}

export type KategoriPeriode = "periode_ini" | "sebelumnya" | "sesudah_cutoff";

// ============================================================================
// Penjaga waktu jalan
// ============================================================================

export function cekBolehJalan(now: Date): { boleh: boolean; pesan: string; peringatan: string | null } {
  if (now.getTime() < Date.parse(BOLEH_JALAN_MULAI)) {
    return {
      boleh: false,
      pesan: `DITOLAK: laporan honor baru boleh dijalankan mulai ${BOLEH_JALAN_MULAI} (WIB). Sekarang ${now.toISOString()}.`,
      peringatan: null,
    };
  }
  const peringatan =
    now.getTime() >= Date.parse(JENDELA_BAYAR_AKHIR_EKSKLUSIF)
      ? `PERINGATAN: jendela bayar 23–28 Okt 2026 sudah lewat (sekarang ${now.toISOString()}). Sesi auto-confirmed dihitung per waktu sekarang.`
      : null;
  return { boleh: true, pesan: "OK", peringatan };
}

// ============================================================================
// Status & waktu confirmed (pakai statusSesi.ts)
// ============================================================================

export interface StatusConfirmed {
  status: StatusSesiEfektif;
  confirmed: boolean;
  waktu: string | null;
  sumberWaktu: "siswa" | "otomatis_24_jam" | "review_admin" | null;
}

export function statusConfirmed(sesi: SesiData, now: Date): StatusConfirmed {
  const info = hitungStatusSesi(sesi, now);
  const confirmed = info.status === "terkonfirmasi_siswa" || info.status === "terkonfirmasi_otomatis";
  if (!confirmed) return { status: info.status, confirmed, waktu: null, sumberWaktu: null };
  if (info.status === "terkonfirmasi_siswa" && sesi.review_setujui_pada) {
    return { status: info.status, confirmed, waktu: sesi.review_setujui_pada, sumberWaktu: "review_admin" };
  }
  return {
    status: info.status,
    confirmed,
    waktu: info.waktuTerkonfirmasi,
    sumberWaktu: info.status === "terkonfirmasi_otomatis" ? "otomatis_24_jam" : "siswa",
  };
}

export function kategoriPeriode(waktuIso: string): KategoriPeriode {
  const ms = Date.parse(waktuIso);
  if (ms < Date.parse(PERIODE_MULAI)) return "sebelumnya";
  if (ms < Date.parse(PERIODE_AKHIR_EKSKLUSIF)) return "periode_ini";
  return "sesudah_cutoff";
}

// ============================================================================
// Dasar honor & nilai sesi
// ============================================================================

/** Harga yang benar-benar dibayar: manual → nominal_dibayar; checkout → payments.jumlah. */
export function hargaDibayar(e: EnrollmentData): number | null {
  if (e.sumber === "manual") return e.nominal_dibayar;
  return e.pembayaran ? e.pembayaran.jumlah : null;
}

export interface DasarHonor {
  dasar: number;
  sumberDasar: "harga_normal" | "harga_dibayar";
  fallback: string | null;
}

/** Default harga normal; bila "diskon dari mentor" → harga yang benar-benar dibayar. */
export function hitungDasarHonor(input: { harga: number; hargaDibayar: number | null; diskonDariMentor: boolean }): DasarHonor {
  if (input.diskonDariMentor) {
    if (input.hargaDibayar !== null) return { dasar: input.hargaDibayar, sumberDasar: "harga_dibayar", fallback: null };
    return { dasar: input.harga, sumberDasar: "harga_normal", fallback: "diskon dari mentor tapi harga dibayar tidak diketahui → harga normal" };
  }
  return { dasar: input.harga, sumberDasar: "harga_normal", fallback: null };
}

export function hitungNilaiSesi(dasar: number, jumlahSesi: number): number | null {
  if (!Number.isFinite(jumlahSesi) || jumlahSesi <= 0) return null;
  return dasar / jumlahSesi;
}

// ============================================================================
// Persen tier & honor
// ============================================================================

export type JenisKelas = "private" | "grup" | "tidak_diketahui";

export function jenisKelas(tipe: string): JenisKelas {
  if ((TIPE_PRIVATE as readonly string[]).includes(tipe)) return "private";
  if ((TIPE_GRUP as readonly string[]).includes(tipe)) return "grup";
  return "tidak_diketahui";
}

export function tentukanPersen(tipe: string, jumlahAktif: number): { persen: number | null; tier: string; cek: string[] } {
  const jenis = jenisKelas(tipe);
  if (jenis === "private") {
    const cek = jumlahAktif > 1 ? [`kelas private dengan ${jumlahAktif} siswa dalam satu pertemuan (65% dari tiap nilai_sesi)`] : [];
    return { persen: PERSEN_PRIVATE, tier: "private", cek };
  }
  if (jenis === "grup") {
    if (jumlahAktif <= 0) return { persen: null, tier: "grup-0", cek: ["kelas grup tanpa siswa aktif pada tanggal sesi (honor 0)"] };
    if (jumlahAktif > TIER_GRUP_MAKS) {
      return {
        persen: TIER_GRUP[TIER_GRUP_MAKS],
        tier: `grup-${TIER_GRUP_MAKS}+`,
        cek: [`kelas grup dengan ${jumlahAktif} siswa aktif (> ${TIER_GRUP_MAKS}), dipakai tier ${TIER_GRUP_MAKS}`],
      };
    }
    return { persen: TIER_GRUP[jumlahAktif], tier: `grup-${jumlahAktif}`, cek: [] };
  }
  return { persen: null, tier: "?", cek: [`tipe_kelas '${tipe}' tidak dikenal`] };
}

/** Honor satu pertemuan = persen × jumlah nilai_sesi peserta, dibulatkan ke rupiah. */
export function hitungHonorPertemuan(persen: number | null, nilaiSesiPeserta: number[]): number {
  if (persen === null) return 0;
  const total = nilaiSesiPeserta.reduce((a, b) => a + b, 0);
  return Math.round((persen / 100) * total);
}

// ============================================================================
// Status aktif pendaftaran
// ============================================================================

/** Schema tidak punya tanggal keluar → status dinilai dari kondisi SEKARANG. */
export function statusAktif(e: EnrollmentData): { aktif: boolean; alasan: string | null } {
  if (e.status_pembayaran !== "lunas") return { aktif: false, alasan: `status_pembayaran '${e.status_pembayaran}'` };
  if (e.pembayaran?.status === "refunded") return { aktif: false, alasan: "pembayaran refunded" };
  return { aktif: true, alasan: null };
}

// ============================================================================
// Susun pertemuan (kelas + mentor + tanggal = satu pertemuan)
// ============================================================================

export interface Peserta {
  enrollment_id: string;
  sumber: string;
  dasar: number;
  sumberDasar: DasarHonor["sumberDasar"];
  nilai_sesi: number;
  punyaBaris: boolean;
}

export interface Pertemuan {
  kunci: string;
  kelas: KelasData;
  jenis: JenisKelas;
  mentor_id: string | null;
  tanggal: string; // tanggal efektif "YYYY-MM-DD"
  jumlahBaris: number;
  barisConfirmed: number;
  waktuConfirmed: string; // paling awal di kelompok
  sumberWaktu: string;
  kategori: KategoriPeriode;
  peserta: Peserta[];
  jumlahAktif: number;
  tier: string;
  persen: number | null;
  honor: number;
  /** Honor bila pendaftaran tidak aktif tanpa tanggal keluar ikut dihitung. */
  honorAlternatif: number | null;
  /** true = semua baris confirmed ditandai dibayar; false = tidak ada; null = tidak diketahui / campuran. */
  sudahDibayar: boolean | null;
  cek: string[];
  fallback: string[];
}

export interface InputSusun {
  kelas: Map<string, KelasData>;
  enrollments: EnrollmentData[];
  sesi: SesiData[];
  now: Date;
  /** kelas_id → mentor_id → subtes_id yang diampu (kelas_subtes_mentor). Opsional. */
  subtesMentor?: Map<string, Map<string, Set<string>>>;
}

function pesertaDari(e: EnrollmentData, k: KelasData, punyaBaris: boolean): Peserta | null {
  const d = hitungDasarHonor({ harga: k.harga, hargaDibayar: hargaDibayar(e), diskonDariMentor: e.diskon_dari_mentor });
  const nilai = hitungNilaiSesi(d.dasar, k.jumlah_sesi);
  if (nilai === null) return null;
  return { enrollment_id: e.id, sumber: e.sumber, dasar: d.dasar, sumberDasar: d.sumberDasar, nilai_sesi: nilai, punyaBaris };
}

export function susunPertemuan(input: InputSusun): Pertemuan[] {
  const enrById = new Map(input.enrollments.map((e) => [e.id, e]));
  const enrByKelas = new Map<string, EnrollmentData[]>();
  for (const e of input.enrollments) {
    const list = enrByKelas.get(e.kelas_id) ?? [];
    list.push(e);
    enrByKelas.set(e.kelas_id, list);
  }

  type Baris = { sesi: SesiData; st: StatusConfirmed; enr: EnrollmentData };
  const kelompok = new Map<string, { kelas: KelasData; mentor: string | null; tanggalAsli: string | null; baris: Baris[] }>();
  for (const s of input.sesi) {
    const enr = enrById.get(s.enrollment_id);
    if (!enr) continue;
    const k = input.kelas.get(enr.kelas_id);
    if (!k) continue;
    const st = statusConfirmed(s, input.now);
    const key = `${k.id}|${s.mentor_id ?? "-"}|${s.tanggal_dilaksanakan ?? "-"}`;
    const g = kelompok.get(key) ?? { kelas: k, mentor: s.mentor_id, tanggalAsli: s.tanggal_dilaksanakan, baris: [] };
    g.baris.push({ sesi: s, st, enr });
    kelompok.set(key, g);
  }

  const hasil: Pertemuan[] = [];
  for (const [kunci, g] of kelompok) {
    const confirmedRows = g.baris.filter((b) => b.st.confirmed);
    if (confirmedRows.length === 0) continue;

    const cek: string[] = [];
    const fallback: string[] = [];
    const k = g.kelas;
    const jenis = jenisKelas(k.tipe_kelas);

    // Waktu confirmed paling awal di kelompok.
    const berwaktu = confirmedRows.filter((b) => b.st.waktu !== null);
    let waktuConfirmed: string;
    let sumberWaktu: string;
    if (berwaktu.length === 0) {
      // terkonfirmasi_siswa tanpa dikonfirmasi_siswa_pada: pakai waktu penandaan mentor.
      const cadangan = confirmedRows.map((b) => b.sesi.dikonfirmasi_mentor_pada).filter((v): v is string => Boolean(v)).sort()[0];
      if (!cadangan) continue; // tidak ada waktu sama sekali — tidak bisa masuk periode mana pun
      waktuConfirmed = cadangan;
      sumberWaktu = "penandaan_mentor(fallback)";
      fallback.push("waktu confirmed kosong → dipakai waktu penandaan mentor");
      cek.push("sesi confirmed tanpa waktu konfirmasi");
    } else {
      berwaktu.sort((a, b) => Date.parse(a.st.waktu!) - Date.parse(b.st.waktu!));
      waktuConfirmed = berwaktu[0].st.waktu!;
      sumberWaktu = berwaktu[0].st.sumberWaktu ?? "";
    }

    let tanggal = g.tanggalAsli;
    if (!tanggal) {
      const tandai = confirmedRows.map((b) => b.sesi.dikonfirmasi_mentor_pada).filter((v): v is string => Boolean(v)).sort()[0];
      tanggal = tanggalWib(new Date(tandai ?? waktuConfirmed));
      fallback.push("tanggal_dilaksanakan kosong → tanggal WIB penandaan mentor");
      cek.push("sesi tanpa tanggal_dilaksanakan");
    }

    // Status campuran di kelompok.
    const tidakConfirmed = g.baris.filter((b) => !b.st.confirmed);
    if (tidakConfirmed.length > 0) {
      const ringkas = [...new Set(tidakConfirmed.map((b) => b.st.status))].join(", ");
      cek.push(`status campuran dalam satu pertemuan: ${confirmedRows.length} confirmed, ${tidakConfirmed.length} lain (${ringkas})`);
    }

    // Lebih dari satu baris per siswa pada tanggal yang sama (kolom jam tidak ada → digabung).
    const perEnr = new Map<string, number>();
    for (const b of g.baris) perEnr.set(b.enr.id, (perEnr.get(b.enr.id) ?? 0) + 1);
    if ([...perEnr.values()].some((n) => n > 1)) {
      cek.push("lebih dari satu baris sesi per siswa pada tanggal ini (tidak ada kolom jam, digabung jadi satu pertemuan)");
      fallback.push("beberapa sesi satu siswa di tanggal sama digabung");
    }

    if (!g.mentor) cek.push(`sesi tanpa mentor_id (kelas.mentor_id = ${k.mentor_id ?? "kosong"}, hanya petunjuk)`);

    // Peserta: enrollment yang punya baris di kelompok (+ untuk grup: semua aktif pada tanggal itu).
    const pemegangBaris = new Set(g.baris.map((b) => b.enr.id));
    const kandidat = new Map<string, { e: EnrollmentData; punyaBaris: boolean }>();
    for (const id of pemegangBaris) kandidat.set(id, { e: enrById.get(id)!, punyaBaris: true });
    if (jenis === "grup") {
      for (const e of enrByKelas.get(k.id) ?? []) {
        if (kandidat.has(e.id)) continue;
        if (tanggalWib(new Date(e.tanggal_daftar)) > tanggal) continue; // belum terdaftar pada tanggal sesi
        if (e.status_pembayaran === "menunggu") continue; // belum pernah aktif
        kandidat.set(e.id, { e, punyaBaris: false });
      }
    }

    const peserta: Peserta[] = [];
    const pesertaTidakAktif: Peserta[] = [];
    for (const { e, punyaBaris } of kandidat.values()) {
      const p = pesertaDari(e, k, punyaBaris);
      if (!p) continue;
      const a = statusAktif(e);
      if (a.aktif) {
        peserta.push(p);
      } else {
        pesertaTidakAktif.push(p);
        cek.push(`pendaftaran ${e.id.slice(0, 8)} tidak aktif (${a.alasan}) tanpa tanggal keluar — tidak dihitung`);
      }
    }
    if (pesertaTidakAktif.length > 0) fallback.push("pendaftaran tidak aktif tanpa tanggal keluar dianggap keluar sebelum sesi");

    if (hitungNilaiSesi(1, k.jumlah_sesi) === null) cek.push(`kelas.jumlah_sesi tidak valid (${k.jumlah_sesi})`);

    // Kelas grup offline: siswa aktif yang diampu mentor offline lain.
    if (jenis === "grup" && k.mode_pembelajaran === "offline" && g.mentor) {
      const lain = peserta.filter((p) => {
        const mo = enrById.get(p.enrollment_id)!.mentor_offline_id;
        return mo !== null && mo !== g.mentor;
      });
      if (lain.length > 0) cek.push(`kelas grup offline: ${lain.length} siswa aktif diampu mentor offline lain`);
    }

    // Siswa aktif yang tidak memilih subtes yang diampu mentor ini.
    const subtesMentor = g.mentor ? input.subtesMentor?.get(k.id)?.get(g.mentor) : undefined;
    if (jenis === "grup" && subtesMentor && subtesMentor.size > 0) {
      const tidakPilih = peserta.filter((p) => {
        const pilihan = enrById.get(p.enrollment_id)!.subtes_ids;
        return pilihan.length > 0 && !pilihan.some((s) => subtesMentor.has(s));
      });
      if (tidakPilih.length > 0) cek.push(`${tidakPilih.length} siswa aktif tidak memilih subtes yang diampu mentor ini`);
    }

    const t = tentukanPersen(k.tipe_kelas, peserta.length);
    cek.push(...t.cek);
    if (t.cek.some((c) => c.includes("dipakai tier"))) fallback.push(`tier ${TIER_GRUP_MAKS} untuk > ${TIER_GRUP_MAKS} siswa`);
    const honor = hitungHonorPertemuan(t.persen, peserta.map((p) => p.nilai_sesi));

    let honorAlternatif: number | null = null;
    if (pesertaTidakAktif.length > 0) {
      const semua = [...peserta, ...pesertaTidakAktif];
      const tAlt = tentukanPersen(k.tipe_kelas, semua.length);
      honorAlternatif = hitungHonorPertemuan(tAlt.persen, semua.map((p) => p.nilai_sesi));
    }

    const tanda = confirmedRows.map((b) => b.sesi.sudah_dibayar);
    let sudahDibayar: boolean | null;
    if (tanda.some((v) => v === null)) sudahDibayar = null;
    else if (tanda.every((v) => v === true)) sudahDibayar = true;
    else if (tanda.every((v) => v === false)) sudahDibayar = false;
    else {
      sudahDibayar = null;
      cek.push("sebagian baris pertemuan ini ditandai dibayar, sebagian belum");
    }

    hasil.push({
      kunci,
      kelas: k,
      jenis,
      mentor_id: g.mentor,
      tanggal,
      jumlahBaris: g.baris.length,
      barisConfirmed: confirmedRows.length,
      waktuConfirmed,
      sumberWaktu,
      kategori: kategoriPeriode(waktuConfirmed),
      peserta,
      jumlahAktif: peserta.length,
      tier: t.tier,
      persen: t.persen,
      honor,
      honorAlternatif,
      sudahDibayar,
      cek,
      fallback,
    });
  }

  hasil.sort((a, b) => (a.mentor_id ?? "").localeCompare(b.mentor_id ?? "") || a.tanggal.localeCompare(b.tanggal) || a.kelas.nama.localeCompare(b.kelas.nama));
  return hasil;
}

// ============================================================================
// Pisahkan per periode & status bayar
// ============================================================================

export interface LaporanTerpisah {
  /** (a) confirmed dalam jendela, BELUM ditandai dibayar atau tidak diketahui → masuk total. */
  periodeIni: Pertemuan[];
  /** (a) confirmed dalam jendela tapi SUDAH ditandai dibayar → tidak masuk total. */
  periodeIniSudahDibayar: Pertemuan[];
  /** (b) confirmed sebelum jendela, belum ditandai dibayar atau tidak diketahui. */
  sebelumnya: Pertemuan[];
  /** (b) confirmed sebelum jendela dan sudah ditandai dibayar → tidak ditampilkan di daftar. */
  sebelumnyaSudahDibayar: Pertemuan[];
  /** (c) confirmed sesudah cut-off. */
  sesudahCutoff: Pertemuan[];
}

export function pisahkanLaporan(pertemuan: Pertemuan[]): LaporanTerpisah {
  const r: LaporanTerpisah = { periodeIni: [], periodeIniSudahDibayar: [], sebelumnya: [], sebelumnyaSudahDibayar: [], sesudahCutoff: [] };
  for (const p of pertemuan) {
    const dibayar = p.sudahDibayar === true;
    if (p.kategori === "periode_ini") (dibayar ? r.periodeIniSudahDibayar : r.periodeIni).push(p);
    else if (p.kategori === "sebelumnya") (dibayar ? r.sebelumnyaSudahDibayar : r.sebelumnya).push(p);
    else r.sesudahCutoff.push(p);
  }
  return r;
}

// ============================================================================
// Cek per pendaftaran (dicetak sekali per pendaftaran)
// ============================================================================

export function cekPendaftaran(e: EnrollmentData, k: KelasData): string[] {
  const cek: string[] = [];
  const dibayar = hargaDibayar(e);
  if (e.sumber === "manual") {
    cek.push("pendaftaran manual (tanpa baris payments)");
    if (dibayar === null) cek.push("pendaftaran manual tanpa nominal_dibayar");
    else if (dibayar < k.harga && !e.diskon_dari_mentor) {
      cek.push(`nominal_dibayar (${dibayar}) < kelas.harga (${k.harga}) — penanda "diskon dari mentor" tidak ada di schema, dipakai kelas.harga`);
    }
  } else if (e.status_pembayaran === "lunas" && !e.pembayaran) {
    cek.push("checkout lunas tanpa baris payments berhasil/refunded");
  }
  if (dibayar !== null && k.harga > 0) {
    const selisihPersen = (Math.abs(k.harga - dibayar) / k.harga) * 100;
    if (selisihPersen > BATAS_SELISIH_HARGA_PERSEN) {
      cek.push(`selisih harga normal ${k.harga} vs dibayar ${dibayar} (${selisihPersen.toFixed(1)}%)`);
    }
  }
  const a = statusAktif(e);
  if (!a.aktif) cek.push(`tidak aktif (${a.alasan}) dan schema tidak punya tanggal keluar`);
  return cek;
}
