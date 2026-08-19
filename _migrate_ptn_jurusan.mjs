import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync("./.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Readiness check: kolom rata_rata_nilai_diterima wajib sudah ada (lewat
// db/add_ptn_jurusan_rata_rata_nilai_diterima.sql yang dijalankan manual di
// Supabase Studio > SQL Editor) sebelum migrasi ini jalan.
const { error: readinessError } = await supabase
  .from("ptn_jurusan")
  .select("rata_rata_nilai_diterima")
  .limit(1);
if (readinessError) {
  console.error(
    "BELUM SIAP: kolom rata_rata_nilai_diterima belum ada di ptn_jurusan.\n" +
      "Jalankan dulu db/add_ptn_jurusan_rata_rata_nilai_diterima.sql di Supabase Studio > SQL Editor.\n" +
      "Detail error:",
    readinessError.message,
  );
  process.exit(1);
}

const PROVINSI_BY_UNIV_ID = {
  1: "DI Yogyakarta", // Universitas Gadjah Mada
  2: "Jawa Barat", // Institut Teknologi Bandung
  3: "Jawa Barat", // Universitas Indonesia (Depok)
  4: "Jawa Barat", // Universitas Padjadjaran
  5: "Jawa Timur", // Universitas Airlangga
  6: "Jawa Tengah", // Universitas Diponegoro
  7: "Jawa Tengah", // Universitas Sebelas Maret
  8: "Jawa Timur", // Universitas Negeri Surabaya
  9: "Jawa Tengah", // Universitas Negeri Semarang
  10: "Jawa Barat", // IPB University
};

const { data: provinsiRows, error: provinsiError } = await supabase.from("provinsi").select("id, nama");
if (provinsiError) throw provinsiError;
const provinsiIdByName = new Map(provinsiRows.map((p) => [p.nama, p.id]));

const { data: univs, error: univError } = await supabase.from("univ").select("*").order("univ_id");
if (univError) throw univError;
const univNameById = new Map(univs.map((u) => [u.univ_id, u.univ_name]));

const { data: majors, error: majorError } = await supabase.from("univ_major").select("*").order("um_id");
if (majorError) throw majorError;

const skipped = [];
const rows = [];

for (const m of majors) {
  if (m.applicant_major === null || m.applicant_major === undefined) {
    skipped.push({ univ: univNameById.get(m.univ_id), jurusan: m.major_name, um_id: m.um_id });
    continue;
  }
  const provinsiNama = PROVINSI_BY_UNIV_ID[m.univ_id];
  const provinsiId = provinsiIdByName.get(provinsiNama);
  if (!provinsiId) {
    throw new Error(`Provinsi "${provinsiNama}" untuk univ_id ${m.univ_id} tidak ditemukan di tabel provinsi.`);
  }

  rows.push({
    nama_universitas: univNameById.get(m.univ_id),
    nama_jurusan: m.major_name,
    jenjang: "S1", // default — data lama univ_major tidak punya konsep jenjang sama sekali
    provinsi_id: provinsiId,
    kuota_tahun_berjalan: m.quota_major,
    jumlah_peminat_tahun_lalu: m.applicant_major,
    jalur: "snbp",
    sumber_data: "migrasi_univ_univ_major",
    tahun_data: 2026,
    rata_rata_nilai_diterima: m.avg_accepted_score,
  });
}

console.log(`Siap migrasi ${rows.length} baris (skip ${skipped.length} baris tanpa jumlah_peminat_tahun_lalu).`);
if (skipped.length > 0) {
  console.log("\nDilewati (perlu data peminat manual):");
  for (const s of skipped) console.log(`  - [${s.univ}] ${s.jurusan} (um_id ${s.um_id})`);
}

const dryRun = process.argv.includes("--dry-run");
if (dryRun) {
  console.log("\n--dry-run aktif, tidak ada yang di-insert. Contoh payload baris pertama:");
  console.log(JSON.stringify(rows[0], null, 2));
  process.exit(0);
}

const { data: inserted, error: insertError } = await supabase.from("ptn_jurusan").insert(rows).select("id");
if (insertError) {
  console.error("INSERT GAGAL:", insertError.message);
  process.exit(1);
}
console.log(`\nBERHASIL: ${inserted.length} baris dimasukkan ke ptn_jurusan.`);
