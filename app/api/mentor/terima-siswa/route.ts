import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { terimaSiswaSubtes, type AlasanTolakTerima } from "@/lib/mentor/terimaSiswa";

/**
 * "Terima siswa" (Mentor) — penerimaan siswa per subtes, siapa cepat dia dapat
 * (lib/shared/penerimaanSiswa.ts). Peran & mentorId SELALU dari cookie sesi
 * (server), TIDAK PERNAH dari body — body cuma { enrollmentSubtesId }. Seluruh
 * validasi (mentor aktif, pemegang subtes itu, siswa baru, klaim atomik) ada di
 * terimaSiswaSubtes.
 */

interface TerimaSiswaBody {
  enrollmentSubtesId?: unknown;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

const PESAN_TOLAK: Record<AlasanTolakTerima, { status: number; pesan: string }> = {
  sudah_diterima_mentor_lain: { status: 409, pesan: "Siswa sudah diterima mentor lain." },
  bukan_mentor_subtes: { status: 403, pesan: "Kamu bukan pengampu subtes ini di kelas tersebut." },
  mentor_tidak_aktif: { status: 403, pesan: "Fitur mengajar terkunci selama akun kamu masih 'On Review'." },
  tidak_ditemukan: { status: 404, pesan: "Siswa tidak ditemukan. Muat ulang halaman." },
  tidak_perlu_klaim: { status: 422, pesan: "Siswa ini tidak perlu diterima — kamu sudah bisa langsung mengajarnya." },
  pendaftaran_sebelum_pemberlakuan: {
    status: 422,
    pesan: "Siswa ini terdaftar sebelum fitur penerimaan berlaku, jadi tidak perlu diterima.",
  },
  gagal: { status: 500, pesan: "Gagal menerima siswa. Coba lagi nanti." },
};

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);
  if (session.role !== "mentor") return errorResponse("Cuma Mentor yang bisa menerima siswa.", 403);

  let body: TerimaSiswaBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }
  const enrollmentSubtesId = body?.enrollmentSubtesId;
  if (!enrollmentSubtesId || typeof enrollmentSubtesId !== "string") {
    return errorResponse("Siswa tidak valid.", 400);
  }

  const hasil = await terimaSiswaSubtes({ mentorId: session.userId, enrollmentSubtesId });
  if (!hasil.ok) {
    const { status, pesan } = PESAN_TOLAK[hasil.alasan];
    return errorResponse(pesan, status);
  }

  return NextResponse.json({ success: true, sudahMilikSendiri: hasil.sudahMilikSendiri === true });
}
