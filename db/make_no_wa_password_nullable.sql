-- Revisi arsitektur Register/Login (Agustus 2026, PRD Bagian 7.0.1/7.0.2 DIREVISI TOTAL).
--
-- Akun sekarang dibuat di /daftar HANYA dengan email+nama+password (atau Google
-- OAuth tanpa password sama sekali) — nomor WhatsApp baru diminta belakangan di
-- /lengkapi-profil. Konsekuensinya:
--   - users.no_wa harus boleh NULL sementara (sampai lengkapi-profil selesai).
--   - users.password_hash harus boleh NULL permanen untuk akun yang HANYA pernah
--     login lewat Google (tidak pernah set password lokal).
--
-- Aman dijalankan berkali-kali (DROP NOT NULL pada kolom yang sudah nullable = no-op).
-- Tidak mempengaruhi data existing (baris lama yang sudah punya no_wa/password_hash
-- tetap apa adanya, cuma constraint-nya yang dilonggarkan untuk baris BARU).

ALTER TABLE users ALTER COLUMN no_wa DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
