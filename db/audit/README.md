# Audit data uji (read-only)

`audit-data-uji.sql` berisi 13 kueri **SELECT** untuk dijalankan di Supabase SQL Editor sebelum
membersihkan data uji. **Tidak ada** pernyataan yang mengubah data atau skema. Preview dan Production
memakai satu database dan Mayar bersifat live, jadi hasil audit adalah *kandidat untuk ditinjau*,
bukan daftar yang boleh langsung dihapus.

## Cara menjalankan

SQL Editor hanya menampilkan hasil pernyataan terakhir. Tiap kueri di berkas ini mandiri dan menghasilkan
satu tabel: seleksi satu kueri (dari komentar `-- >>> KODE` sampai `;` pertama), lalu Run.

| Urutan | Kode | Isi |
|---|---|---|
| 1 | Q0 | Ringkasan semua kategori (kategori, jumlah, contoh_id_atau_nama, catatan) |
| 2 | A1 | Kelas uji |
| 3 | B1, B2 | Mekanisme sembunyi (`kelas.tampil_di_katalog`) dan nilainya sekarang |
| 4 | C1, C2 | Enrollment di kelas uji (agregat; daftar siswa) |
| 5 | D1 | Siswa: KANDIDAT HAPUS vs JANGAN HAPUS |
| 6 | E1 | Pembayaran kelas uji (cek dashboard Mayar) |
| 7 | F1 | Akun QA / mentor uji |
| 8 | G1 | Kelas asli yang tercemar akun QA (kandidat dilepas, bukan dihapus) |
| 9 | H1 | Email mentor aktif + kelas yang diampu (jangan kirim email apa pun) |
| 10 | I1 | Data turunan per tabel |
| 11 | J1 | Leads / asesmen uji |

## Definisi "uji" (bisa diubah di CTE `kelas_uji` / `akun_qa`, tersalin di tiap kueri)

- **Kelas uji:** nama memuat `[UJI]`, atau harga (setelah diskon) ≤ Rp10.000, atau nama berpola uji
  (kata utuh `uji|test|testing|dummy|sandbox|percobaan|qa`). Kolom `keyakinan` dan `alasan_uji`
  menunjukkan kenapa terdeteksi; kelas berharga Rp0 yang memang gratis sungguhan bisa ikut terdeteksi.
- **Akun QA:** email plus-address (`+`), domain uji (`example.com`, `mailinator.com`, dst.), email/nama
  berpola uji, atau email memuat `eduspark`.

## Mekanisme menyembunyikan kelas

`kelas.tampil_di_katalog` (BOOLEAN, default `true`; `db/add_kelas_tampil_di_katalog.sql`). `false` =
hilang dari katalog `/program`, rekomendasi, hasil asesmen, dan checkout; `/program/kelas/[id]` menjadi 404;
siswa yang sudah terdaftar tetap melihat kelasnya. Tidak ada kolom status/arsip lain.

## Hal yang perlu diketahui

- **Email asli tidak ditulis di berkas ini** (mengikuti `db/cleanup_enrollment_uji_TEMPLATE.sql`:
  email asli tidak masuk repo). Mentor Eduspark ditangkap lewat pola `%eduspark%`.
- **payments tidak punya kolom provider / ID Mayar khusus.** ID Mayar = `gateway_reference`, `order_id` =
  ID dari kita, `metode` = metode bayar. Transaksi sandbox tidak terbedakan dari yang asli lewat API,
  jadi status `berhasil` di E1 harus dicek di dashboard Mayar.
- **Cakupan data turunan (I1) berdasar FK.** `notifikasi` dan `notifikasi_wa_log` tidak punya FK ke
  kelas/enrollment: hanya terdeteksi lewat teks (`link_tujuan` memuat id kelas; `kunci_kejadian` memuat id
  enrollment/payment). Notifikasi mentor "siswa baru" bisa tidak terdeteksi.
- **Tidak diperiksa:** `konten_info_interactions`, `ai_mentor_logs`, `user_mapel_tersulit`,
  `verification_tokens`, `password_reset_tokens`, `admin_invitations`, `mentor_soal_reward_log`,
  dan `kode_promo` buatan akun QA.
- **Urutan penghapusan nanti** (di luar berkas ini): lihat `db/cleanup_enrollment_uji_TEMPLATE.sql` —
  ada FK tanpa cascade (`enrollments.kelas_id`, `payments.user_id`, `materi.kelas_id`, `referrals`,
  `reward_redemptions`) yang memblokir penghapusan bila urutannya salah.

## Cara berkas ini diperiksa

Dimuat ke Postgres sementara (pglite) dari `db/schema.sql` + `db/add_*.sql`; semua kueri dijalankan di database
kosong dan berisi data contoh (kelas uji/asli, akun Eduspark, pembayaran, lead). Nama kolom divalidasi oleh
Postgres, bukan ditebak. Belum dijalankan di database Supabase yang sebenarnya.
