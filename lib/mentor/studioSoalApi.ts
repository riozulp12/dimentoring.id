import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  getSoalDiStimulus,
  getSoalMilik,
  getStimulusMilik,
  isDitugaskan,
  requireMentorAktif,
} from "@/lib/mentor/studioSoal";
import {
  inputValidasiSoal,
  inputValidasiStimulus,
  isAksiStudio,
  isUuid,
  parseBodySimpanSoal,
  parseBodySimpanStimulus,
  rapikanKontenKunci,
  rapikanKontenStimulus,
  terjemahkanHasilRpc,
  type ObjekStudio,
} from "@/lib/shared/studio-soal/formSoal";
import { pesanBacaanMasihDipakai } from "@/lib/shared/studio-soal/hapusDraf";
import { validasiRumusSoal, validasiRumusStimulus } from "@/lib/shared/studio-soal/rumus";
import { validasiSoal, validasiStimulus, type ErrorValidasi } from "@/lib/shared/studio-soal/validasi";

/**
 * Handler API form Studio Soal (PR 3b). Dipakai app/api/studio-soal/**.
 *
 * Urutan cek di setiap aksi:
 *   1. Session mentor + role mentor 'active' di DB (401/403)
 *   2. Soal/stimulus milik mentor ini (404 — draf mentor lain = tidak ada)
 *   3. Mentor DITUGASKAN Admin ke subtes itu (403) — dicek ulang di RPC &
 *      trigger database, bukan hanya di sini
 *   4. Validasi bersama (lib/shared/studio-soal) — sama dengan di browser
 *   5. RPC studio_soal_* (satu-satunya jalur tulis; tidak ada insert/update/
 *      delete langsung ke tabel dari kode aplikasi)
 * Penulis (p_aktor_id) SELALU dari session, tidak pernah dari body.
 */

const jawab = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status });
const gagal = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  jawab(status, { success: false, error, ...extra });

async function bacaJson(request: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

type HasilRpc = { status?: unknown; detail?: unknown; [k: string]: unknown };

async function panggilRpc(nama: string, args: Record<string, unknown>): Promise<HasilRpc | "gagal"> {
  const { data, error } = await supabaseServer.rpc(nama, args);
  if (error) {
    console.error(`[studio-soal] ${nama} failed:`, error);
    return "gagal";
  }
  const hasil = (data ?? {}) as HasilRpc;
  if (hasil.status === "data_tidak_valid") console.error(`[studio-soal] ${nama} data_tidak_valid:`, hasil.detail);
  return hasil;
}

function balasRpc(objek: ObjekStudio, hasil: HasilRpc, extra: Record<string, unknown> = {}) {
  const t = terjemahkanHasilRpc(objek, hasil.status);
  if (!t.success) return gagal(t.httpStatus, t.pesan);
  return jawab(200, { success: true, pesan: t.pesan, ...extra });
}

const TIDAK_DITUGASKAN = "Anda tidak ditugaskan ke subtes ini. Minta Admin menugaskan Anda dulu.";
const GAGAL_SERVER = "Ada gangguan di server. Coba lagi sebentar lagi.";

// ============================================================================
// PUT simpan draf (buat atau ubah, idempoten per id)
// ============================================================================

export async function simpanSoal(request: NextRequest, id: string) {
  const auth = await requireMentorAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return gagal(auth.status, auth.error);
  if (!isUuid(id)) return gagal(400, "Alamat soal tidak valid. Buka lagi dari halaman Studio Soal.");

  const json = await bacaJson(request);
  if (!json.ok) return gagal(400, "Body request harus JSON yang valid.");
  const parsed = parseBodySimpanSoal(json.body);
  if (!parsed.ok) return gagal(400, parsed.error);
  const data = parsed.data;

  const subtes = await isDitugaskan(auth.mentorId, data.subtes_id);
  if (subtes === "gagal") return gagal(500, GAGAL_SERVER);
  if (!subtes) return gagal(403, TIDAK_DITUGASKAN);

  const errors = validasiSoal(inputValidasiSoal(data, subtes.kategori), "draf");
  if (errors.length > 0) return gagal(400, "Ada isian yang perlu dibetulkan (ditandai merah).", { errors });

  const rapi = rapikanKontenKunci(data.tipe, data.konten, data.kunci);
  const hasil = await panggilRpc("studio_soal_simpan_soal", {
    p_id: id,
    p_aktor_id: auth.mentorId,
    p_data: { ...data, ...rapi, sumber_rujukan: data.sumber_rujukan.trim() || null },
  });
  if (hasil === "gagal") return gagal(500, "Draf belum tersimpan. Coba lagi sebentar lagi.");
  return balasRpc("soal", hasil, { id, dibuat: hasil.dibuat === true, updatedAt: hasil.updated_at ?? null });
}

export async function simpanStimulus(request: NextRequest, id: string) {
  const auth = await requireMentorAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return gagal(auth.status, auth.error);
  if (!isUuid(id)) return gagal(400, "Alamat bacaan tidak valid. Buka lagi dari halaman Studio Soal.");

  const json = await bacaJson(request);
  if (!json.ok) return gagal(400, "Body request harus JSON yang valid.");
  const parsed = parseBodySimpanStimulus(json.body);
  if (!parsed.ok) return gagal(400, parsed.error);
  const data = parsed.data;

  const subtes = await isDitugaskan(auth.mentorId, data.subtes_id);
  if (subtes === "gagal") return gagal(500, GAGAL_SERVER);
  if (!subtes) return gagal(403, TIDAK_DITUGASKAN);

  const errors = validasiStimulus(inputValidasiStimulus(data, subtes.kategori), "draf");
  if (errors.length > 0) return gagal(400, "Ada isian yang perlu dibetulkan (ditandai merah).", { errors });

  const hasil = await panggilRpc("studio_soal_simpan_stimulus", {
    p_id: id,
    p_aktor_id: auth.mentorId,
    p_data: { ...data, konten: rapikanKontenStimulus(data.konten) },
  });
  if (hasil === "gagal") return gagal(500, "Draf belum tersimpan. Coba lagi sebentar lagi.");
  return balasRpc("stimulus", hasil, { id, dibuat: hasil.dibuat === true, updatedAt: hasil.updated_at ?? null });
}

// ============================================================================
// Muat milik + cek penugasan (dipakai DELETE & aksi)
// ============================================================================

type Milik =
  | { ok: true; mentorId: string; subtesKategori: string }
  | { ok: false; res: NextResponse };

async function muatMilik(request: NextRequest, objek: ObjekStudio, id: string): Promise<Milik> {
  const auth = await requireMentorAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return { ok: false, res: gagal(auth.status, auth.error) };
  const nama = objek === "soal" ? "Soal" : "Bacaan";
  if (!isUuid(id)) return { ok: false, res: gagal(404, `${nama} tidak ditemukan.`) };

  const baris = objek === "soal" ? await getSoalMilik(auth.mentorId, id) : await getStimulusMilik(auth.mentorId, id);
  if (baris === "gagal") return { ok: false, res: gagal(500, GAGAL_SERVER) };
  if (!baris) return { ok: false, res: gagal(404, `${nama} tidak ditemukan.`) };

  const subtes = await isDitugaskan(auth.mentorId, baris.subtes_id);
  if (subtes === "gagal") return { ok: false, res: gagal(500, GAGAL_SERVER) };
  if (!subtes) return { ok: false, res: gagal(403, TIDAK_DITUGASKAN) };
  return { ok: true, mentorId: auth.mentorId, subtesKategori: subtes.kategori };
}

export async function hapusDraf(request: NextRequest, objek: ObjekStudio, id: string) {
  const milik = await muatMilik(request, objek, id);
  if (!milik.ok) return milik.res;
  const hasil = await panggilRpc("studio_soal_hapus_draf", { p_objek_jenis: objek, p_id: id, p_aktor_id: milik.mentorId });
  if (hasil === "gagal") return gagal(500, "Draf belum terhapus. Coba lagi sebentar lagi.");
  if (hasil.status === "masih_ada_soal") {
    // Sebutkan jumlahnya supaya mentor tahu apa yang harus dihapus dulu.
    const soal = await getSoalDiStimulus(milik.mentorId, id);
    return gagal(409, pesanBacaanMasihDipakai(soal === "gagal" ? 0 : soal.length));
  }
  return balasRpc(objek, hasil);
}

// ============================================================================
// POST aksi: ajukan | tarik | versi-baru
// ============================================================================

export interface ErrorSoalKelompok {
  soalId: string;
  urutan: number | null;
  errors: ErrorValidasi[];
}

export async function aksi(request: NextRequest, objek: ObjekStudio, id: string, namaAksi: string) {
  if (!isAksiStudio(namaAksi)) return gagal(404, "Aksi tidak dikenal.");
  const milik = await muatMilik(request, objek, id);
  if (!milik.ok) return milik.res;
  const { mentorId, subtesKategori } = milik;

  if (namaAksi === "tarik") {
    const hasil = await panggilRpc("studio_soal_tarik", { p_objek_jenis: objek, p_id: id, p_aktor_id: mentorId });
    if (hasil === "gagal") return gagal(500, GAGAL_SERVER);
    return balasRpc(objek, hasil);
  }

  if (namaAksi === "versi-baru") {
    const hasil =
      objek === "soal"
        ? await panggilRpc("studio_soal_buat_versi_soal", { p_soal_id: id, p_aktor_id: mentorId })
        : await panggilRpc("studio_soal_buat_versi_stimulus", { p_stimulus_id: id, p_aktor_id: mentorId });
    if (hasil === "gagal") return gagal(500, GAGAL_SERVER);
    const idBaru = (objek === "soal" ? hasil.soal_id : hasil.stimulus_id) ?? null;
    if (hasil.status === "ada_versi_terbuka") {
      const t = terjemahkanHasilRpc(objek, hasil.status);
      return gagal(t.httpStatus, t.pesan, { idTerbuka: hasil.soal_id ?? null });
    }
    return balasRpc(objek, hasil, { id: idBaru });
  }

  // ---- ajukan: validasi LENGKAP isi yang TERSIMPAN (bukan body) ----
  if (objek === "soal") {
    const soal = await getSoalMilik(mentorId, id);
    if (soal === "gagal") return gagal(500, GAGAL_SERVER);
    if (!soal) return gagal(404, "Soal tidak ditemukan.");
    const errors = [...validasiSoal(inputValidasiSoal(soal, subtesKategori), "ajukan"), ...validasiRumusSoal(soal)];
    if (errors.length > 0) return gagal(400, "Soal belum lengkap. Lengkapi yang ditandai merah, lalu kirim lagi.", { errors });
    const hasil = await panggilRpc("studio_soal_ajukan_soal", { p_soal_id: id, p_aktor_id: mentorId });
    if (hasil === "gagal") return gagal(500, GAGAL_SERVER);
    return balasRpc("soal", hasil);
  }

  const [stimulus, daftarSoal] = await Promise.all([getStimulusMilik(mentorId, id), getSoalDiStimulus(mentorId, id)]);
  if (stimulus === "gagal" || daftarSoal === "gagal") return gagal(500, GAGAL_SERVER);
  if (!stimulus) return gagal(404, "Bacaan tidak ditemukan.");
  const errors = [
    ...validasiStimulus(inputValidasiStimulus(stimulus, subtesKategori), "ajukan"),
    ...validasiRumusStimulus(stimulus),
  ];
  // Soal yang ikut diajukan = draf/ditolak di stimulus ini (sama dengan RPC).
  const errorsSoal: ErrorSoalKelompok[] = daftarSoal
    .filter((s) => s.status === "draf" || s.status === "ditolak")
    .map((s) => ({
      soalId: s.id,
      urutan: s.urutan_dalam_stimulus,
      errors: [...validasiSoal(inputValidasiSoal(s, subtesKategori), "ajukan"), ...validasiRumusSoal(s)],
    }))
    .filter((s) => s.errors.length > 0);
  if (errors.length > 0 || errorsSoal.length > 0) {
    return gagal(400, "Bacaan atau soalnya belum lengkap. Lengkapi yang ditandai merah, lalu kirim lagi.", { errors, errorsSoal });
  }
  const hasil = await panggilRpc("studio_soal_ajukan_stimulus", { p_stimulus_id: id, p_aktor_id: mentorId });
  if (hasil === "gagal") return gagal(500, GAGAL_SERVER);
  return balasRpc("stimulus", hasil, { jumlahSoal: hasil.jumlah_soal ?? null });
}
