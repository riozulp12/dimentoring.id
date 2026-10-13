-- Migration: saklar "Tampilkan di katalog" per Kelas (kolom `tampil_di_katalog`
-- di tabel `kelas`) — PRD Bagian 13. Default TRUE, jadi semua kelas yang sudah
-- ada tetap tampil seperti biasa.
--
-- false = kelas DISEMBUNYIKAN dari katalog publik (/program, /program/[kategori],
-- /program/kelas/[id]), rekomendasi (Kelas Saya & hasil Assessment), dan
-- checkout. TIDAK menyentuh kelas yang sudah diikuti: siswa terdaftar, mentor
-- pengampu, honor, dan siswa binaan tetap melihat kelas ini seperti biasa.
-- Dipakai mis. untuk kelas lama/legacy yang dibeli di luar katalog (lihat
-- db/legacy_kelas_manual_TEMPLATE.sql).
--
-- WAJIB dijalankan SEBELUM kode yang memfilter kolom ini di-deploy — tanpa
-- kolom ini query katalog gagal dan /program tampil kosong.
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

ALTER TABLE kelas ADD COLUMN IF NOT EXISTS tampil_di_katalog BOOLEAN NOT NULL DEFAULT true;
