import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { PROGRAM_KATEGORI_ORDER } from "@/lib/shared/kelasLabels";

/**
 * Validasi body request Tambah/Edit Kelas — dipakai bersama oleh
 * app/api/kelola-kelas/route.ts (POST) dan
 * app/api/kelola-kelas/[kelasId]/route.ts (PATCH) supaya aturan sama persis
 * di kedua jalur, tidak duplikasi logic.
 */

const VALID_TINGKAT_KELAS = ["kelas_10", "kelas_11", "kelas_12", "gap_year"];
const VALID_TIPE_KELAS = ["private", "semi_private", "grouping"];
const VALID_HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const VALID_PROGRAM_KATEGORI: readonly string[] = PROGRAM_KATEGORI_ORDER;
const VALID_MODE_PEMBELAJARAN = ["online", "offline"];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export interface JadwalEntryInput {
  hari?: string;
  jamMulai?: string;
}

export interface SubtesMentorPairInput {
  subtesId?: string;
  mentorId?: string;
}

export interface KelasInputBody {
  nama?: string;
  programKategori?: string;
  tingkatKelas?: string;
  tipeKelas?: string;
  /** BARU — 'online' (default) atau 'offline' (mentor tatap muka, otomatis
   * di-assign berdasar jarak terdekat saat checkout, bukan ditentukan di muka). */
  modePembelajaran?: string;
  /** BARU — default OTOMATIS 10 (online)/8 (offline) diisi di client, TETAP
   * bisa diubah manual Admin (jangan di-lock di sini). */
  jumlahSesi?: number | string;
  /** WAJIB kalau modePembelajaran='offline' — SATU Subtes (bukan paket, belum
   * perlu multi-subtes untuk offline), TANPA mentor (mentor ditentukan
   * otomatis nanti saat checkout). subtesMentorPairs/mentorIds diabaikan
   * total kalau field ini terisi. */
  offlineSubtesId?: string;
  /** Pasangan Subtes-Mentor eksplisit (kelas_subtes_mentor) — satu mentor per
   * Subtes terpilih. Kosongkan (array kosong) untuk kelas tanpa subtes
   * tertentu (mis. Konsultasi/Pendampingan Mahasiswa), lalu pakai mentorIds.
   * CUMA relevan untuk modePembelajaran='online'. */
  subtesMentorPairs?: SubtesMentorPairInput[];
  /** Mentor generik TANPA subtes tertentu — CUMA dipakai kalau subtesMentorPairs
   * kosong (kelas Konsultasi/Pendampingan Mahasiswa). Diabaikan kalau
   * subtesMentorPairs terisi atau modePembelajaran='offline'. */
  mentorIds?: string[];
  kapasitas?: number | string;
  harga?: number | string;
  jadwalEntries?: JadwalEntryInput[];
  linkMeet?: string;
  linkLynkid?: string;
  deskripsi?: string;
}

export interface ValidatedSubtesMentorPair {
  subtes_id: string;
  mentor_id: string;
}

export interface ValidatedKelasInput {
  nama: string;
  program_kategori: string;
  tingkat_kelas: string;
  tipe_kelas: string;
  mode_pembelajaran: string;
  jumlah_sesi: number;
  /** DEPRECATED, dipertahankan untuk kompatibilitas lama — diisi Subtes
   * PERTAMA dari subtesMentorPairs. Sumber utama tetap kelas_subtes. */
  subtes_id: string | null;
  /** DEPRECATED, dipertahankan untuk kompatibilitas lama — diisi mentor
   * PERTAMA yang dipilih. Sumber utama tetap kelas_mentor (mentor_ids). */
  mentor_id: string | null;
  /** Dipakai caller (route POST/PATCH) untuk replace penuh baris kelas_mentor —
   * union semua mentor dari subtes_mentor_pairs + mentor_ids generik. */
  mentor_ids: string[];
  /** Dipakai caller untuk replace penuh baris kelas_subtes. */
  subtes_ids: string[];
  /** Dipakai caller untuk replace penuh baris kelas_subtes_mentor. */
  subtes_mentor_pairs: ValidatedSubtesMentorPair[];
  kapasitas: number;
  harga: number;
  /** Array {hari, jam_mulai} — bisa lebih dari satu slot per minggu, null kalau belum diisi. */
  jadwal: { hari: string; jam_mulai: string }[] | null;
  link_meet: string | null;
  /** SEMENTARA (PRD 7.5) — link produk Lynk.id, dipakai selama Payment
   * otomatis belum aktif (NEXT_PUBLIC_PENDAFTARAN_MANUAL). */
  link_lynkid: string | null;
  deskripsi: string | null;
}

export type ValidateKelasResult =
  | { ok: true; data: ValidatedKelasInput }
  | { ok: false; error: string };

export async function validateKelasInput(body: KelasInputBody): Promise<ValidateKelasResult> {
  const nama = typeof body.nama === "string" ? body.nama.trim() : "";
  if (!nama) return { ok: false, error: "Nama kelas wajib diisi." };

  if (!body.programKategori || !VALID_PROGRAM_KATEGORI.includes(body.programKategori)) {
    return { ok: false, error: "Kategori Program wajib dipilih." };
  }
  if (!body.tingkatKelas || !VALID_TINGKAT_KELAS.includes(body.tingkatKelas)) {
    return { ok: false, error: "Tingkat kelas tidak valid." };
  }
  if (!body.tipeKelas || !VALID_TIPE_KELAS.includes(body.tipeKelas)) {
    return { ok: false, error: "Tipe kelas tidak valid." };
  }

  const modePembelajaran = body.modePembelajaran ?? "online";
  if (!VALID_MODE_PEMBELAJARAN.includes(modePembelajaran)) {
    return { ok: false, error: "Mode Pembelajaran tidak valid." };
  }

  const jumlahSesi = Number(body.jumlahSesi);
  if (!Number.isInteger(jumlahSesi) || jumlahSesi <= 0) {
    return { ok: false, error: "Jumlah Sesi harus angka bulat lebih dari 0." };
  }

  const kapasitas = Number(body.kapasitas);
  if (!Number.isInteger(kapasitas) || kapasitas <= 0) {
    return { ok: false, error: "Kapasitas harus angka bulat lebih dari 0." };
  }

  const harga = Number(body.harga);
  if (!Number.isFinite(harga) || harga < 0) {
    return { ok: false, error: "Harga tidak valid." };
  }

  // Cross-check "mentor mengampu subtes ini" — cocok lewat mapel_dasar (mapel
  // serumpun) kalau subtes ini sudah dikelompokkan; fallback ke subtes_id
  // persis sama kalau belum (mapel_dasar NULL). Harus SAMA dengan logic filter
  // di client (KelolaKelasForm.tsx) supaya tidak saling menolak.
  async function mentorCocokSubtes(candidateMentorId: string, subtesMapelDasar: string | null, targetSubtesId: string) {
    const { data: profile, error: profileError } = await supabaseServer
      .from("mentor_profiles")
      .select("mentor_subtes_diampu(subtes_id, subtes:subtes_id(mapel_dasar))")
      .eq("user_id", candidateMentorId)
      .maybeSingle();
    if (profileError) {
      console.error("[validateKelasInput] query mentor_profiles failed:", profileError);
      return { ok: false as const, error: "Gagal memvalidasi subtes mentor. Coba lagi nanti." };
    }
    const diampu = (profile?.mentor_subtes_diampu ?? []) as {
      subtes_id: string;
      subtes: { mapel_dasar: string | null } | { mapel_dasar: string | null }[] | null;
    }[];
    const cocok = subtesMapelDasar
      ? diampu.some((r) => {
          const s = Array.isArray(r.subtes) ? (r.subtes[0] ?? null) : r.subtes;
          return s?.mapel_dasar === subtesMapelDasar;
        })
      : diampu.some((r) => r.subtes_id === targetSubtesId);
    return { ok: true as const, cocok };
  }

  async function validateMentorAktif(candidateMentorId: string) {
    const { data: mentorRole, error: mentorRoleError } = await supabaseServer
      .from("user_roles")
      .select("user_id")
      .eq("user_id", candidateMentorId)
      .eq("role_type", "mentor")
      .eq("status", "active")
      .maybeSingle();
    if (mentorRoleError) {
      console.error("[validateKelasInput] query mentor role failed:", mentorRoleError);
      return { ok: false as const, error: "Gagal memvalidasi mentor. Coba lagi nanti." };
    }
    if (!mentorRole) {
      return { ok: false as const, error: "Salah satu mentor yang dipilih tidak ditemukan atau belum aktif." };
    }
    return { ok: true as const };
  }

  const subtesMentorPairs: ValidatedSubtesMentorPair[] = [];
  let subtesIds: string[] = [];
  let generalMentorIds: string[] = [];

  if (modePembelajaran === "offline") {
    // Offline: TIDAK ada pairing Mentor di muka (mentor otomatis di-assign
    // berdasar jarak terdekat waktu checkout, lihat
    // lib/payment/getOfflineMentorOptions.ts) — subtesMentorPairs/mentorIds
    // dari body diabaikan total. Subtes tetap WAJIB satu (belum perlu paket
    // multi-subtes untuk offline).
    const offlineSubtesId = typeof body.offlineSubtesId === "string" ? body.offlineSubtesId : "";
    if (!offlineSubtesId) {
      return { ok: false, error: "Pilih Subtes untuk kelas offline ini." };
    }
    const { data: subtes, error: subtesError } = await supabaseServer
      .from("subtes")
      .select("id")
      .eq("id", offlineSubtesId)
      .maybeSingle();
    if (subtesError) {
      console.error("[validateKelasInput] query subtes (offline) failed:", subtesError);
      return { ok: false, error: "Gagal memvalidasi subtes. Coba lagi nanti." };
    }
    if (!subtes) return { ok: false, error: "Subtes yang dipilih tidak ditemukan." };
    subtesIds = [offlineSubtesId];
  } else {
    // Online: subtesMentorPairs = satu Mentor per Subtes terpilih
    // (kelas_subtes_mentor). Kosong = kelas tanpa subtes tertentu
    // (Konsultasi/Pendampingan Mahasiswa), pakai mentorIds generik sebagai
    // gantinya (behavior lama, tanpa cross-check subtes karena memang tidak
    // ada subtes untuk dicocokkan).
    const rawPairs = Array.isArray(body.subtesMentorPairs) ? body.subtesMentorPairs : [];
    const cleanedPairs: { subtesId: string; mentorId: string }[] = [];
    const seenSubtesIds = new Set<string>();
    for (const pair of rawPairs) {
      const pairSubtesId = typeof pair?.subtesId === "string" ? pair.subtesId : "";
      const pairMentorId = typeof pair?.mentorId === "string" ? pair.mentorId : "";
      if (!pairSubtesId || !pairMentorId) {
        return { ok: false, error: "Tiap Subtes yang dipilih wajib dipasangkan dengan satu Mentor." };
      }
      if (seenSubtesIds.has(pairSubtesId)) {
        return { ok: false, error: "Satu Subtes tidak boleh muncul lebih dari sekali." };
      }
      seenSubtesIds.add(pairSubtesId);
      cleanedPairs.push({ subtesId: pairSubtesId, mentorId: pairMentorId });
    }

    for (const pair of cleanedPairs) {
      const { data: subtes, error: subtesError } = await supabaseServer
        .from("subtes")
        .select("id, mapel_dasar")
        .eq("id", pair.subtesId)
        .maybeSingle();
      if (subtesError) {
        console.error("[validateKelasInput] query subtes failed:", subtesError);
        return { ok: false, error: "Gagal memvalidasi subtes. Coba lagi nanti." };
      }
      if (!subtes) return { ok: false, error: "Salah satu Subtes yang dipilih tidak ditemukan." };

      const aktifCheck = await validateMentorAktif(pair.mentorId);
      if (!aktifCheck.ok) return { ok: false, error: aktifCheck.error };

      const cocokCheck = await mentorCocokSubtes(pair.mentorId, subtes.mapel_dasar, pair.subtesId);
      if (!cocokCheck.ok) return { ok: false, error: cocokCheck.error };
      if (!cocokCheck.cocok) {
        return { ok: false, error: "Salah satu Mentor yang dipasangkan tidak mengampu Subtes tersebut." };
      }

      subtesMentorPairs.push({ subtes_id: pair.subtesId, mentor_id: pair.mentorId });
    }

    subtesIds = subtesMentorPairs.map((p) => p.subtes_id);

    // mentorIds generik — CUMA dipakai/divalidasi kalau tidak ada subtesMentorPairs
    // (kelas tanpa subtes tertentu). Kalau subtesMentorPairs terisi, field ini
    // diabaikan total (mentor sudah eksplisit lewat pairing).
    if (subtesMentorPairs.length === 0) {
      generalMentorIds = Array.isArray(body.mentorIds)
        ? Array.from(new Set(body.mentorIds.filter((id): id is string => typeof id === "string" && id.length > 0)))
        : [];
      for (const candidateMentorId of generalMentorIds) {
        const aktifCheck = await validateMentorAktif(candidateMentorId);
        if (!aktifCheck.ok) return { ok: false, error: aktifCheck.error };
      }
    }
  }

  // kelas.subtes_id & kelas.mentor_id (kolom lama, DEPRECATED) diisi entri
  // PERTAMA demi kompatibilitas kode lama — kelas_subtes/kelas_mentor tetap
  // sumber utama.
  const subtesId = subtesIds[0] ?? null;
  const mentorIds = Array.from(new Set([...subtesMentorPairs.map((p) => p.mentor_id), ...generalMentorIds]));
  const mentorId = mentorIds[0] ?? null;

  let jadwal: { hari: string; jam_mulai: string }[] | null = null;
  if (Array.isArray(body.jadwalEntries) && body.jadwalEntries.length > 0) {
    const cleaned: { hari: string; jam_mulai: string }[] = [];
    for (const entry of body.jadwalEntries) {
      const hari = typeof entry?.hari === "string" ? entry.hari.trim() : "";
      const jamMulai = typeof entry?.jamMulai === "string" ? entry.jamMulai.trim() : "";
      if (!VALID_HARI.includes(hari)) {
        return { ok: false, error: "Hari jadwal tidak valid." };
      }
      if (!TIME_REGEX.test(jamMulai)) {
        return { ok: false, error: "Jam jadwal tidak valid." };
      }
      cleaned.push({ hari, jam_mulai: jamMulai });
    }
    jadwal = cleaned;
  }

  let linkMeet: string | null = null;
  if (typeof body.linkMeet === "string" && body.linkMeet.trim()) {
    const trimmed = body.linkMeet.trim();
    if (!isValidUrl(trimmed)) {
      return { ok: false, error: "Link Meet harus berupa URL yang valid." };
    }
    linkMeet = trimmed;
  }

  let linkLynkid: string | null = null;
  if (typeof body.linkLynkid === "string" && body.linkLynkid.trim()) {
    const trimmed = body.linkLynkid.trim();
    if (!isValidUrl(trimmed)) {
      return { ok: false, error: "Link Lynk.id harus berupa URL yang valid." };
    }
    linkLynkid = trimmed;
  }

  const deskripsi = typeof body.deskripsi === "string" && body.deskripsi.trim() ? body.deskripsi.trim() : null;

  return {
    ok: true,
    data: {
      nama,
      program_kategori: body.programKategori,
      tingkat_kelas: body.tingkatKelas,
      tipe_kelas: body.tipeKelas,
      mode_pembelajaran: modePembelajaran,
      jumlah_sesi: jumlahSesi,
      subtes_id: subtesId,
      mentor_id: mentorId,
      mentor_ids: mentorIds,
      subtes_ids: subtesIds,
      subtes_mentor_pairs: subtesMentorPairs,
      kapasitas,
      harga,
      jadwal,
      link_meet: linkMeet,
      link_lynkid: linkLynkid,
      deskripsi,
    },
  };
}
