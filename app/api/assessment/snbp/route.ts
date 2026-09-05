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
 * BR-16 (direvisi): Provinsi diambil otomatis dari users.provinsi_id (diisi di
 * halaman Profil), TIDAK diminta ulang lewat body request. Nama Sekolah sudah
 * jadi teks bebas dan tidak lagi dipakai untuk validasi provinsi manapun.
 * BR-28/FR-3.10: maksimal 2 pilihan prodi; kalau 2 DAN sudah login, minimal
 * satu wajib berada di provinsi yang sama dengan users.provinsi_id siswa.
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
  console.log("=== SNBP ROUTE DIPANGGIL ===");
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
  } catch (error) {
    console.error("[assessment/snbp] Error saat parse JSON body:", error);
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
      "id, nama_universitas, nama_jurusan, jenjang, provinsi_id, kuota_tahun_berjalan, jumlah_peminat_tahun_lalu, jalur, rumpun",
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

  // ---- Ambil Provinsi siswa secara OTOMATIS (BR-16/BR-28 DIREVISI) — langsung
  // dari users.provinsi_id (diisi di halaman Profil), BUKAN lagi diturunkan
  // lewat sekolah->kota->provinsi. HANYA relevan kalau login — anonim belum
  // punya profil sama sekali, jadi dilewati (7.4.1b). ----
  let provinsiSiswa: { id: string; nama: string } | null = null;

  if (userId) {
    const { data: userRow, error: userError } = await supabaseServer
      .from("users")
      .select("id, provinsi_id, provinsi:provinsi_id(id, nama)")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !userRow) {
      console.error("[assessment/snbp] query users failed:", userError);
      return errorResponse("Gagal memuat profil kamu. Coba lagi nanti.", 500);
    }

    const provinsi = userRow.provinsi as unknown as { id: string; nama: string } | null;
    if (userRow.provinsi_id && provinsi) {
      provinsiSiswa = provinsi;
    }
  }

  // ---- FR-3.10/BR-28(b): kalau 2 pilihan DAN sudah login, minimal satu wajib
  // satu provinsi dengan Profil siswa. Anonim: dilewati total (7.4.1b/BR-29). ----
  if (userId && resolvedPilihan.length === 2) {
    if (!provinsiSiswa) {
      return errorResponse(
        "Lengkapi Provinsi di halaman Profil dulu sebelum isi Assessment dengan 2 pilihan.",
        400,
      );
    }
    const salahSatuSeprovinsi = resolvedPilihan.some((p) => p.provinsi_id === provinsiSiswa!.id);
    if (!salahSatuSeprovinsi) {
      return errorResponse(
        `Salah satu pilihan harus berada di PTN provinsi ${provinsiSiswa.nama}.`,
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
      hasil_breakdown: { provinsi: provinsiSiswa },
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

  // ---- Accordion "Rekomendasi Jurusan" (PRD 7.4.3 #1, DIREVISI): PER-PILIHAN,
  // bukan lagi rata-rata gabungan semua pilihan. Tiap pilihan siswa (1 atau 2,
  // loop di bawah) dicari SATU kandidat alternatif serumpun (Saintek/Soshum)
  // dengan pilihan itu SENDIRI (bukan rumpun Pilihan 1 dipaksakan ke semua),
  // dan keketatannya wajib lebih longgar dari keketatan pilihan itu sendiri
  // (bukan avg semua pilihan) — supaya siswa Saintek dapat rekomendasi Saintek
  // dan siswa Soshum dapat rekomendasi Soshum, masing-masing independen.
  //
  // Baris rekomendasi disimpan dengan urutan_pilihan = urutan PILIHAN ASAL-nya
  // (bukan index rekomendasi sendiri 1..N) — karena maksimal 1 rekomendasi per
  // pilihan asal, ini tetap unik terhadap UNIQUE(assessment_id, urutan_pilihan,
  // is_rekomendasi) sekaligus jadi referensi eksplisit "rekomendasi ini untuk
  // Pilihan berapa" yang dipakai frontend buat grouping label yang benar
  // (bukan kolom terpisah — sengaja reuse urutan_pilihan yang sudah ada,
  // supaya tidak nambah kolom yang isinya selalu sama dengan urutan asal).
  //
  // Kegagalan di sini tidak menggagalkan submit. Kalau salah satu pilihan
  // tidak dapat kandidat qualify, pilihan itu cukup tidak punya baris
  // rekomendasi (frontend tampilkan "belum ada rekomendasi" HANYA untuk
  // pilihan itu) — pilihan lain yang masih dapat kandidat tetap tersimpan. ----
  try {
    const chosenIdSet = new Set(resolvedPilihan.map((p) => p.id as string));
    const rekomendasiInserts: {
      assessment_id: string;
      urutan_pilihan: number;
      ptn_jurusan_id: string;
      keketatan_score: number;
      keketatan_label: string;
      peluang_score: number;
      peluang_label: string;
      is_rekomendasi: true;
    }[] = [];

    for (let i = 0; i < pilihanResults.length; i++) {
      const { ptnJurusan, keketatan: keketatanAsal } = pilihanResults[i];
      const urutanAsal = i + 1;

      const { data: kandidatRows, error: kandidatError } = await supabaseServer
        .from("ptn_jurusan")
        .select("id, kuota_tahun_berjalan, jumlah_peminat_tahun_lalu")
        .eq("jalur", "snbp")
        .eq("rumpun", ptnJurusan.rumpun as string);

      if (kandidatError) {
        console.error(
          `[assessment/snbp] query kandidat rekomendasi jurusan (Pilihan ${urutanAsal}) failed:`,
          kandidatError,
        );
        continue;
      }

      const terbaik = (kandidatRows ?? [])
        .filter((row) => !chosenIdSet.has(row.id as string))
        .map((row) => ({
          row,
          keketatan: calculateKeketatan(
            row.kuota_tahun_berjalan as number,
            row.jumlah_peminat_tahun_lalu as number,
          ),
        }))
        .filter(({ keketatan }) => keketatan.score > keketatanAsal.score)
        .sort((a, b) => b.keketatan.score - a.keketatan.score)[0];

      if (!terbaik) continue; // Tidak ada kandidat serumpun yang lebih longgar untuk pilihan ini — biarkan kosong.

      const peluang = calculatePeluang(nilaiAkhir, terbaik.keketatan.score);
      rekomendasiInserts.push({
        assessment_id: assessmentId,
        urutan_pilihan: urutanAsal,
        ptn_jurusan_id: terbaik.row.id as string,
        keketatan_score: terbaik.keketatan.score,
        keketatan_label: terbaik.keketatan.label,
        peluang_score: peluang.score,
        peluang_label: peluang.label,
        is_rekomendasi: true,
      });
    }

    if (rekomendasiInserts.length > 0) {
      const { error: rekomendasiError } = await supabaseServer.from("assessment_pilihan").insert(rekomendasiInserts);
      if (rekomendasiError) {
        console.error("[assessment/snbp] insert rekomendasi jurusan failed:", rekomendasiError);
      }
    }
  } catch (error) {
    console.error("[assessment/snbp] hitung rekomendasi jurusan gagal:", error);
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
