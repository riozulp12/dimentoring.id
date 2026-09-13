-- Migration: pilihan Subtes siswa yang MASIH MENUNGGU pembayaran (PRD Bagian
-- 7.5, Bagian 13 — payment_subtes_pilihan BARU, bukan permintaan Rio langsung
-- tapi diperlukan teknis untuk memenuhinya). Enrollment baru dibuat di webhook
-- Payment SETELAH sukses (lihat app/api/payment/webhook/route.ts) — di titik
-- checkout (app/api/payment/create/route.ts) belum ada baris enrollments sama
-- sekali, jadi pilihan subtes siswa DITAMPUNG di sini dulu (per payment,
-- bukan per enrollment) sampai webhook sukses memindahkannya ke
-- enrollment_subtes. Baris di sini TIDAK PERNAH dibaca ulang setelah payment
-- final (sukses ATAU gagal) — cukup riwayat teknis, bukan data yang perlu
-- ditampilkan di mana pun.
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

CREATE TABLE IF NOT EXISTS payment_subtes_pilihan (
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    subtes_id UUID NOT NULL REFERENCES subtes(id) ON DELETE CASCADE,
    PRIMARY KEY (payment_id, subtes_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_subtes_pilihan_payment ON payment_subtes_pilihan(payment_id);

-- RLS wajib aktif di semua tabel (CLAUDE.md) — akses lewat service_role key
-- di server saja, tidak ada policy granular untuk anon/client.
ALTER TABLE payment_subtes_pilihan ENABLE ROW LEVEL SECURITY;
