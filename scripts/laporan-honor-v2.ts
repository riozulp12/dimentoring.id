/**
 * Laporan Honor Mentor v2 — READ-ONLY (hanya SELECT). Menghitung NOMINAL honor
 * per mentor untuk jendela bayar 23–28 Okt 2026 (sesi confirmed 23 Sep 00:00 –
 * 22 Okt 23:59 WIB). Konstanta tier/persen/tanggal ada di
 * scripts/laporan-honor-v2/hitung.ts (bagian atas file).
 *
 *   npx tsx scripts/laporan-honor-v2.ts --out <folder-di-luar-repo>
 *   npx tsx scripts/laporan-honor-v2.ts --dry-run            # hitung & cetak ringkasan, tidak menulis file
 *   npx tsx scripts/laporan-honor-v2.ts --force-date 2026-10-23T08:00:00+07:00 --dry-run   # uji penjaga waktu
 *   npx tsx scripts/laporan-honor-v2.ts --env D:/rahasia/prod.env --out D:/laporan/honor-okt   # project lain (mis. produksi)
 *
 * Keluaran --out juga memuat tandai-dibayar.sql (UPDATE sesi_kelas.dibayar_pada
 * untuk sesi bersih periode ini) — HANYA DIHASILKAN, dijalankan Admin di SQL
 * Editor SETELAH transfer. Skrip ini sendiri tidak pernah menulis ke database.
 *
 * Menolak jalan sebelum 23 Okt 2026 00:00 WIB (exit 2). Membaca .env.local,
 * atau file --env (wajib di luar repo; .env.local tidak diubah). Klien
 * Supabase memakai fetch yang menolak semua request selain GET/HEAD — skrip
 * hanya bisa SELECT. Nama mentor ditulis LENGKAP hanya ke file --out; konsol
 * memakai nama samaran.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  BATAS_SELISIH_HARGA_PERSEN,
  BATCH_BAYAR,
  PERIODE_AKHIR_EKSKLUSIF,
  PERIODE_MULAI,
  PERSEN_PRIVATE,
  TIER_GRUP,
  buatSqlTandaiDibayar,
  cekBolehJalan,
  cekPendaftaran,
  petaBermasalah,
  pisahkanLaporan,
  statusAktif,
  susunPertemuan,
  type EnrollmentData,
  type KelasData,
  type PembayaranData,
  type Pertemuan,
  type SesiData,
} from "./laporan-honor-v2/hitung";
import { diDalamRepo, keCsv, tulisKeluaran, type Sel } from "./laporan-honor-v2/keluaran";
import { buatFetchHanyaBaca, parseEnv, projectRef } from "./laporan-honor-v2/hanyaBaca";

/**
 * Penanda "honor sudah dibayar" = sesi_kelas.dibayar_pada (db/add_honor_fondasi.sql).
 * Dipakai bila kolomnya ADA di database yang dibaca; kalau migrasi belum
 * dijalankan, status bayar = TIDAK DIKETAHUI + peringatan (fallback lama).
 */
const PENANDA_DIBAYAR_TERSEDIA = true;

const REPO_ROOT = resolve(__dirname, "..");

// ---- Argumen ---------------------------------------------------------------
function ambilArg(nama: string): string | null {
  const i = process.argv.indexOf(nama);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const dryRun = process.argv.includes("--dry-run");
const forceDate = ambilArg("--force-date");
const outArg = ambilArg("--out");
const envArg = ambilArg("--env");

const now = forceDate ? new Date(forceDate) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error(`--force-date tidak valid: ${forceDate}`);
  process.exit(1);
}

// ---- 1. Penjaga waktu (sebelum menyentuh apa pun) -------------------------
const jaga = cekBolehJalan(now);
if (!jaga.boleh) {
  console.error(jaga.pesan);
  process.exit(2);
}
if (jaga.peringatan) console.warn(jaga.peringatan);
if (forceDate) console.log(`(--force-date) waktu acuan: ${now.toISOString()}`);

if (!dryRun) {
  if (!outArg) {
    console.error("--out <folder> wajib (folder di luar repo), atau pakai --dry-run.");
    process.exit(1);
  }
  if (diDalamRepo(outArg, REPO_ROOT)) {
    console.error(`DITOLAK: --out (${resolve(outArg)}) berada di dalam repo. Pakai folder di luar repo.`);
    process.exit(1);
  }
}

if (envArg) {
  if (diDalamRepo(envArg, REPO_ROOT)) {
    console.error(`DITOLAK: --env (${resolve(envArg)}) berada di dalam repo. Simpan file env produksi di luar repo.`);
    process.exit(1);
  }
  if (!existsSync(envArg)) {
    console.error(`--env: file tidak ditemukan: ${resolve(envArg)}`);
    process.exit(1);
  }
}

// ---- Env & klien ----------------------------------------------------------
const ENV_PATH = envArg ? resolve(envArg) : resolve(REPO_ROOT, ".env.local");
function loadEnv(): Record<string, string> {
  return parseEnv(readFileSync(ENV_PATH, "utf8"));
}

// ---- 2. Pemeriksaan schema -------------------------------------------------
interface Probe {
  label: string;
  table: string;
  column: string | null; // null = cek tabel
  /**
   * wajib    = harus ada, skrip berhenti bila tidak ada.
   * fondasi  = kolom db/add_honor_fondasi.sql: ada = dipakai; tidak ada = fallback lama + peringatan.
   * kandidat = diharapkan TIDAK ada; bila muncul skrip berhenti (perlu diperbarui supaya dipakai).
   */
  jenis: "wajib" | "fondasi" | "kandidat";
  catatanBilaTidakAda?: string;
}

const PROBES: Probe[] = [
  { label: "Jenis kelas (private/grup)", table: "kelas", column: "tipe_kelas", jenis: "wajib" },
  { label: "Mode online/offline", table: "kelas", column: "mode_pembelajaran", jenis: "wajib" },
  { label: "Jumlah sesi paket", table: "kelas", column: "jumlah_sesi", jenis: "wajib" },
  { label: "Harga normal", table: "kelas", column: "harga", jenis: "wajib" },
  { label: "Kapasitas kelas", table: "kelas", column: "kapasitas", jenis: "wajib" },
  { label: "Status pendaftaran", table: "enrollments", column: "status_pembayaran", jenis: "wajib" },
  { label: "Sumber pendaftaran", table: "enrollments", column: "sumber", jenis: "wajib" },
  { label: "Nominal dibayar (manual)", table: "enrollments", column: "nominal_dibayar", jenis: "wajib" },
  { label: "Tanggal daftar", table: "enrollments", column: "tanggal_daftar", jenis: "wajib" },
  { label: "Mentor offline per siswa", table: "enrollments", column: "mentor_offline_id", jenis: "wajib" },
  { label: "Payments: harga dibayar", table: "payments", column: "jumlah", jenis: "wajib" },
  { label: "Payments: status (termasuk refunded)", table: "payments", column: "status", jenis: "wajib" },
  { label: "Mentor penanda sesi", table: "sesi_kelas", column: "mentor_id", jenis: "wajib" },
  { label: "Tanggal sesi", table: "sesi_kelas", column: "tanggal_dilaksanakan", jenis: "wajib" },
  { label: "Log keputusan Admin", table: "sesi_review_log", column: "created_at", jenis: "wajib" },
  { label: "Subtes diampu mentor per kelas", table: "kelas_subtes_mentor", column: "subtes_id", jenis: "wajib" },
  { label: "Subtes pilihan siswa", table: "enrollment_subtes", column: "subtes_id", jenis: "wajib" },
  { label: "Penanda honor dibayar", table: "sesi_kelas", column: "dibayar_pada", jenis: "fondasi", catatanBilaTidakAda: "status bayar TIDAK DIKETAHUI, tandai-dibayar.sql tidak berisi UPDATE" },
  { label: "Batch bayar", table: "sesi_kelas", column: "dibayar_batch", jenis: "fondasi", catatanBilaTidakAda: "tandai-dibayar.sql tidak berisi UPDATE" },
  { label: "Tanggal keluar pendaftaran", table: "enrollments", column: "tanggal_keluar", jenis: "fondasi", catatanBilaTidakAda: "status dinilai dari kondisi sekarang, ditandai PERLU DICEK" },
  { label: "Alasan keluar pendaftaran", table: "enrollments", column: "alasan_keluar", jenis: "fondasi", catatanBilaTidakAda: "alasan keluar tidak ditampilkan" },
  { label: "Penanda diskon dari mentor", table: "enrollments", column: "diskon_dari_mentor", jenis: "fondasi", catatanBilaTidakAda: "dasar honor selalu kelas.harga" },
  { label: "Jumlah siswa per kelas (kolom)", table: "kelas", column: "jumlah_siswa", jenis: "kandidat", catatanBilaTidakAda: "dihitung dari enrollments" },
  { label: "Jam sesi", table: "sesi_kelas", column: "jam_mulai", jenis: "kandidat", catatanBilaTidakAda: "pertemuan di tanggal sama digabung" },
];

const KODE_TIDAK_ADA = new Set(["42703", "42P01", "PGRST204", "PGRST205"]);

async function periksaSchema(sb: SupabaseClient): Promise<{ baris: string[]; hasil: Map<string, boolean> }> {
  const baris: string[] = [];
  const hasil = new Map<string, boolean>();
  for (const p of PROBES) {
    const { error } = await sb.from(p.table).select(p.column ?? "*").limit(0);
    let ada: boolean;
    if (!error) ada = true;
    else if (KODE_TIDAK_ADA.has(error.code ?? "") || /does not exist|could not find/i.test(error.message)) ada = false;
    else throw new Error(`Gagal memeriksa ${p.table}.${p.column ?? "*"}: ${error.code} ${error.message}`);
    hasil.set(`${p.table}.${p.column ?? "*"}`, ada);
    const lokasi = p.column ? `${p.table}.${p.column}` : `tabel ${p.table}`;
    const catatan = !ada && p.catatanBilaTidakAda ? ` → ${p.catatanBilaTidakAda}` : "";
    baris.push(`${ada ? "ADA      " : "TIDAK ADA"}  ${p.label} (${lokasi})${catatan}`);
  }
  return { baris, hasil };
}

// ---- 3. Ambil data (paging, hanya SELECT) ----------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ambilSemua<T>(sb: SupabaseClient, table: string, cols: string, urut: string[], filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(cols);
    for (const u of urut) q = q.order(u);
    q = q.range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`Gagal membaca ${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// ---- Format ---------------------------------------------------------------
const OFFSET_WIB_MS = 7 * 3600 * 1000;
function fmtWib(iso: string): string {
  return new Date(Date.parse(iso) + OFFSET_WIB_MS).toISOString().slice(0, 16).replace("T", " ") + " WIB";
}
function rupiah(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}
function samaran(nama: string | undefined, id: string | null): string {
  if (!id) return "(tanpa mentor_id)";
  const inisial = (nama ?? "?").trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2);
  return `${inisial || "?"}-${id.slice(0, 4)}`;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(`NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ada di ${ENV_PATH}.`);
    process.exit(1);
  }
  const ref = projectRef(url);
  console.log(`Env: ${envArg ? ENV_PATH : ".env.local"}`);
  console.log(`Database: project ref ${ref}${dryRun ? " (DRY-RUN: tidak menulis file)" : ""}`);
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: buatFetchHanyaBaca() },
  });

  const hitungBaris = async (table: string) => {
    const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`Gagal menghitung ${table}: ${error.message || error.code}`);
    return count ?? 0;
  };
  const [nKelas, nEnr, nSesi] = await Promise.all([hitungBaris("kelas"), hitungBaris("enrollments"), hitungBaris("sesi_kelas")]);
  console.log(`Isi database: ${nKelas} kelas, ${nEnr} pendaftaran, ${nSesi} baris sesi_kelas`);

  // 2. Schema dulu.
  const schema = await periksaSchema(sb);
  console.log("\n=== PEMERIKSAAN SCHEMA ===");
  for (const b of schema.baris) console.log("  " + b);
  const ada = (kolom: string) => schema.hasil.get(kolom) === true;
  const kandidatMuncul = PROBES.filter((p) => p.jenis === "kandidat" && ada(`${p.table}.${p.column ?? "*"}`));
  const wajibHilang = PROBES.filter((p) => p.jenis === "wajib" && !ada(`${p.table}.${p.column ?? "*"}`));
  if (wajibHilang.length > 0) {
    console.error(`\nDIHENTIKAN: kolom wajib tidak ada: ${wajibHilang.map((p) => `${p.table}.${p.column}`).join(", ")}`);
    process.exit(1);
  }
  if (kandidatMuncul.length > 0) {
    console.error(
      `\nDIHENTIKAN: data yang dulu tidak ada sekarang ADA (${kandidatMuncul.map((p) => `${p.table}.${p.column ?? "*"}`).join(", ")}). ` +
        "Skrip ini masih memakai fallback untuknya — perbarui skrip dulu supaya data itu dipakai.",
    );
    process.exit(1);
  }
  const penandaDibayarAda = PENANDA_DIBAYAR_TERSEDIA && ada("sesi_kelas.dibayar_pada") && ada("sesi_kelas.dibayar_batch");
  const tanggalKeluarAda = ada("enrollments.tanggal_keluar");
  const alasanKeluarAda = ada("enrollments.alasan_keluar");
  const diskonMentorAda = ada("enrollments.diskon_dari_mentor");
  const fondasiHilang = PROBES.filter((p) => p.jenis === "fondasi" && !ada(`${p.table}.${p.column ?? "*"}`));
  const peringatanFondasi = fondasiHilang.map(
    (p) => `PERINGATAN: ${p.table}.${p.column} belum ada (db/add_honor_fondasi.sql belum dijalankan di project ini) — ${p.catatanBilaTidakAda}.`,
  );
  for (const w of peringatanFondasi) console.warn(w);

  // 3. Data.
  type KelasRow = { id: string; nama: string; tipe_kelas: string; mode_pembelajaran: string; harga: string | number; jumlah_sesi: number; kapasitas: number; mentor_id: string | null };
  type EnrRow = {
    id: string; user_id: string; kelas_id: string; status_pembayaran: string; tanggal_daftar: string; sumber: string;
    nominal_dibayar: number | null; mentor_offline_id: string | null;
    tanggal_keluar?: string | null; alasan_keluar?: string | null; diskon_dari_mentor?: boolean | null;
  };
  type PayRow = { id: string; user_id: string; item_id: string; status: string; jumlah: string | number; jumlah_sebelum_diskon: string | number; dibuat_pada: string };
  type SesiRow = Omit<SesiData, "review_setujui_pada" | "sudah_dibayar"> & { dibayar_pada?: string | null };
  const kolomEnr = [
    "id, user_id, kelas_id, status_pembayaran, tanggal_daftar, sumber, nominal_dibayar, mentor_offline_id",
    tanggalKeluarAda ? "tanggal_keluar" : null,
    alasanKeluarAda ? "alasan_keluar" : null,
    diskonMentorAda ? "diskon_dari_mentor" : null,
  ].filter(Boolean).join(", ");
  const kolomSesi = [
    "id, enrollment_id, nomor_sesi, tanggal_dilaksanakan, dikonfirmasi_mentor, dikonfirmasi_mentor_pada, status_siswa, dikonfirmasi_siswa_pada, mentor_id",
    penandaDibayarAda ? "dibayar_pada" : null,
  ].filter(Boolean).join(", ");
  type ReviewRow = { id: string; sesi_id: string | null; keputusan: string; created_at: string };

  const [kelasRows, enrRows, payRows, sesiRows, reviewRows, ksmRows, esRows] = await Promise.all([
    ambilSemua<KelasRow>(sb, "kelas", "id, nama, tipe_kelas, mode_pembelajaran, harga, jumlah_sesi, kapasitas, mentor_id", ["id"]),
    ambilSemua<EnrRow>(sb, "enrollments", kolomEnr, ["id"]),
    ambilSemua<PayRow>(sb, "payments", "id, user_id, item_id, status, jumlah, jumlah_sebelum_diskon, dibuat_pada", ["id"], (q) =>
      q.eq("item_type", "kelas").in("status", ["berhasil", "refunded"]),
    ),
    ambilSemua<SesiRow>(
      sb,
      "sesi_kelas",
      kolomSesi,
      ["id"],
      (q) => q.eq("dikonfirmasi_mentor", true),
    ),
    ambilSemua<ReviewRow>(sb, "sesi_review_log", "id, sesi_id, keputusan, created_at", ["id"], (q) => q.eq("keputusan", "setujui")),
    ambilSemua<{ kelas_id: string; subtes_id: string; mentor_id: string }>(sb, "kelas_subtes_mentor", "kelas_id, subtes_id, mentor_id", ["kelas_id", "subtes_id", "mentor_id"]),
    ambilSemua<{ enrollment_id: string; subtes_id: string }>(sb, "enrollment_subtes", "enrollment_id, subtes_id", ["enrollment_id", "subtes_id"]),
  ]);

  const kelas = new Map<string, KelasData>(
    kelasRows.map((k) => [k.id, { ...k, harga: Number(k.harga), jumlah_sesi: Number(k.jumlah_sesi), kapasitas: Number(k.kapasitas) }]),
  );

  const payByUserKelas = new Map<string, PayRow>();
  for (const p of payRows) {
    const k = `${p.user_id}|${p.item_id}`;
    const ada = payByUserKelas.get(k);
    if (!ada || Date.parse(p.dibuat_pada) > Date.parse(ada.dibuat_pada)) payByUserKelas.set(k, p);
  }
  const subtesByEnr = new Map<string, string[]>();
  for (const r of esRows) subtesByEnr.set(r.enrollment_id, [...(subtesByEnr.get(r.enrollment_id) ?? []), r.subtes_id]);

  const enrollments: EnrollmentData[] = enrRows.map((e) => {
    const p = payByUserKelas.get(`${e.user_id}|${e.kelas_id}`);
    const pembayaran: PembayaranData | null = p ? { status: p.status, jumlah: Number(p.jumlah), jumlah_sebelum_diskon: Number(p.jumlah_sebelum_diskon) } : null;
    return {
      id: e.id,
      kelas_id: e.kelas_id,
      status_pembayaran: e.status_pembayaran,
      tanggal_daftar: e.tanggal_daftar,
      sumber: e.sumber,
      nominal_dibayar: e.nominal_dibayar === null ? null : Number(e.nominal_dibayar),
      mentor_offline_id: e.mentor_offline_id,
      pembayaran,
      subtes_ids: subtesByEnr.get(e.id) ?? [],
      diskon_dari_mentor: e.diskon_dari_mentor === true, // false bila kolom belum ada
      tanggal_keluar: e.tanggal_keluar ?? null,
      alasan_keluar: e.alasan_keluar ?? null,
    };
  });

  const reviewBySesi = new Map<string, string>();
  for (const r of reviewRows) {
    if (!r.sesi_id) continue;
    const ada = reviewBySesi.get(r.sesi_id);
    if (!ada || Date.parse(r.created_at) > Date.parse(ada)) reviewBySesi.set(r.sesi_id, r.created_at);
  }
  const sesi: SesiData[] = sesiRows.map(({ dibayar_pada, ...s }) => ({
    ...s,
    review_setujui_pada: reviewBySesi.get(s.id) ?? null,
    // Kolom belum ada → null (TIDAK DIKETAHUI), bukan "belum dibayar".
    sudah_dibayar: penandaDibayarAda ? dibayar_pada !== null && dibayar_pada !== undefined : null,
  }));

  const subtesMentor = new Map<string, Map<string, Set<string>>>();
  for (const r of ksmRows) {
    const m = subtesMentor.get(r.kelas_id) ?? new Map<string, Set<string>>();
    const s = m.get(r.mentor_id) ?? new Set<string>();
    s.add(r.subtes_id);
    m.set(r.mentor_id, s);
    subtesMentor.set(r.kelas_id, m);
  }

  // 4. Hitung.
  const pertemuan = susunPertemuan({ kelas, enrollments, sesi, now, subtesMentor });
  const lap = pisahkanLaporan(pertemuan);
  const ini = lap.periodeIni;
  const sebelum = lap.sebelumnya;
  const sesudah = lap.sesudahCutoff;

  const mentorIds = [...new Set(pertemuan.map((p) => p.mentor_id).filter((v): v is string => Boolean(v)))];
  const namaMentor = new Map<string, string>();
  if (mentorIds.length > 0) {
    const { data, error } = await sb.from("users").select("id, nama").in("id", mentorIds);
    if (error) throw new Error(`Gagal membaca nama mentor: ${error.message}`);
    for (const u of data ?? []) namaMentor.set(u.id as string, u.nama as string);
  }
  const nama = (id: string | null) => (id ? namaMentor.get(id) ?? "(nama tidak ditemukan)" : "(tanpa mentor_id)");

  // Cek per pendaftaran — hanya pendaftaran yang terlibat di pertemuan periode ini / sebelumnya.
  const enrTerlibat = new Set([...ini, ...sebelum].flatMap((p) => p.peserta.map((x) => x.enrollment_id)));
  const sesiEnr = new Set(sesi.map((s) => s.enrollment_id));
  const cekEnr: { e: EnrollmentData; k: KelasData; alasan: string[] }[] = [];
  for (const e of enrollments) {
    if (!enrTerlibat.has(e.id) && !(sesiEnr.has(e.id) && [...ini, ...sebelum].some((p) => p.kelas.id === e.kelas_id))) continue;
    const k = kelas.get(e.kelas_id);
    if (!k) continue;
    const alasan = cekPendaftaran(e, k, { penandaDiskonAda: diskonMentorAda });
    if (alasan.length > 0) cekEnr.push({ e, k, alasan });
  }

  // Cek per kelas: jumlah siswa aktif > kapasitas.
  const cekKelas: { k: KelasData; alasan: string }[] = [];
  for (const k of kelas.values()) {
    if (![...ini, ...sebelum].some((p) => p.kelas.id === k.id)) continue;
    const aktif = enrollments.filter((e) => e.kelas_id === k.id && statusAktif(e).aktif).length;
    if (k.kapasitas > 0 && aktif > k.kapasitas) cekKelas.push({ k, alasan: `siswa aktif (${aktif}) melebihi kapasitas (${k.kapasitas})` });
  }

  // 5. Susun keluaran.
  const HEADER_RINCIAN = [
    "mentor", "mentor_id", "kelas", "kelas_id", "tipe_kelas", "mode", "harga_katalog", "jumlah_sesi_paket",
    "tanggal_sesi", "waktu_confirmed", "sumber_waktu", "baris_sesi", "baris_confirmed", "siswa_aktif", "tier", "persen",
    "dasar_honor_per_siswa", "nilai_sesi_per_siswa", "total_nilai_sesi", "honor", "honor_jika_tidak_aktif_dihitung",
    "sudah_dibayar", "fallback", "perlu_dicek",
  ];
  const labelDibayar = (v: boolean | null) => (v === true ? "ya" : v === false ? "belum" : "tidak diketahui");
  const barisRincian = (p: Pertemuan): Sel[] => [
    nama(p.mentor_id), p.mentor_id ?? "", p.kelas.nama, p.kelas.id, p.kelas.tipe_kelas, p.kelas.mode_pembelajaran, p.kelas.harga,
    p.kelas.jumlah_sesi, p.tanggal, fmtWib(p.waktuConfirmed), p.sumberWaktu, p.jumlahBaris, p.barisConfirmed, p.jumlahAktif, p.tier,
    p.persen ?? "", [...new Set(p.peserta.map((x) => x.dasar))].join("|"),
    [...new Set(p.peserta.map((x) => Math.round(x.nilai_sesi * 100) / 100))].join("|"),
    Math.round(p.peserta.reduce((a, x) => a + x.nilai_sesi, 0) * 100) / 100, p.honor, p.honorAlternatif ?? "",
    labelDibayar(p.sudahDibayar), p.fallback.join("; "), p.cek.join("; "),
  ];

  const perMentor = new Map<string, { jumlah: number; total: number }>();
  for (const p of ini) {
    const k = p.mentor_id ?? "";
    const m = perMentor.get(k) ?? { jumlah: 0, total: 0 };
    m.jumlah += 1;
    m.total += p.honor;
    perMentor.set(k, m);
  }
  const ringkasanRows: Sel[][] = [...perMentor.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([id, m]) => [nama(id || null), id, m.jumlah, m.total, id ? (penandaDibayarAda ? "belum ditandai dibayar" : "TIDAK DIKETAHUI (tidak ada penanda bayar di database)") : "TIDAK DIBAYAR — sesi tanpa mentor_id"]);

  const cekRows: Sel[][] = [];
  for (const p of [...ini, ...sebelum]) {
    for (const c of p.cek) cekRows.push(["pertemuan", p.kategori, nama(p.mentor_id), p.kelas.nama, p.tanggal, p.kunci, c]);
  }
  for (const x of cekEnr) for (const c of x.alasan) cekRows.push(["pendaftaran", "", "", x.k.nama, "", x.e.id, c]);
  for (const x of cekKelas) cekRows.push(["kelas", "", "", x.k.nama, "", x.k.id, x.alasan]);

  // Pertemuan yang terkait baris PERLU DICEK MANUAL (pertemuan, pendaftaran, atau kelasnya).
  const cekEnrById = new Map(cekEnr.map((x) => [x.e.id, x.alasan]));
  const cekKelasById = new Map(cekKelas.map((x) => [x.k.id, x.alasan]));
  const bermasalah = petaBermasalah(ini, cekEnrById, cekKelasById);
  const tandai = penandaDibayarAda
    ? buatSqlTandaiDibayar(ini, bermasalah, { batch: BATCH_BAYAR, projectRef: ref, dibuatPada: fmtWib(now.toISOString()), namaMentor: nama })
    : {
        sql: [
          "-- TANDAI HONOR SUDAH DIBAYAR — jalankan SETELAH transfer.",
          `-- Database: project ref ${ref}`,
          "-- TIDAK ADA UPDATE: kolom sesi_kelas.dibayar_pada / dibayar_batch belum ada di project ini.",
          "-- Jalankan db/add_honor_fondasi.sql dulu, lalu buat ulang laporan.",
          "",
        ].join("\n"),
        jumlahSesi: 0,
        jumlahPertemuan: 0,
        totalHonor: 0,
      };

  const totalIni = ini.filter((p) => p.mentor_id).reduce((a, p) => a + p.honor, 0);
  const totalTanpaMentor = ini.filter((p) => !p.mentor_id).reduce((a, p) => a + p.honor, 0);
  const totalSebelum = sebelum.reduce((a, p) => a + p.honor, 0);
  const fallbackIni = ini.filter((p) => p.fallback.length > 0).length;
  const fallbackSebelum = sebelum.filter((p) => p.fallback.length > 0).length;
  const fallbackEnr = cekEnr.filter((x) => x.alasan.some((a) => a.includes("dipakai kelas.harga") || a.includes("tanggal keluar"))).length;

  const FILE_SEBELUMNYA = penandaDibayarAda ? "belum-dibayar-periode-sebelumnya.csv" : "periode-sebelumnya-STATUS-BAYAR-TIDAK-DIKETAHUI.csv";
  const peringatanBayar = penandaDibayarAda
    ? []
    : [
        `> ⚠️ **PERINGATAN — STATUS BAYAR TIDAK DIKETAHUI.** Kolom sesi_kelas.dibayar_pada belum ada di project ini`,
        `> (db/add_honor_fondasi.sql belum dijalankan). Daftar periode sebelumnya (${FILE_SEBELUMNYA})`,
        `> berisi SEMUA sesi confirmed sebelum 23 Sep 2026, termasuk yang mungkin SUDAH dibayar di luar sistem.`,
        `> **JANGAN dipakai untuk keputusan bayar.** Cocokkan dulu dengan catatan transfer honor.`,
        `> Total periode ini juga belum dikurangi sesi yang mungkin sudah dibayar di luar sistem.`,
        ``,
      ];
  const md = [
    `# Laporan Honor Mentor v2 — jendela bayar 23–28 Okt 2026`,
    ``,
    ...peringatanBayar,
    ...peringatanFondasi.map((w) => `> ${w}`),
    ...(peringatanFondasi.length > 0 ? [""] : []),
    `Dibuat: ${fmtWib(now.toISOString())}${forceDate ? " (--force-date)" : ""} · Env ${envArg ? ENV_PATH : ".env.local"} · Database project ref **${ref}** (${nKelas} kelas, ${nEnr} pendaftaran, ${nSesi} baris sesi_kelas)`,
    `Periode: sesi confirmed ${fmtWib(new Date(PERIODE_MULAI).toISOString())} s.d. sebelum ${fmtWib(new Date(PERIODE_AKHIR_EKSKLUSIF).toISOString())}.`,
    `Konfigurasi: private ${PERSEN_PRIVATE}%, tier grup ${Object.entries(TIER_GRUP).map(([n, p]) => `${n}=${p}%`).join(", ")}; selisih harga besar > ${BATAS_SELISIH_HARGA_PERSEN}%. Biaya Mayar tidak dipotong.`,
    ``,
    `## Pemeriksaan schema`,
    ...schema.baris.map((b) => `- ${b}`),
    ``,
    `## Total`,
    `- (a) Periode ini, dibayar ke mentor: **${rupiah(totalIni)}** dari ${ini.filter((p) => p.mentor_id).length} pertemuan, ${perMentor.size - (perMentor.has("") ? 1 : 0)} mentor.`,
    `- (a) Periode ini, sesi tanpa mentor_id (TIDAK masuk total): ${rupiah(totalTanpaMentor)} dari ${ini.filter((p) => !p.mentor_id).length} pertemuan.`,
    `- (a) Periode ini yang sudah ditandai dibayar (TIDAK masuk total): ${lap.periodeIniSudahDibayar.length} pertemuan.`,
    penandaDibayarAda
      ? `- (b) Belum dibayar dari periode sebelumnya (TIDAK masuk total a): ${rupiah(totalSebelum)} dari ${sebelum.length} pertemuan — lihat ${FILE_SEBELUMNYA}. Sudah ditandai dibayar (disembunyikan): ${lap.sebelumnyaSudahDibayar.length}.`
      : `- (b) Periode sebelumnya, STATUS BAYAR TIDAK DIKETAHUI (TIDAK masuk total a, JANGAN dipakai untuk keputusan bayar): ${rupiah(totalSebelum)} dari ${sebelum.length} pertemuan — lihat ${FILE_SEBELUMNYA}.`,
    `- (c) Confirmed sesudah cut-off (tidak dihitung): ${sesudah.length} pertemuan.`,
    `- Baris memakai fallback: ${fallbackIni} pertemuan periode ini, ${fallbackSebelum} pertemuan periode sebelumnya, ${fallbackEnr} pendaftaran.`,
    `- Baris PERLU DICEK MANUAL: ${cekRows.length}.`,
    `- tandai-dibayar.sql: ${tandai.jumlahSesi} baris sesi dari ${tandai.jumlahPertemuan} pertemuan bersih (${rupiah(tandai.totalHonor)}); ${bermasalah.size} pertemuan bermasalah hanya sebagai komentar. Jalankan SETELAH transfer.`,
  ].join("\n");

  const files: Record<string, string> = {
    "ringkasan.md": md + "\n",
    "rincian-sesi.csv": keCsv(HEADER_RINCIAN, ini.map(barisRincian)),
    "ringkasan-mentor.csv": keCsv(["mentor", "mentor_id", "jumlah_sesi", "total_honor", "status_dibayar"], ringkasanRows),
    "perlu-dicek-manual.csv": keCsv(["jenis", "kategori", "mentor", "kelas", "tanggal", "referensi", "alasan"], cekRows),
    [FILE_SEBELUMNYA]: keCsv(HEADER_RINCIAN, sebelum.map(barisRincian)),
    "tandai-dibayar.sql": tandai.sql,
  };

  // Konsol: tanpa nama asli mentor.
  console.log("\n=== RINGKASAN ===");
  console.log(`Data: ${kelas.size} kelas, ${enrollments.length} pendaftaran, ${sesi.length} baris sesi ditandai, ${reviewRows.length} keputusan 'setujui'.`);
  console.log(`(a) periode ini: ${ini.length} pertemuan, total ke mentor ${rupiah(totalIni)} (tanpa mentor_id: ${rupiah(totalTanpaMentor)})`);
  console.log(`(b) periode sebelumnya${penandaDibayarAda ? " belum dibayar" : " (STATUS BAYAR TIDAK DIKETAHUI)"}: ${sebelum.length} pertemuan, ${rupiah(totalSebelum)}`);
  if (!penandaDibayarAda) console.warn("PERINGATAN: kolom penanda dibayar belum ada di database — daftar (b) JANGAN dipakai untuk keputusan bayar.");
  console.log(`(c) sesudah cut-off: ${sesudah.length} pertemuan`);
  console.log(`Fallback: ${fallbackIni + fallbackSebelum} pertemuan, ${fallbackEnr} pendaftaran · PERLU DICEK: ${cekRows.length}`);
  console.log(`tandai-dibayar.sql: ${tandai.jumlahSesi} sesi dari ${tandai.jumlahPertemuan} pertemuan bersih (${rupiah(tandai.totalHonor)}) — TIDAK dijalankan skrip ini.`);
  for (const [id, m] of perMentor) console.log(`  ${samaran(namaMentor.get(id), id || null)}: ${m.jumlah} sesi, ${rupiah(m.total)}`);
  for (const p of ini.slice(0, 3)) {
    console.log(`  contoh: ${samaran(namaMentor.get(p.mentor_id ?? ""), p.mentor_id)} | ${p.kelas.tipe_kelas} | ${p.tanggal} | aktif ${p.jumlahAktif} | ${p.tier} ${p.persen ?? "-"}% | honor ${rupiah(p.honor)}`);
  }

  const tulis = tulisKeluaran(outArg ? resolve(outArg) : "", files, dryRun);
  if (dryRun) console.log(`\nDRY-RUN: ${tulis.dilewati.length} file TIDAK ditulis.`);
  else console.log(`\nDitulis:\n${tulis.ditulis.map((f) => "  " + f).join("\n")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
