import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validateKelasInput, type KelasInputBody } from "@/lib/admin/validateKelasInput";
import { periksaPromoAktifUntukKelas } from "@/lib/admin/periksaPromoAktifUntukKelas";
import { periksaLepasMentorKelas, rencanakanBekukanPemilik, simpanMentorKelasAtomik } from "@/lib/admin/rencanaMentorKelas";

/** Edit/Hapus Kelas — PRD Bagian 7.5 & 7.5.3 (Admin, Kelola Kelas). */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function requireAdmin(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return { session: null, error: errorResponse("Belum login.", 401) };
  if (session.role !== "admin") {
    return { session: null, error: errorResponse("Cuma Admin yang bisa mengelola kelas.", 403) };
  }
  return { session, error: null };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ kelasId: string }> }) {
  const { error: authError } = requireAdmin(request);
  if (authError) return authError;

  const { kelasId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("kelas")
    .select("id")
    .eq("id", kelasId)
    .maybeSingle();
  if (existingError) {
    console.error("[kelola-kelas PATCH] query existing failed:", existingError);
    return errorResponse("Gagal memuat kelas. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Kelas tidak ditemukan.", 404);
  }

  let body: KelasInputBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const result = await validateKelasInput(body);
  if (!result.ok) {
    return errorResponse(result.error, 400);
  }

  // Pagar margin dua arah: keadaan AKHIR kelas (private online) tidak boleh tertembus promo aktif yang
  // mencakupnya. Hanya membaca, dan sebelum penulisan apa pun.
  const pagarPromo = await periksaPromoAktifUntukKelas(kelasId, result.data);
  if (!pagarPromo.ok) return errorResponse(pagarPromo.error, pagarPromo.status);

  const { mentor_ids: mentorIds, subtes_ids: subtesIds, subtes_mentor_pairs: subtesMentorPairs, ...kelasData } =
    result.data;

  // Penjaga lepas mentor (hanya MEMBACA, sebelum penulisan apa pun): mentor yang dilepas dari sebuah
  // subtes tidak boleh masih memegang siswa kelas ini pada subtes itu (enrollment_subtes.mentor_id).
  // 409 = pindahkan siswanya dulu; gagal baca = 500 dan tidak ada yang tersimpan.
  const pasanganBaru = subtesMentorPairs.map((pair) => ({ subtesId: pair.subtes_id, mentorId: pair.mentor_id }));
  const periksa = await periksaLepasMentorKelas(kelasId, pasanganBaru);
  if (!periksa.ok) return errorResponse(periksa.error, periksa.status);

  // Bekukan pemilik (B5, hanya MEMBACA): bila pemegang aktif sebuah subtes naik dari 1 ke >=2, siswa baru
  // yang masih mentor_id NULL dibekukan ke pemegang tunggal lama. Pembekuan + simpan mentor harus ATOMIK
  // -> satu transaksi lewat fungsi SQL simpan_mentor_kelas, dipanggil SEBELUM data kelas diubah supaya
  // kegagalan (termasuk fungsi belum dipasang) tidak meninggalkan perubahan setengah jalan.
  // Tanpa yang perlu dibekukan, simpan mentor memakai jalur biasa di bawah.
  const rencanaBekukan = await rencanakanBekukanPemilik(kelasId, periksa.lama, pasanganBaru);
  if (!rencanaBekukan.ok) return errorResponse(rencanaBekukan.error, rencanaBekukan.status);
  const mentorDisimpanAtomik = rencanaBekukan.bekukan.length > 0;
  if (mentorDisimpanAtomik) {
    const atomik = await simpanMentorKelasAtomik({
      kelasId,
      pasangan: pasanganBaru,
      mentorIds,
      bekukan: rencanaBekukan.bekukan,
    });
    if (!atomik.ok) return errorResponse(atomik.error, atomik.status);
  }

  const { error: updateError } = await supabaseServer.from("kelas").update(kelasData).eq("id", kelasId);

  if (updateError) {
    console.error("[kelola-kelas PATCH] update failed:", updateError);
    return errorResponse("Gagal menyimpan perubahan. Coba lagi nanti.", 500);
  }

  // Replace penuh (bukan tambah terus-menerus) — hapus baris lama dulu,
  // baru insert pilihan baru. Urutan: kelas_subtes_mentor dulu (paling
  // spesifik) baru kelas_mentor/kelas_subtes (daftar datar).
  if (!mentorDisimpanAtomik) {
    const { error: mentorDeleteError } = await supabaseServer.from("kelas_mentor").delete().eq("kelas_id", kelasId);
    if (mentorDeleteError) {
      console.error("[kelola-kelas PATCH] delete kelas_mentor failed:", mentorDeleteError);
      return errorResponse("Kelas tersimpan, tapi gagal memperbarui mentor. Coba lagi.", 500);
    }
    if (mentorIds.length > 0) {
      const { error: mentorInsertError } = await supabaseServer
        .from("kelas_mentor")
        .insert(mentorIds.map((mentorId) => ({ kelas_id: kelasId, mentor_id: mentorId })));
      if (mentorInsertError) {
        console.error("[kelola-kelas PATCH] insert kelas_mentor failed:", mentorInsertError);
        return errorResponse("Kelas tersimpan, tapi gagal memperbarui mentor. Coba lagi.", 500);
      }
    }
  }

  const { error: subtesDeleteError } = await supabaseServer.from("kelas_subtes").delete().eq("kelas_id", kelasId);
  if (subtesDeleteError) {
    console.error("[kelola-kelas PATCH] delete kelas_subtes failed:", subtesDeleteError);
    return errorResponse("Kelas tersimpan, tapi gagal memperbarui subtes. Coba lagi.", 500);
  }
  if (subtesIds.length > 0) {
    const { error: subtesInsertError } = await supabaseServer
      .from("kelas_subtes")
      .insert(subtesIds.map((subtesId) => ({ kelas_id: kelasId, subtes_id: subtesId })));
    if (subtesInsertError) {
      console.error("[kelola-kelas PATCH] insert kelas_subtes failed:", subtesInsertError);
      return errorResponse("Kelas tersimpan, tapi gagal memperbarui subtes. Coba lagi.", 500);
    }
  }

  if (!mentorDisimpanAtomik) {
    const { error: pairDeleteError } = await supabaseServer
      .from("kelas_subtes_mentor")
      .delete()
      .eq("kelas_id", kelasId);
    if (pairDeleteError) {
      console.error("[kelola-kelas PATCH] delete kelas_subtes_mentor failed:", pairDeleteError);
      return errorResponse("Kelas tersimpan, tapi gagal memperbarui pasangan Subtes-Mentor. Coba lagi.", 500);
    }
    if (subtesMentorPairs.length > 0) {
      const { error: pairInsertError } = await supabaseServer.from("kelas_subtes_mentor").insert(
        subtesMentorPairs.map((pair) => ({
          kelas_id: kelasId,
          subtes_id: pair.subtes_id,
          mentor_id: pair.mentor_id,
        })),
      );
      if (pairInsertError) {
        console.error("[kelola-kelas PATCH] insert kelas_subtes_mentor failed:", pairInsertError);
        return errorResponse("Kelas tersimpan, tapi gagal memperbarui pasangan Subtes-Mentor. Coba lagi.", 500);
      }
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ kelasId: string }> }) {
  const { error: authError } = requireAdmin(request);
  if (authError) return authError;

  const { kelasId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("kelas")
    .select("id")
    .eq("id", kelasId)
    .maybeSingle();
  if (existingError) {
    console.error("[kelola-kelas DELETE] query existing failed:", existingError);
    return errorResponse("Gagal memuat kelas. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Kelas tidak ditemukan.", 404);
  }

  // Cek enrollments (SEMUA status, bukan cuma lunas — siswa yang masih
  // 'menunggu' pembayaran juga kehilangan pendaftarannya kalau kelas dihapus)
  // SEBELUM benar-benar hapus — jangan biarkan kelas dengan siswa aktif
  // hilang begitu saja tanpa peringatan.
  const { count: enrollmentCount, error: enrollmentError } = await supabaseServer
    .from("enrollments")
    .select("*", { count: "exact", head: true })
    .eq("kelas_id", kelasId);

  if (enrollmentError) {
    console.error("[kelola-kelas DELETE] query enrollments failed:", enrollmentError);
    return errorResponse("Gagal memeriksa siswa terdaftar. Coba lagi nanti.", 500);
  }
  if ((enrollmentCount ?? 0) > 0) {
    return errorResponse(
      `Kelas ini masih punya ${enrollmentCount} siswa terdaftar (termasuk yang menunggu pembayaran). Pindahkan atau batalkan pendaftaran siswa itu dulu sebelum menghapus kelas.`,
      409,
    );
  }

  const { error: deleteError } = await supabaseServer.from("kelas").delete().eq("id", kelasId);

  if (deleteError) {
    console.error("[kelola-kelas DELETE] delete failed:", deleteError);
    // Kemungkinan masih ada materi/referensi lain yang terikat ke kelas ini.
    return errorResponse(
      "Gagal menghapus kelas — kemungkinan masih ada materi atau data lain yang terikat ke kelas ini.",
      409,
    );
  }

  return NextResponse.json({ success: true });
}
