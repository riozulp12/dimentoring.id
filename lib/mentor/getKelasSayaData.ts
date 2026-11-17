import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { TINGKAT_KELAS_LABEL } from "@/lib/shared/kelasLabels";
import { formatJadwal } from "@/lib/shared/formatJadwal";
import { hitungSesiTerkonfirmasi } from "@/lib/shared/progresSesi";
import { hitungStatusSesi, labelMentorSesi, type StatusSesiEfektif } from "@/lib/shared/statusSesi";
import { rentangHariWib } from "@/lib/shared/hariWib";
import { getKelasAksesMentor, type AksesMentor } from "@/lib/mentor/aksesMentor";
import { getEnrollmentMilikMentor, milikDariPenerimaan } from "@/lib/mentor/siswaMilikMentor";
import { formatSlot, parseJadwalSlots } from "@/lib/shared/jadwalPilihan";
import { getPenerimaanSubtesSiswa, type SubtesSiswaDetail } from "@/lib/mentor/statusPenerimaanSiswa";
import { getMentorBerhakLinkMeet } from "@/lib/mentor/linkMeetSiswa";
import { isKelasPrivate, resolveLinkMeet } from "@/lib/shared/linkMeet";
import { alasanDiblokirPenerimaan, type AlasanBlokirPenerimaan } from "@/lib/shared/penerimaanSiswa";

/**
 * Data layer "Kelas Saya" (Mentor) — PRD Bagian 7.5 & Bagian 13 (kelas,
 * enrollments, materi). BR-7: mentor cuma boleh membuka kelas yang terkait
 * dengannya — kelas.mentor_id, kelas_mentor (multi-mentor), atau
 * enrollments.mentor_offline_id (kelas offline) — lewat SATU helper
 * lib/mentor/aksesMentor.ts. Detail page menambah guard eksplisit di server.
 */

export { TINGKAT_KELAS_LABEL };

export interface MentorKelasItem {
  id: string;
  nama: string;
  subtesNama: string | null;
  programKategori: string;
  tingkatKelas: string;
  tingkatKelasLabel: string;
  jadwal: string;
  jumlahSiswa: number;
  kapasitas: number | null;
  linkMeetBelumDiatur: boolean;
}

export interface MentorKelasDetail {
  id: string;
  nama: string;
  mentorId: string | null;
  subtesNama: string | null;
  tingkatKelasLabel: string;
  jumlahSiswa: number;
  linkMeet: string | null;
  jumlahSesi: number;
  /** kelas.tipe_kelas — kelas private memakai link Meet PER SISWA (lib/shared/linkMeet.ts). */
  tipeKelas: string | null;
}

export interface MentorMateriItem {
  id: string;
  judul: string;
  tipe: "video" | "dokumen" | "rangkuman_teks";
  status: "draft" | "published" | "ditolak";
  sumber: "ai_generated" | "upload_mentor";
  createdAt: string;
}

type NamaJoin = { nama: string } | { nama: string }[] | null;

function firstNama(value: NamaJoin): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  return row?.nama ?? null;
}

/** Halaman list — semua kelas yang terkait mentor ini (lib/mentor/aksesMentor.ts). */
export async function getMentorKelasSaya(userId: string): Promise<MentorKelasItem[]> {
  const [aksesMap, milik] = await Promise.all([getKelasAksesMentor(userId), getEnrollmentMilikMentor(userId)]);
  if (aksesMap.size === 0) return [];

  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      "id, nama, program_kategori, tingkat_kelas, jadwal, kapasitas, link_meet, subtes:subtes_id(nama), enrollments(id, status_pembayaran)",
    )
    .in("id", Array.from(aksesMap.keys()));

  if (error) {
    console.error("[getMentorKelasSaya] query failed:", error);
    return [];
  }

  type Row = {
    id: string;
    nama: string;
    program_kategori: string;
    tingkat_kelas: string;
    jadwal: unknown;
    kapasitas: number | null;
    link_meet: string | null;
    subtes: NamaJoin;
    enrollments: { id: string; status_pembayaran: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    nama: row.nama,
    subtesNama: firstNama(row.subtes),
    programKategori: row.program_kategori,
    tingkatKelas: row.tingkat_kelas,
    tingkatKelasLabel: TINGKAT_KELAS_LABEL[row.tingkat_kelas] ?? row.tingkat_kelas,
    jadwal: formatJadwal(row.jadwal),
    // Hanya siswa MILIK mentor ini (lib/shared/siswaMentor.ts): diterima mentor ini / pemilik implisit /
    // siswa lama / ditugaskan tatap muka — sama dengan profil mentor di Admin dan dashboard.
    jumlahSiswa: (row.enrollments ?? []).filter((e) => e.status_pembayaran === "lunas" && milik.has(e.id)).length,
    kapasitas: row.kapasitas,
    linkMeetBelumDiatur: !row.link_meet,
  }));
}

/**
 * Halaman detail — 1 kelas, plus data buat guard (mentorId). `mentorUserId` diisi → `jumlahSiswa` = siswa
 * MILIK mentor itu (sama dengan kartu di daftar Kelas Saya); kosong → semua siswa lunas kelas.
 */
export async function getMentorKelasDetail(kelasId: string, mentorUserId?: string): Promise<MentorKelasDetail | null> {
  // Kepemilikan siswa (rantai round-trip) dan baris kelas saling independen — dibaca barengan.
  const [milik, { data, error }] = await Promise.all([
    mentorUserId ? getEnrollmentMilikMentor(mentorUserId) : Promise.resolve(null),
    supabaseServer
      .from("kelas")
      .select(
        "id, nama, mentor_id, tingkat_kelas, tipe_kelas, link_meet, jumlah_sesi, subtes:subtes_id(nama), enrollments(id, status_pembayaran)",
      )
      .eq("id", kelasId)
      .maybeSingle(),
  ]);

  if (error) {
    console.error("[getMentorKelasDetail] query failed:", error);
    return null;
  }
  if (!data) return null;

  type Row = {
    id: string;
    nama: string;
    mentor_id: string | null;
    tingkat_kelas: string;
    link_meet: string | null;
    jumlah_sesi: number;
    tipe_kelas?: string | null;
    subtes: NamaJoin;
    enrollments: { id: string; status_pembayaran: string }[] | null;
  };
  const row = data as unknown as Row;

  return {
    id: row.id,
    nama: row.nama,
    mentorId: row.mentor_id,
    subtesNama: firstNama(row.subtes),
    tingkatKelasLabel: TINGKAT_KELAS_LABEL[row.tingkat_kelas] ?? row.tingkat_kelas,
    jumlahSiswa: (row.enrollments ?? []).filter((e) => e.status_pembayaran === "lunas" && (!milik || milik.has(e.id))).length,
    linkMeet: row.link_meet,
    jumlahSesi: row.jumlah_sesi,
    tipeKelas: row.tipe_kelas ?? null,
  };
}

export interface SesiSiswaItem {
  enrollmentId: string;
  userId: string;
  nama: string;
  avatarUrl: string | null;
  /** Sesi TERKONFIRMASI (siswa/otomatis) — dasar "Sesi X dari Y"; bukan jumlah yang ditandai. */
  sesiValidCount: number;
  /** Ditandai mentor, belum dijawab siswa, 24 jam belum lewat. */
  sesiMenungguSiswa: number;
  /** Disangkal siswa, menunggu keputusan Admin. */
  sesiDisangkal: number;
  /** Mentor INI sudah menandai siswa ini hari ini (hari kalender WIB) —
   * maks. satu per mentor per hari; mentor lain tetap boleh. */
  ditandaiHariIni: boolean;
  /** Jumlah sesi siswa ini yang ditandai oleh mentor INI (selain progress total). */
  sesiDitandaiSaya: number;
  /** Semua sesi yang sudah ditandai (oleh mentor mana pun), urut nomor sesi. */
  riwayat: SesiMentorRiwayat[];
  /** Nomor sesi paling kecil yang BELUM ditandai mentor — null kalau semua
   * sesi (1..jumlahSesi) sudah ditandai (tombol "Tandai Selesai" disembunyikan). */
  sesiBerikutnya: number | null;
  /**
   * Penjaga penerimaan siswa: null = mentor boleh menandai sesi siswa ini; selain itu
   * alasan diblokir (menunggu diterima / sudah diterima mentor lain / data gagal dibaca
   * = fail-closed). UI menonaktifkan tombol tandai bila tidak null.
   */
  diblokirPenerimaan: AlasanBlokirPenerimaan | null;
  /**
   * Link Meet PER SISWA — hanya untuk kelas private (null = bukan private, UI tidak menampilkan input).
   * `link` = link yang BERLAKU (pengisinya masih mentor berhak); `tidakBerlaku` = ada link lama yang
   * sudah tidak berlaku (mis. penerima berganti) sehingga perlu diisi ulang.
   */
  linkMeetSiswa: { link: string | null; tidakBerlaku: boolean } | null;
}

/**
 * Baris daftar "Menunggu diterima" (satu per siswa-subtes). Info SEMINIMAL untuk memutuskan menerima:
 * nama, subtes, dan jadwal pilihan siswa (bila ada). Tidak ada foto, link Meet, progres, atau data lain.
 */
export interface MenungguDiterimaItem {
  enrollmentSubtesId: string;
  enrollmentId: string;
  siswaNama: string;
  subtesNama: string;
  /** Pilihan jadwal siswa (maks. 2, urut Pilihan 1-2), mis. "Senin, 19:00 WIB"; kosong bila tidak memilih. */
  jadwalPilihan: string[];
}

/** Hasil pembaca detail kelas untuk SATU mentor: siswa miliknya (Absensi) + siswa yang menunggu ia terima. */
export interface SesiKelasMentor {
  siswa: SesiSiswaItem[];
  menunggu: MenungguDiterimaItem[];
}

export interface SesiMentorRiwayat {
  nomorSesi: number;
  tanggalDilaksanakan: string | null;
  /** "Nama Mentor — Mapel" — null untuk sesi lama (mentor_id NULL). */
  mentorLabel: string | null;
  olehSaya: boolean;
  status: StatusSesiEfektif;
}

type UserJoin = { id: string; nama: string; avatar_url: string | null } | { id: string; nama: string; avatar_url: string | null }[] | null;

function firstUser(value: UserJoin): { id: string; nama: string; avatar_url: string | null } | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Detail kelas untuk SATU mentor — privasi antar mentor (keputusan Rio): di kelas multi-mentor, siswa yang
 * sudah diterima mentor A TIDAK terlihat oleh mentor lain. Penyaringan terjadi di SERVER, SEBELUM data
 * siswa dibaca/dikirim ke komponen klien:
 *  1. Tahap 1 hanya membaca kolom minimal (id, tanggal daftar, mentor tatap muka) + penerimaan per subtes.
 *  2. `siswa` (daftar Absensi Sesi) = HANYA siswa MILIK mentor ini menurut lib/shared/siswaMentor.ts
 *     (diterima / pemilik implisit / siswa lama / tatap muka). Nama, foto, sesi, dan link Meet siswa hanya
 *     dibaca untuk mereka.
 *  3. `menunggu` = siswa-subtes yang DIPEGANG mentor ini dan belum diterima siapa pun (kandidat melihatnya
 *     sampai ada yang menerima; setelah diterima hilang dari mentor lain). Hanya nama, subtes, jadwal pilihan.
 *  Data penerimaan gagal dibaca → kosong (fail-closed: kepemilikan tidak bisa dipastikan, jangan tampilkan).
 *
 * Progress sesi (Absensi, PRD 7.5.5): `sesiValidCount` pakai definisi bersama lib/shared/progresSesi.ts
 * (BR-34/FR-A4) — hanya sesi terkonfirmasi siswa / otomatis. `sesiBerikutnya` & `ditandaiHariIni` tetap
 * berdasar sesi yang SUDAH DITANDAI. Rincian status per sesi dari lib/shared/statusSesi.ts.
 */
export async function getSesiKelasMentor(
  kelasId: string,
  mentorId: string,
  akses: AksesMentor,
  opsi: { tipeKelas?: string | null } = {},
): Promise<SesiKelasMentor> {
  const kosong: SesiKelasMentor = { siswa: [], menunggu: [] };

  // Tahap 1 — kolom MINIMAL. Mentor tatap muka cuma menyentuh siswa yang ditugaskan ke dia.
  let dasarQuery = supabaseServer
    .from("enrollments")
    .select("id, tanggal_daftar, mentor_offline_id")
    .eq("kelas_id", kelasId)
    .eq("status_pembayaran", "lunas");
  if (akses === "offline") dasarQuery = dasarQuery.eq("mentor_offline_id", mentorId);
  const { data: dasarRows, error: dasarError } = await dasarQuery;
  if (dasarError) {
    console.error("[getSesiKelasMentor] query enrollments failed:", dasarError);
    return kosong;
  }
  const dasar = (dasarRows ?? []).map((row) => ({
    id: row.id as string,
    tanggalDaftar: (row.tanggal_daftar as string | null) ?? null,
    mentorOfflineId: (row.mentor_offline_id as string | null) ?? null,
  }));
  if (dasar.length === 0) return kosong;

  // Status penerimaan per subtes — SEKALI untuk semua siswa (maks. 4 query).
  const penerimaan = await getPenerimaanSubtesSiswa(
    mentorId,
    dasar.map((row) => row.id),
  );
  if (penerimaan === "gagal") return kosong;

  const milikIds = new Set(
    dasar
      .filter((row) =>
        milikDariPenerimaan({
          mentorId,
          tanggalDaftar: row.tanggalDaftar,
          mentorOfflineId: row.mentorOfflineId,
          terkaitKelas: akses !== "offline",
          subtes: penerimaan.get(row.id) ?? [],
        }),
      )
      .map((row) => row.id),
  );
  const menungguPerEnrollment = new Map<string, SubtesSiswaDetail[]>();
  for (const row of dasar) {
    const menunggu = (penerimaan.get(row.id) ?? []).filter((sub) => sub.mentorMemegang && sub.status === "menunggu");
    if (menunggu.length > 0) menungguPerEnrollment.set(row.id, menunggu);
  }

  // Tahap 2 — detail HANYA untuk siswa milik mentor ini; info minimal untuk yang menunggu.
  const milikDaftar = Array.from(milikIds);
  const menungguIds = Array.from(menungguPerEnrollment.keys());
  const [milikRes, menungguRes, sesiRes] = await Promise.all([
    milikDaftar.length > 0
      ? supabaseServer
          .from("enrollments")
          .select("id, link_meet, link_meet_oleh, users:user_id(id, nama, avatar_url)")
          .in("id", milikDaftar)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    menungguIds.length > 0
      ? supabaseServer.from("enrollments").select("id, jadwal_pilihan, users:user_id(nama)").in("id", menungguIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    milikDaftar.length > 0
      ? supabaseServer
          .from("sesi_kelas")
          .select(
            "enrollment_id, nomor_sesi, tanggal_dilaksanakan, dikonfirmasi_mentor, dikonfirmasi_mentor_pada, status_siswa, dikonfirmasi_siswa_pada, mentor_id, nama_mapel, mentor:mentor_id(nama)",
          )
          .in("enrollment_id", milikDaftar)
          .order("nomor_sesi", { ascending: true })
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (milikRes.error || menungguRes.error) {
    console.error("[getSesiKelasMentor] query detail enrollments failed:", milikRes.error ?? menungguRes.error);
    return kosong;
  }
  if (sesiRes.error) {
    console.error("[getSesiKelasMentor] query sesi_kelas failed:", sesiRes.error);
  }

  type SesiRow = {
    enrollment_id: string;
    nomor_sesi: number;
    dikonfirmasi_mentor: boolean;
    dikonfirmasi_mentor_pada: string | null;
    status_siswa: string;
    dikonfirmasi_siswa_pada: string | null;
    tanggal_dilaksanakan?: string | null;
    mentor_id?: string | null;
    nama_mapel?: string | null;
    mentor?: { nama: string } | { nama: string }[] | null;
  };
  const sesiByEnrollment = new Map<string, SesiRow[]>();
  for (const row of (sesiRes.data ?? []) as unknown as SesiRow[]) {
    const list = sesiByEnrollment.get(row.enrollment_id) ?? [];
    list.push(row);
    sesiByEnrollment.set(row.enrollment_id, list);
  }

  // Link Meet per siswa (kelas private): mentor berhak per siswa dihitung dari data penerimaan yang sama.
  const kelasPrivate = isKelasPrivate(opsi.tipeKelas);
  const berhakLink = kelasPrivate && milikDaftar.length > 0 ? await getMentorBerhakLinkMeet(kelasId, milikDaftar, penerimaan) : null;

  const now = new Date();
  const hariIni = rentangHariWib(now);

  const siswa = (milikRes.data as unknown as { id: string; link_meet?: string | null; link_meet_oleh?: string | null; users: UserJoin }[])
    .map((row) => {
      const user = firstUser(row.users);
      if (!user) return null;
      const sesiList = sesiByEnrollment.get(row.id) ?? [];
      const statusList = sesiList.map((s) => hitungStatusSesi(s, now).status);
      const ditandaiHariIni = sesiList.some(
        (s) =>
          s.dikonfirmasi_mentor &&
          s.mentor_id === mentorId &&
          s.dikonfirmasi_mentor_pada !== null &&
          Date.parse(s.dikonfirmasi_mentor_pada) >= Date.parse(hariIni.mulai) &&
          Date.parse(s.dikonfirmasi_mentor_pada) < Date.parse(hariIni.akhir),
      );
      const sesiBerikutnya = sesiList.find((s) => !s.dikonfirmasi_mentor)?.nomor_sesi ?? null;
      return {
        enrollmentId: row.id,
        userId: user.id,
        nama: user.nama,
        avatarUrl: user.avatar_url,
        sesiValidCount: hitungSesiTerkonfirmasi(sesiList, now),
        sesiMenungguSiswa: statusList.filter((st) => st === "menunggu_siswa").length,
        sesiDisangkal: statusList.filter((st) => st === "disangkal_menunggu_review").length,
        ditandaiHariIni,
        sesiDitandaiSaya: sesiList.filter((s) => s.dikonfirmasi_mentor && s.mentor_id === mentorId).length,
        riwayat: sesiList
          .map((s, i) => ({ s, status: statusList[i] }))
          .filter(({ status }) => status !== "belum_terjadi")
          .map(({ s, status }) => {
            const mentor = Array.isArray(s.mentor) ? (s.mentor[0] ?? null) : (s.mentor ?? null);
            return {
              nomorSesi: s.nomor_sesi,
              tanggalDilaksanakan: s.tanggal_dilaksanakan ?? null,
              mentorLabel: labelMentorSesi(mentor?.nama, s.nama_mapel),
              olehSaya: s.mentor_id === mentorId,
              status,
            };
          }),
        sesiBerikutnya,
        diblokirPenerimaan: alasanDiblokirPenerimaan({ mentorId, subtesSiswa: penerimaan.get(row.id) ?? [] }),
        linkMeetSiswa: kelasPrivate
          ? (() => {
              const hasil = resolveLinkMeet({
                tipeKelas: opsi.tipeKelas,
                linkEnrollment: row.link_meet,
                linkEnrollmentOleh: row.link_meet_oleh,
                // Data gagal dibaca = tidak ada mentor berhak (link tidak ditampilkan, fail-closed).
                penerimaMentorIds: berhakLink === "gagal" || berhakLink === null ? [] : (berhakLink.get(row.id) ?? []),
                linkKelas: null,
              });
              return { link: hasil.link, tidakBerlaku: hasil.tidakBerlaku };
            })()
          : null,
      };
    })
    .filter((item): item is SesiSiswaItem => item !== null);

  const menunggu: MenungguDiterimaItem[] = [];
  for (const row of (menungguRes.data ?? []) as unknown as { id: string; jadwal_pilihan: unknown; users: { nama: string } | { nama: string }[] | null }[]) {
    const nama = (Array.isArray(row.users) ? row.users[0]?.nama : row.users?.nama) ?? "Siswa";
    for (const sub of menungguPerEnrollment.get(row.id) ?? []) {
      menunggu.push({
        enrollmentSubtesId: sub.enrollmentSubtesId,
        enrollmentId: row.id,
        siswaNama: nama,
        subtesNama: sub.subtesNama,
        jadwalPilihan: parseJadwalSlots(row.jadwal_pilihan).map(formatSlot),
      });
    }
  }
  menunggu.sort((a, b) => a.siswaNama.localeCompare(b.siswaNama, "id") || a.subtesNama.localeCompare(b.subtesNama, "id"));

  return { siswa, menunggu };
}

/** Daftar Absensi Sesi saja (lihat getSesiKelasMentor — HANYA siswa milik mentor ini). */
export async function getSesiSiswaByKelasId(
  kelasId: string,
  mentorId: string,
  akses: AksesMentor,
  opsi: { tipeKelas?: string | null } = {},
): Promise<SesiSiswaItem[]> {
  return (await getSesiKelasMentor(kelasId, mentorId, akses, opsi)).siswa;
}

/** List materi SEMUA status (beda dari halaman Siswa yang cuma tampilkan published). */
export async function getMentorMateriList(kelasId: string): Promise<MentorMateriItem[]> {
  const { data, error } = await supabaseServer
    .from("materi")
    .select("id, judul, tipe, status, sumber, created_at")
    .eq("kelas_id", kelasId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getMentorMateriList] query failed:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    judul: row.judul as string,
    tipe: row.tipe as MentorMateriItem["tipe"],
    status: row.status as MentorMateriItem["status"],
    sumber: row.sumber as MentorMateriItem["sumber"],
    createdAt: row.created_at as string,
  }));
}
