import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { ANONYMOUS_FREE_RESULT_LIMIT, TRIAL_COOKIE_MAX_AGE_SECONDS, TRIAL_COOKIE_NAME } from "@/lib/assessment/trial";
import { generateAssessmentNote } from "@/lib/ai/generateNote";
import {
  calculateKeketatan,
  calculateNilaiAkhir,
  calculatePeluang,
  convertPrestasiToNilai,
  isJuaraBerapa,
  isTingkatKejuaraan,
  type JuaraBerapa,
  type TingkatKejuaraan,
} from "@/lib/assessment/calculatePeluang";

/**
 * Assessment SNBP API — PRD Bagian 7.4.1b/7.4.2/7.4.4 (FR-3.1–FR-3.10),
 * Bagian 8 BR-4, BR-5, BR-16, BR-28, BR-29.
 *
 * BR-16: data Sekolah (akreditasi/kuota/provinsi) diambil otomatis dari profil
 * user, TIDAK diminta ulang lewat body request.
 * BR-28/FR-3.10: maksimal 2 pilihan prodi; kalau 2 DAN sudah login, minimal
 * satu wajib berada di provinsi yang sama dengan sekolah asal siswa.
 * BR-29/7.4.1b: login OPSIONAL. Anonim (trial cookie) boleh isi & submit
 * form, validasi provinsi DILEWATI (belum ada data sekolah), dan dibatasi
 * 2x lihat hasil lengkap gratis (lintas jalur digabung) — submit ke-3 dst
 * tetap tersimpan tapi digembok di balik Login/Register.
 */

const NILAI_RAPOR_MIN = 0;
const NILAI_RAPOR_MAX = 100;

interface NilaiRaporInput {
  semester1: number;
  semester2: number;
  semester3: number;
  semester4: number;
  semester5: number;
}

interface PrestasiInput {
  jenisPrestasi: string;
  tingkatKejuaraan: string;
  juaraBerapa: string;
}

interface PilihanInput {
  ptnJurusanId: string;
}

interface SnbpAssessmentRequestBody {
  nilaiRapor: NilaiRaporInput;
  prestasi?: PrestasiInput | null;
  pilihan: PilihanInput[];
}

function errorResponse(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function POST(request: NextRequest) {
  // ---- Auth OPSIONAL (BR-29): kalau ada session, role WAJIB student. Kalau
  // tidak ada session, jalan sebagai trial anonim lewat cookie dm_trial_id. ----
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (session && session.role !== "student") {
    return errorResponse("Assessment Prediksi SNBP khusus untuk akun Siswa.", 403);
  }
  const userId = session?.userId ?? null;

  let trialId = userId ? null : (request.cookies.get(TRIAL_COOKIE_NAME)?.value ?? null);
  let trialCookieNeedsSet = false;
  if (!userId && !trialId) {
    // Fallback kalau request langsung ke API (tidak lewat middleware /assessment
    // di browser) — tetap harus punya trial ID supaya baris assessments valid
    // (CHECK constraint: salah satu dari user_id/anonymous_trial_id wajib ada).
    trialId = randomUUID();
    trialCookieNeedsSet = true;
  }

  let body: SnbpAssessmentRequestBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  // ---- Validasi Nilai Raport (Semester 1-5) ----
  const semesterKeys = ["semester1", "semester2", "semester3", "semester4", "semester5"] as const;
  const nilaiSemester: number[] = [];
  for (const key of semesterKeys) {
    const value = body.nilaiRapor?.[key];
    if (typeof value !== "number" || Number.isNaN(value) || value < NILAI_RAPOR_MIN || value > NILAI_RAPOR_MAX) {
      return errorResponse(`Nilai Raport tidak valid (${key} harus angka 0-100).`, 400);
    }
    nilaiSemester.push(value);
  }
  const rataRataRapor = round2(nilaiSemester.reduce((sum, n) => sum + n, 0) / nilaiSemester.length);

  // ---- Validasi Prestasi (opsional) ----
  let nilaiPrestasi: number | null = null;
  let tingkatKejuaraan: TingkatKejuaraan | null = null;
  let juaraBerapa: JuaraBerapa | null = null;
  let jenisPrestasi: string | null = null;

  if (body.prestasi) {
    jenisPrestasi = body.prestasi.jenisPrestasi?.trim();
    if (!jenisPrestasi) {
      return errorResponse("Jenis Prestasi wajib diisi kalau accordion Prestasi dibuka.", 400);
    }
    if (!isTingkatKejuaraan(body.prestasi.tingkatKejuaraan)) {
      return errorResponse("Tingkat Kejuaraan tidak valid.", 400);
    }
    if (!isJuaraBerapa(body.prestasi.juaraBerapa)) {
      return errorResponse("Juara Berapa tidak valid.", 400);
    }
    tingkatKejuaraan = body.prestasi.tingkatKejuaraan;
    juaraBerapa = body.prestasi.juaraBerapa;
    nilaiPrestasi = convertPrestasiToNilai(tingkatKejuaraan, juaraBerapa);
  }

  // ---- FR-3.10/BR-28(a): jumlah pilihan wajib 1 atau 2 ----
  const pilihanInput = body.pilihan ?? [];
  if (pilihanInput.length < 1 || pilihanInput.length > 2) {
    return errorResponse("Pilih 1 atau 2 program studi (maksimal 2 sesuai aturan SNBP 2026).", 400);
  }
  const ptnJurusanIds = pilihanInput.map((p) => p.ptnJurusanId);
  if (ptnJurusanIds.some((id) => !id)) {
    return errorResponse("Pilihan program studi tidak valid.", 400);
  }
  if (ptnJurusanIds.length === 2 && ptnJurusanIds[0] === ptnJurusanIds[1]) {
    return errorResponse("Pilihan 1 dan Pilihan 2 tidak boleh sama.", 400);
  }

  // ---- Ambil data ptn_jurusan yang dipilih (wajib jalur='snbp') ----
  const { data: ptnJurusanRows, error: ptnJurusanError } = await supabaseServer
    .from("ptn_jurusan")
    .select(
      "id, nama_universitas, nama_jurusan, jenjang, provinsi_id, kuota_tahun_berjalan, jumlah_peminat_tahun_lalu, jalur",
    )
    .in("id", ptnJurusanIds)
    .eq("jalur", "snbp");

  if (ptnJurusanError) {
    console.error("[assessment/snbp] query ptn_jurusan failed:", ptnJurusanError);
    return errorResponse("Gagal memuat data program studi. Coba lagi nanti.", 500);
  }

  const ptnJurusanById = new Map((ptnJurusanRows ?? []).map((row) => [row.id as string, row]));
  const orderedPilihan = ptnJurusanIds.map((id) => ptnJurusanById.get(id));
  if (orderedPilihan.some((row) => !row)) {
    return errorResponse("Salah satu pilihan program studi tidak ditemukan/tidak berlaku untuk SNBP.", 400);
  }
  const resolvedPilihan = orderedPilihan as NonNullable<(typeof orderedPilihan)[number]>[];

  // ---- Ambil data Sekolah user secara OTOMATIS (BR-16) — HANYA kalau login.
  // Anonim belum py profil sekolah sama sekali, jadi dilewati (7.4.1b). ----
  let sekolahSnapshot: {
    sekolahId: string;
    namaSekolah: string;
    akreditasi: string | null;
    kuotaSnbp: number | null;
    provinsiId: string;
    provinsiNama: string;
  } | null = null;

  if (userId) {
    const { data: userRow, error: userError } = await supabaseServer
      .from("users")
      .select("id, sekolah_id")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !userRow) {
      console.error("[assessment/snbp] query users failed:", userError);
      return errorResponse("Gagal memuat profil kamu. Coba lagi nanti.", 500);
    }

    if (userRow.sekolah_id) {
      const { data: sekolahRow, error: sekolahError } = await supabaseServer
        .from("sekolah")
        .select("id, nama, akreditasi, kuota_snbp, kota_id")
        .eq("id", userRow.sekolah_id)
        .maybeSingle();

      if (sekolahError) {
        console.error("[assessment/snbp] query sekolah failed:", sekolahError);
        return errorResponse("Gagal memuat data sekolah kamu. Coba lagi nanti.", 500);
      }

      if (sekolahRow) {
        const { data: kotaRow, error: kotaError } = await supabaseServer
          .from("kota")
          .select("id, provinsi_id, provinsi:provinsi_id(id, nama)")
          .eq("id", sekolahRow.kota_id)
          .maybeSingle();

        if (kotaError) {
          console.error("[assessment/snbp] query kota failed:", kotaError);
          return errorResponse("Gagal memuat data lokasi sekolah kamu. Coba lagi nanti.", 500);
        }

        const provinsi = kotaRow?.provinsi as unknown as { id: string; nama: string } | null;
        if (kotaRow && provinsi) {
          sekolahSnapshot = {
            sekolahId: sekolahRow.id as string,
            namaSekolah: sekolahRow.nama as string,
            akreditasi: (sekolahRow.akreditasi as string | null) ?? null,
            kuotaSnbp: (sekolahRow.kuota_snbp as number | null) ?? null,
            provinsiId: provinsi.id,
            provinsiNama: provinsi.nama,
          };
        }
      }
    }
  }

  // ---- FR-3.10/BR-28(b): kalau 2 pilihan DAN sudah login, minimal satu wajib
  // satu provinsi dengan sekolah. Anonim: dilewati total (7.4.1b/BR-29). ----
  if (userId && resolvedPilihan.length === 2) {
    if (!sekolahSnapshot) {
      return errorResponse(
        "Data sekolah kamu belum lengkap di profil, jadi sistem tidak bisa memvalidasi Pilihan Kedua. Lengkapi dulu profil sekolah kamu, atau isi 1 pilihan saja.",
        400,
      );
    }
    const salahSatuSeprovinsi = resolvedPilihan.some((p) => p.provinsi_id === sekolahSnapshot!.provinsiId);
    if (!salahSatuSeprovinsi) {
      return errorResponse(
        `Salah satu pilihan harus berada di PTN provinsi ${sekolahSnapshot.provinsiNama}`,
        400,
      );
    }
  }

  // ---- Hitung Nilai Akhir ----
  const { nilaiAkhir, label: nilaiAkhirLabel } = calculateNilaiAkhir(rataRataRapor, nilaiPrestasi);

  // ---- Hitung Keketatan & Peluang per pilihan ----
  const pilihanResults = resolvedPilihan.map((ptnJurusan) => {
    const keketatan = calculateKeketatan(
      ptnJurusan.kuota_tahun_berjalan as number,
      ptnJurusan.jumlah_peminat_tahun_lalu as number,
    );
    const peluang = calculatePeluang(nilaiAkhir, keketatan.score);
    return { ptnJurusan, keketatan, peluang };
  });

  // ---- Simpan header assessments (user_id XOR anonymous_trial_id) ----
  const { data: assessment, error: assessmentError } = await supabaseServer
    .from("assessments")
    .insert({
      user_id: userId,
      anonymous_trial_id: userId ? null : trialId,
      jalur: "snbp",
      input_data: {
        nilaiRapor: body.nilaiRapor,
        prestasi: body.prestasi
          ? { jenisPrestasi, tingkatKejuaraan, juaraBerapa }
          : null,
        pilihan: ptnJurusanIds,
      },
      rata_rata_rapor: rataRataRapor,
      nilai_prestasi: nilaiPrestasi,
      nilai_akhir: nilaiAkhir,
      nilai_akhir_label: nilaiAkhirLabel,
      hasil_breakdown: { sekolah: sekolahSnapshot },
    })
    .select("id")
    .single();

  if (assessmentError || !assessment) {
    console.error("[assessment/snbp] insert assessments failed:", assessmentError);
    return errorResponse("Gagal menyimpan hasil Assessment. Coba lagi nanti.", 500);
  }

  const assessmentId = assessment.id as string;

  // ---- Simpan assessment_pilihan (1-2 baris, urutan sesuai submit) ----
  const { error: pilihanError } = await supabaseServer.from("assessment_pilihan").insert(
    pilihanResults.map(({ ptnJurusan, keketatan, peluang }, index) => ({
      assessment_id: assessmentId,
      urutan_pilihan: index + 1,
      ptn_jurusan_id: ptnJurusan.id,
      keketatan_score: keketatan.score,
      keketatan_label: keketatan.label,
      peluang_score: peluang.score,
      peluang_label: peluang.label,
      is_rekomendasi: false,
    })),
  );

  if (pilihanError) {
    console.error("[assessment/snbp] insert assessment_pilihan failed:", pilihanError);
    // ON DELETE CASCADE membersihkan baris assessment_pilihan parsial (kalau ada).
    await supabaseServer.from("assessments").delete().eq("id", assessmentId);
    return errorResponse("Gagal menyimpan pilihan program studi. Coba lagi nanti.", 500);
  }

  // ---- BR-30: generate section "Note" (Gemini) — prompt anonim total, hanya
  // angka/label, TIDAK PERNAH nama/email/WA siswa. generateAssessmentNote()
  // sendiri tidak pernah throw (fallback internal), tapi tetap dibungkus di
  // sini supaya kegagalan simpan note_ai juga tidak menggagalkan submit. ----
  try {
    const noteAi = await generateAssessmentNote({
      nilaiAkhir,
      nilaiAkhirLabel,
      pilihan: pilihanResults.map(({ ptnJurusan, keketatan, peluang }) => ({
        jenjang: ptnJurusan.jenjang as string,
        jurusan: ptnJurusan.nama_jurusan as string,
        keketatanLabel: keketatan.label,
        peluangLabel: peluang.label,
      })),
    });

    const { error: noteUpdateError } = await supabaseServer
      .from("assessments")
      .update({ note_ai: noteAi })
      .eq("id", assessmentId);

    if (noteUpdateError) {
      console.error("[assessment/snbp] update note_ai failed:", noteUpdateError);
    }
  } catch (error) {
    // Section "Note" pelengkap, bukan inti fitur (PRD 7.4.3 #6) — kegagalan
    // apa pun di sini tidak boleh menggagalkan submit assessment.
    console.error("[assessment/snbp] generate/simpan note_ai gagal:", error);
  }

  // ---- Redirect logic (BR-29): login -> selalu hasil lengkap. Anonim -> 2x
  // pertama (lintas jalur digabung) hasil lengkap, submit ke-3 dst digembok
  // di balik Login/Register. ----
  let redirectTo = `/assessment/hasil/${assessmentId}`;
  if (!userId) {
    const { count, error: countError } = await supabaseServer
      .from("assessments")
      .select("id", { count: "exact", head: true })
      .eq("anonymous_trial_id", trialId as string);

    if (countError) {
      console.error("[assessment/snbp] count trial assessments failed:", countError);
    } else if ((count ?? 0) > ANONYMOUS_FREE_RESULT_LIMIT) {
      redirectTo = `/daftar?pending_assessment=${assessmentId}`;
    }
  }

  const response = NextResponse.json({ success: true, assessmentId, redirectTo }, { status: 201 });

  if (trialCookieNeedsSet && trialId) {
    response.cookies.set(TRIAL_COOKIE_NAME, trialId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TRIAL_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
}
