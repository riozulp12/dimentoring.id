# Desain — Studio Soal SNBT Tahap 1

> **Status:** DISETUJUI (18 Oktober 2026) dengan keputusan final di bawah. Implementasi PR 1 (skema) & PR 2 (modul murni).
> **Branch:** `feat/studio-soal-v1` (dari `origin/main` 59ffe18) · **Tanggal:** 18 Oktober 2026
> **Cakupan Tahap 1:** mentor membuat soal manual (3 tipe) + stimulus + paket, tinjau sejawat, publikasi. **Tanpa** poin, impor, AI, dan halaman siswa.
> **Tidak disentuh:** Payment/Mayar, Referral/gamifikasi (`gamifikasi_profiles.total_poin`), `tryout_attempts`/`immutable_lock` (BR-9), `mentor_soal_reward_*`, enum `soal_ai_status`/`konten_sumber`/`soal_ai_kesulitan`, tabel `soal_ai`, `materi`, `/api/review-konten`.

---

## Keputusan final (menggantikan usulan di bagian mana pun yang berbeda)

| # | Keputusan |
|---|---|
| K1 | Pernyataan majemuk kompleks **2–6 baris**. Rumpang isian **1–5**. |
| K2 | Hak membuat soal: mentor `active` + tercatat di `mentor_subtes_diampu` untuk subtes itu (**exact `subtes_id`**, bukan `mapel_dasar`). Tidak disyaratkan sedang mengampu kelas. |
| K3 | Versi baru soal/stimulus terpublikasi: **hanya penulis**. Bila penulis nonaktif, Admin menugaskan ulang penulis — dicatat sebagai kebutuhan, **belum ada UI/fungsi** di Tahap 1. |
| K4 | Atribusi sumber **wajib untuk stimulus** (`sumber_rujukan` NOT NULL: "Buatan sendiri" atau nama sumber), **opsional untuk soal** (`soal_bank.sumber_rujukan` nullable). |
| K5 | Isian angka: `.5` diterima sebagai 0,5; `5.` ditolak. Pemisah ribuan tidak didukung. |
| K6 | **Gambar ditunda ke PR 7.** PR 1–2 hanya mengenal blok stimulus `teks` dan `tabel`; validator menolak blok `gambar` sampai PR 7. |
| K7 | Satu penulis per stimulus: hanya penulis stimulus yang boleh menambah soal ke stimulus itu (dijaga di RPC). |
| K8 | Revisi PRD 7.7 dan **BR-37** disetujui (BR-37 dicek masih kosong — BR terakhir BR-36). |

---

## 0. Hasil verifikasi awal

**Subtes SNBT di database produksi** (dibaca lewat anon key — tabel `subtes` memang punya policy baca publik): ketujuh subtes **lengkap**, nama resmi, tidak ada duplikat.

| Subtes | kategori | mapel_dasar | id |
|---|---|---|---|
| Penalaran Umum | tps | Bahasa Indonesia ⚠️ | ac74f8f6-… |
| Pengetahuan dan Pemahaman Umum | tps | Bahasa Indonesia | e29c4fec-… |
| Pemahaman Bacaan dan Menulis | tps | Bahasa Indonesia | 814a9d37-… |
| Pengetahuan Kuantitatif | tps | Matematika | fbd9822e-… |
| Literasi dalam Bahasa Indonesia | literasi | Bahasa Indonesia | ac18ca92-… |
| Literasi dalam Bahasa Inggris | literasi | Bahasa Inggris | d0e54ab5-… |
| Penalaran Matematika | literasi | Matematika | 19a2e581-… |

Temuan sampingan:
1. **Drift `db/schema.sql`:** kolom `subtes.ditawarkan` (dari `db/add_subtes_ditawarkan.sql`) ada di DB tapi tidak ada di `schema.sql`. Diusulkan diperbaiki di commit migrasi (docs-only).
2. **`mapel_dasar` tidak cocok untuk hak tinjau:** Penalaran Umum & PPU ber-`mapel_dasar` "Bahasa Indonesia". Karena itu kelayakan peninjau di Studio Soal **wajib exact-match `subtes_id`**, bukan `mapel_dasar`.
3. **Penanda SNBT:** tidak ada kolom eksplisit "SNBT". Definisi di kode: `subtes.kategori IN ('tps','literasi')` = subtes SNBT. Studio Soal Tahap 1 hanya menerima subtes kategori ini (dicek di validator & RPC).
4. Isi `soal_ai` di produksi tidak bisa dicek dengan anon key (RLS tertutup). Tidak relevan untuk opsi B (tabel lama tidak disentuh), tapi perlu dicek dengan service role sebelum keputusan nasib `soal_ai` di tahap AI.

---

## 1. Skema

### 1.1 Opsi A — memperluas `soal_ai` vs Opsi B — tabel baru

| Aspek | A. Perluas `soal_ai` | B. Tabel baru (`soal_*`, `paket_soal*`) |
|---|---|---|
| Status alur (draf → diajukan → terpublikasi/ditolak → digantikan/diarsipkan) | `soal_ai.status` bertipe enum `soal_ai_status` yang **dipakai bersama `materi`**. Menambah nilai (`diajukan`, `digantikan`, `diarsipkan`) lewat `ALTER TYPE … ADD VALUE` **tidak bisa dibatalkan** (Postgres tidak bisa menghapus nilai enum) dan otomatis jadi nilai sah untuk `materi` juga. Butuh persetujuan khusus. | Status `TEXT + CHECK` di tabel sendiri; enum bersama tidak tersentuh sama sekali. Nilai baru cukup ganti CHECK (non-destruktif). |
| Jalur review lama | `/api/review-konten` sudah bisa mem-publish baris `soal_ai` **tanpa cek review-sendiri dan tanpa alasan tolak**. Soal manual baru di `soal_ai` bisa lolos lewat jalur lama itu kecuali endpoint lama ikut diubah → menyentuh kode BR-31 yang sedang berjalan. | Jalur lama tidak bisa menyentuh tabel baru. Aturan baru (peninjau ≠ penulis, alasan wajib, batas Admin) berlaku penuh tanpa celah. |
| Kecocokan kolom | `konsep_sumber`, `jawaban TEXT`, `estimasi_waktu_detik` **NOT NULL**; default `sumber='ai_generated'` salah untuk soal manual; `kelas_id` mengikat ke kelas padahal bank soal per subtes. Perlu `ALTER … DROP NOT NULL` dan ubah default → perubahan semantik tabel yang dirancang untuk AI (BR-17/18). | Kolom dirancang untuk 3 tipe sejak awal (`konten` + `kunci` JSONB terpisah). |
| Kunci jawaban | Tercampur dengan konten di satu baris TEXT. | `kunci` kolom tersendiri → Tahap 2 API siswa cukup tidak memilih kolom ini; kunci tidak pernah terkirim ke browser siswa. |
| Biaya | Lebih sedikit tabel; antrean review & hitungan dashboard yang sudah membaca `soal_ai` langsung "ikut". | 6 tabel baru; antrean `/review-konten` & hitungan dashboard perlu ditambah sumber kedua. Untuk sementara ada dua tabel soal (`soal_ai` untuk AI nanti, `soal_bank` untuk manual). |
| Jalan ke depan | — | Saat fitur AI dibangun, AI bisa menulis ke `soal_bank` dengan `sumber='ai'` (CHECK diperluas) dan `soal_ai` dipensiunkan setelah direview — keputusan itu ditunda ke tahap AI. |

**Rekomendasi: Opsi B.** Alasan utama: (1) tidak ada perubahan enum bersama yang tidak bisa dibatalkan, (2) jalur review lama tidak bisa dipakai untuk melewati aturan baru, (3) kunci jawaban terpisah sejak awal. `soal_ai`, `materi`, dan `/api/review-konten` tidak diubah.

### 1.2 Daftar tabel

| Tabel | Isi |
|---|---|
| `soal_topik` | Topik/bab per subtes (opsional dipakai). |
| `soal_stimulus` | Bacaan/tabel/gambar yang dipakai banyak soal. |
| `soal_bank` | Soal (satu baris = satu versi soal). |
| `paket_soal` | Paket (satu baris = satu versi paket). |
| `paket_soal_item` | Urutan soal di paket. |
| `soal_tinjauan_log` | Log audit semua aksi ajukan/setujui/tolak/publikasi Admin/arsip. |

**Perlu tabel topik?** Ya, tapi ringan dan opsional di UI. Teks bebas akan berantakan ("Barisan", "barisan & deret", "Deret") dan migrasi teks → tabel nanti butuh pembersihan manual. Tabel kecil sekarang murah; Tahap 2 (latihan harian, progres per topik) pasti membutuhkannya. Mentor bisa memilih topik yang ada atau membuat baru (nama unik per subtes, tanpa membedakan huruf besar-kecil). Kolom `soal_bank.topik_id` nullable.

### 1.3 Konvensi bersama

- Semua status/tipe pakai `TEXT + CHECK` (pola `enrollments.sumber`), **bukan enum baru** — bisa diperluas tanpa `ALTER TYPE`.
- **Versi copy-on-write:** baris yang sudah `terpublikasi` tidak pernah di-UPDATE isinya. Edit = baris baru dengan `keluarga_id` sama dan `versi + 1`. Saat versi baru terpublikasi, versi lama → `digantikan` (tetap terbaca oleh paket yang menunjuknya).
- Setiap JSONB punya field `"v": 1` (versi bentuk data) supaya bentuk bisa berevolusi tanpa migrasi destruktif.
- Panjang teks dihitung per code point: Postgres `length()` pada UTF-8 = `[...str].length` di JS (helper `panjangKarakter` yang sudah ada di `lib/shared/enrollmentManual.ts` dipindah/diekspor ulang ke modul bersama).

### 1.4 Kolom lengkap

#### `soal_topik`
```sql
id          UUID PK DEFAULT gen_random_uuid()
subtes_id   UUID NOT NULL REFERENCES subtes(id)
nama        VARCHAR(100) NOT NULL CHECK (length(btrim(nama)) BETWEEN 2 AND 100)
dibuat_oleh_id UUID REFERENCES users(id) ON DELETE SET NULL
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
-- UNIQUE INDEX (subtes_id, lower(btrim(nama)))
```

#### `soal_stimulus`
```sql
id              UUID PK
keluarga_id     UUID NOT NULL            -- sama untuk semua versi stimulus ini
versi           INT  NOT NULL DEFAULT 1 CHECK (versi >= 1)
menggantikan_id UUID REFERENCES soal_stimulus(id)
subtes_id       UUID NOT NULL REFERENCES subtes(id)
judul_internal  VARCHAR(150) NOT NULL    -- hanya untuk mentor, tidak tampil ke siswa
konten          JSONB NOT NULL           -- lihat bentuk di 1.5
sumber_rujukan  TEXT NOT NULL            -- K4: "Buatan sendiri" atau nama sumber (BR-18), 3–300 karakter
status          TEXT NOT NULL DEFAULT 'draf'
                CHECK (status IN ('draf','diajukan','terpublikasi','ditolak','digantikan','diarsipkan'))
penulis_id      UUID NOT NULL REFERENCES users(id)
peninjau_id     UUID REFERENCES users(id)
diajukan_pada   TIMESTAMPTZ
ditinjau_pada   TIMESTAMPTZ
alasan_tolak    TEXT
created_at, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (keluarga_id, versi)
CHECK (jsonb_typeof(konten->'blok') = 'array' AND jsonb_array_length(konten->'blok') BETWEEN 1 AND 20)
CHECK (status <> 'ditolak' OR length(btrim(coalesce(alasan_tolak,''))) >= 10)
CHECK (status NOT IN ('terpublikasi','digantikan') OR (peninjau_id IS NOT NULL AND peninjau_id <> penulis_id))
```

#### `soal_bank`
```sql
id                    UUID PK
keluarga_id           UUID NOT NULL
versi                 INT NOT NULL DEFAULT 1 CHECK (versi >= 1)
menggantikan_id       UUID REFERENCES soal_bank(id)
subtes_id             UUID NOT NULL REFERENCES subtes(id)
topik_id              UUID REFERENCES soal_topik(id) ON DELETE SET NULL
stimulus_id           UUID REFERENCES soal_stimulus(id)      -- NULL = soal mandiri
urutan_dalam_stimulus SMALLINT CHECK (urutan_dalam_stimulus >= 1)
tipe                  TEXT NOT NULL CHECK (tipe IN ('pilihan_ganda','majemuk_kompleks','isian'))
redaksi               TEXT NOT NULL      -- teks + LaTeX \( \); untuk isian berisi penanda {{r1}}
konten                JSONB NOT NULL     -- bagian yang BOLEH dilihat siswa (opsi/pernyataan/rumpang)
kunci                 JSONB NOT NULL     -- RAHASIA, tidak pernah dikirim ke siswa
pembahasan            TEXT NOT NULL
sumber_rujukan        TEXT                -- K4: opsional untuk soal (≤ 300 karakter)
tingkat_kesulitan     TEXT NOT NULL CHECK (tingkat_kesulitan IN ('mudah','sedang','hots'))
level_kognitif        SMALLINT CHECK (level_kognitif BETWEEN 1 AND 3)   -- TKA, opsional, tidak tampil di UI Tahap 1
estimasi_waktu_detik  INT CHECK (estimasi_waktu_detik BETWEEN 10 AND 1800)
aturan_skor           TEXT NOT NULL DEFAULT 'semua_benar' CHECK (aturan_skor IN ('semua_benar'))
bobot                 NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (bobot > 0)
sumber                TEXT NOT NULL DEFAULT 'manual' CHECK (sumber IN ('manual'))
status                TEXT NOT NULL DEFAULT 'draf'
                      CHECK (status IN ('draf','diajukan','terpublikasi','ditolak','digantikan','diarsipkan'))
penulis_id            UUID NOT NULL REFERENCES users(id)
peninjau_id           UUID REFERENCES users(id)
diajukan_pada, ditinjau_pada TIMESTAMPTZ
alasan_tolak          TEXT
created_at, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (keluarga_id, versi)
```
`aturan_skor` dan `sumber` sengaja sudah ada dengan satu nilai: skor parsial (`'parsial_per_bagian'`) dan soal AI (`'ai'`) nanti cukup memperluas CHECK, tanpa kolom/migrasi destruktif. Sama untuk `bobot`.

#### `paket_soal`
```sql
id              UUID PK
keluarga_id     UUID NOT NULL
versi           INT NOT NULL DEFAULT 1
menggantikan_id UUID REFERENCES paket_soal(id)
subtes_id       UUID NOT NULL REFERENCES subtes(id)
judul           VARCHAR(150) NOT NULL CHECK (length(btrim(judul)) >= 3)
deskripsi       TEXT CHECK (deskripsi IS NULL OR length(deskripsi) <= 500)
durasi_menit    SMALLINT CHECK (durasi_menit BETWEEN 1 AND 300)   -- opsional
status          TEXT NOT NULL DEFAULT 'draf'
                CHECK (status IN ('draf','menunggu_soal','terpublikasi','digantikan','diarsipkan'))
pembuat_id      UUID NOT NULL REFERENCES users(id)
dipublikasikan_pada TIMESTAMPTZ
created_at, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (keluarga_id, versi)
```

#### `paket_soal_item`
```sql
paket_id  UUID NOT NULL REFERENCES paket_soal(id) ON DELETE CASCADE
soal_id   UUID NOT NULL REFERENCES soal_bank(id) ON DELETE RESTRICT
urutan    SMALLINT NOT NULL CHECK (urutan >= 1)
PRIMARY KEY (paket_id, soal_id)
CONSTRAINT paket_soal_item_urutan_unik UNIQUE (paket_id, urutan) DEFERRABLE INITIALLY DEFERRED
```
`DEFERRABLE` supaya atur ulang urutan (tukar 3↔4) bisa dalam satu transaksi.

#### `soal_tinjauan_log`
```sql
id          UUID PK
objek_jenis TEXT NOT NULL CHECK (objek_jenis IN ('soal','stimulus','paket'))
objek_id    UUID NOT NULL                  -- tanpa FK: log tetap ada walau objek dihapus
aktor_id    UUID NOT NULL REFERENCES users(id)
peran       TEXT NOT NULL CHECK (peran IN ('mentor','admin'))
aksi        TEXT NOT NULL CHECK (aksi IN ('ajukan','tarik','setujui','tolak','publikasi_admin','arsipkan','publikasi_paket'))
alasan      TEXT
jumlah_peninjau_eligible INT              -- diisi untuk publikasi_admin (harus 0)
snapshot    JSONB NOT NULL DEFAULT '{}'   -- isi objek saat aksi (redaksi, kunci, dst.)
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
CHECK (aksi <> 'tolak' OR length(btrim(coalesce(alasan,''))) >= 10)
CHECK (aksi <> 'publikasi_admin' OR (length(btrim(coalesce(alasan,''))) >= 10 AND jumlah_peninjau_eligible = 0))
```

### 1.5 Bentuk JSONB per tipe

**Stimulus `konten`** — daftar blok (teks panjang, tabel sederhana, gambar opsional):
```json
{ "v": 1, "blok": [
  { "jenis": "teks",  "teks": "Paragraf 1…\n\nParagraf 2 dengan rumus \\(x^2\\)." },
  { "jenis": "tabel", "judul": "Tabel 1 Produksi padi", "kepala": ["Tahun","Ton"],
    "baris": [["2024","1.200"],["2025","1.350"]] },
  { "jenis": "gambar", "path": "<penulis_id>/<uuid>.webp", "alt": "Grafik batang…", "keterangan": "Gambar 1" }
]}
```

**(1) `pilihan_ganda`**
```json
konten: { "v": 1, "opsi": [ {"label":"A","teks":"…"}, {"label":"B","teks":"…"},
                            {"label":"C","teks":"…"}, {"label":"D","teks":"…"}, {"label":"E","teks":"…"} ] }
kunci:  { "v": 1, "opsi": "C" }
jawaban (Tahap 2): { "opsi": "C" }
```

**(2) `majemuk_kompleks`** — id baris stabil (bukan indeks) supaya urutan bisa diubah tanpa merusak kunci:
```json
konten: { "v": 1, "label_kolom": ["Benar", "Salah"],
          "pernyataan": [ {"id":"p1","teks":"…"}, {"id":"p2","teks":"…"}, {"id":"p3","teks":"…"} ] }
kunci:  { "v": 1, "per_baris": { "p1": 0, "p2": 1, "p3": 0 } }      // 0 = kolom kiri, 1 = kolom kanan
jawaban: { "per_baris": { "p1": 0, "p2": 1, "p3": 1 } }
```
Preset label di builder: Benar/Salah, Ya/Tidak, Sesuai/Tidak Sesuai, Tepat/Tidak Tepat, atau isian sendiri.

**(3) `isian`** — penanda rumpang di `redaksi`: `Hasil dari 3 + 4 adalah {{r1}} dan 2 × 5 adalah {{r2}}.`
```json
konten: { "v": 1, "rumpang": [ {"id":"r1","jenis":"angka"}, {"id":"r2","jenis":"angka"} ] }
kunci:  { "v": 1, "rumpang": { "r1": {"diterima": ["7"]},
                               "r2": {"diterima": ["10"], "toleransi": null} } }
jawaban: { "rumpang": { "r1": "7", "r2": "10,0" } }
```
`jenis` rumpang: `"teks"` (pencocokan teks) atau `"angka"` (pencocokan nilai). `toleransi` (angka, opsional, default null = harus sama persis) untuk jawaban hasil pembulatan.

### 1.6 Validasi — dua lapis

**Lapis DB (CHECK, struktural, jaring pengaman terakhir):**
```sql
CONSTRAINT soal_bank_bentuk_pg CHECK (tipe <> 'pilihan_ganda' OR (
  jsonb_array_length(konten->'opsi') = 5 AND (kunci->>'opsi') IN ('A','B','C','D','E')))
CONSTRAINT soal_bank_bentuk_majemuk CHECK (tipe <> 'majemuk_kompleks' OR (
  jsonb_array_length(konten->'label_kolom') = 2
  AND length(btrim(konten->'label_kolom'->>0)) > 0 AND length(btrim(konten->'label_kolom'->>1)) > 0
  AND jsonb_array_length(konten->'pernyataan') BETWEEN 2 AND 6))
CONSTRAINT soal_bank_bentuk_isian CHECK (tipe <> 'isian' OR
  jsonb_array_length(konten->'rumpang') BETWEEN 1 AND 5)
CONSTRAINT soal_bank_pembahasan CHECK (length(btrim(pembahasan)) >= 10)
CONSTRAINT soal_bank_alasan_tolak CHECK (status <> 'ditolak' OR length(btrim(coalesce(alasan_tolak,''))) >= 10)
CONSTRAINT soal_bank_peninjau_bukan_penulis CHECK (
  status NOT IN ('terpublikasi','digantikan') OR (peninjau_id IS NOT NULL AND peninjau_id <> penulis_id))
CONSTRAINT soal_bank_stimulus_urutan CHECK ((stimulus_id IS NULL) = (urutan_dalam_stimulus IS NULL))
```
Pengecualian publikasi Admin: `peninjau_id` = id Admin (≠ penulis), jadi CHECK tetap berlaku.

**Lapis aplikasi — `lib/shared/studio-soal/validasiSoal.ts`** (fungsi murni, dipakai API **dan** builder di browser, mengembalikan daftar error per field):
- Umum: subtes kategori `tps`/`literasi`; redaksi 1–5.000 karakter; pembahasan ≥ 10 karakter; semua rumus `\( \)`/`\[ \]` lolos parse KaTeX (`throwOnError: true` saat simpan).
- **PG:** tepat 5 opsi berlabel A–E berurutan, tiap opsi tidak kosong (≤ 1.000 karakter), tidak ada dua opsi identik setelah normalisasi, kunci tepat satu dari A–E.
- **Majemuk:** 2 label kolom wajib, tidak kosong, ≤ 30 karakter, tidak sama; **2–6 pernyataan** (K1), id unik, teks tidak kosong; kunci ada untuk **setiap** pernyataan, nilainya 0/1, tidak ada kunci untuk id yang tidak ada.
- **Isian:** setiap `{{id}}` di redaksi muncul tepat sekali dan punya pasangan di `konten.rumpang` (tidak ada yatim di kedua arah); 1–5 rumpang; tiap rumpang **≥ 1 jawaban diterima** (≤ 10, masing-masing ≤ 100 karakter, duplikat setelah normalisasi ditolak); rumpang `angka`: semua jawaban diterima wajib bisa di-parse sebagai angka.
- **Stimulus:** 1–20 blok; teks ≤ 15.000 karakter per blok; tabel 1–8 kolom × 1–20 baris, kepala wajib; `sumber_rujukan` wajib 3–300 karakter (K4); blok `gambar` ditolak sampai PR 7 (K6) — setelah PR 7 wajib `alt`.
- **Alasan tolak:** `panjangKarakter(alasan.trim()) >= 10` (≤ 1.000).
- **Paket:** judul ≥ 3 karakter, 1–100 soal, semua soal se-subtes dengan paket, soal yang berbagi stimulus harus **berurutan** (blok utuh).

### 1.7 Indeks
```sql
CREATE INDEX idx_soal_bank_subtes_status ON soal_bank(subtes_id, status);
CREATE INDEX idx_soal_bank_penulis ON soal_bank(penulis_id, status);
CREATE INDEX idx_soal_bank_antrean ON soal_bank(subtes_id, diajukan_pada) WHERE status = 'diajukan';
CREATE INDEX idx_soal_bank_stimulus ON soal_bank(stimulus_id) WHERE stimulus_id IS NOT NULL;
CREATE INDEX idx_soal_bank_topik ON soal_bank(topik_id) WHERE topik_id IS NOT NULL;
-- maksimal satu versi terpublikasi & satu versi "terbuka" per keluarga
CREATE UNIQUE INDEX idx_soal_bank_satu_terbit ON soal_bank(keluarga_id) WHERE status = 'terpublikasi';
CREATE UNIQUE INDEX idx_soal_bank_satu_terbuka ON soal_bank(keluarga_id) WHERE status IN ('draf','diajukan','ditolak');
-- pola yang sama untuk soal_stimulus dan paket_soal
CREATE INDEX idx_stimulus_antrean ON soal_stimulus(subtes_id, diajukan_pada) WHERE status = 'diajukan';
CREATE INDEX idx_paket_soal_pembuat ON paket_soal(pembuat_id, status);
CREATE INDEX idx_paket_soal_item_soal ON paket_soal_item(soal_id);   -- "soal ini dipakai paket mana?"
CREATE INDEX idx_soal_tinjauan_log_objek ON soal_tinjauan_log(objek_jenis, objek_id);
```

### 1.8 RLS
Sama dengan tabel lain: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` untuk keenam tabel, **tanpa policy** → tertutup total dari anon/authenticated; semua akses lewat API route dengan `service_role`. Fungsi RPC di-`REVOKE ALL … FROM PUBLIC, anon, authenticated` (pola `daftar_siswa_manual`). Bucket gambar (Bagian 4) **private**.

---

## 2. Aturan hak akses

Definisi: **mentor eligible untuk subtes S** = `user_roles(role_type='mentor', status='active')` **dan** baris `mentor_subtes_diampu` dengan `subtes_id = S` (exact match). Peran diambil dari `session.role` di server (bukan input client); user multi-role harus berpindah peran lewat role switcher.

| Aksi | Siapa | Syarat |
|---|---|---|
| Buat soal/stimulus/topik | Mentor | Eligible untuk subtes itu. Tidak disyaratkan sedang mengampu kelas — bank soal adalah konten per subtes, bukan per kelas (lihat Bagian 8, butuh konfirmasi terhadap BR-7). |
| Edit | Penulis saja | Status `draf` atau `ditolak`. `diajukan` → harus **Tarik** dulu (kembali ke `draf`, tercatat di log). |
| Hapus | Penulis | Hanya `draf` yang **belum pernah diajukan** (tidak ada baris log). Selain itu → Arsipkan. |
| Ajukan | Penulis | Lolos validator lengkap. Soal berstimulus diajukan **bersama stimulusnya** (lihat di bawah). |
| Setujui / Tolak | Mentor lain | Eligible untuk subtes itu **dan** bukan penulis (untuk stimulus: bukan penulis stimulus maupun penulis soal mana pun di kelompok itu). Tolak wajib alasan ≥ 10 karakter. |
| Publikasi oleh Admin | Admin | **Hanya bila jumlah mentor eligible selain penulis = 0** saat aksi dijalankan (dihitung di dalam RPC, bukan di client). Wajib alasan ≥ 10 karakter; tercatat `aksi='publikasi_admin'`, `jumlah_peninjau_eligible=0`. Admin juga tidak boleh mempublikasikan soal yang ia tulis sendiri (via peran mentornya). Admin **boleh menolak** kapan saja dengan alasan (kontrol kualitas). |
| Lihat bank terpublikasi | Mentor eligible subtes itu, Admin | Draf/ditolak orang lain tidak terlihat (kecuali oleh peninjau saat `diajukan`, dan Admin). |
| Buat & publikasikan paket | Mentor eligible subtes paket | Boleh memakai soal terpublikasi milik siapa pun di subtes itu. |
| Arsipkan soal | Penulis, Admin | Ditolak bila soal dipakai paket `terpublikasi`/`menunggu_soal` (tampilkan daftar paketnya). |

**Mentor pending/rejected:** fitur terkunci (`lockedForPendingMentor`), API menolak 403 — pola `getMentorRoleStatus` yang sudah ada. Draf miliknya tetap tersimpan. Soal yang sedang `diajukan` tetap bisa ditinjau orang lain.

**Mentor multi-subtes:** hak dihitung per soal dari `soal.subtes_id`, bukan dari kelas. Mentor yang mengampu PU dan PK bisa menulis & meninjau keduanya, tapi tidak meninjau soal subtes lain.

**Stimulus sebagai satu kesatuan:**
- Tahap 1: soal di bawah sebuah stimulus **hanya boleh ditulis oleh penulis stimulus** (satu penulis per kelompok — menyederhanakan larangan review sendiri).
- Ajukan kelompok = stimulus + semua soalnya yang berstatus `draf` diajukan bersama. Peninjau melihat seluruh kelompok dan memutuskan **sekali untuk seluruh kelompok** (setujui semua / tolak semua dengan satu alasan). Satu RPC, satu transaksi.
- Menambah soal baru ke stimulus yang sudah terpublikasi (dan tidak diubah): soal itu ditinjau sendiri, tetapi pratinjau menampilkan stimulusnya sebagai konteks.
- Stimulus minimal punya 1 soal saat diajukan.

**Edit soal terpublikasi = versi baru (bukan kembali ke draf).**
- "Buat versi baru" menyalin baris → `versi+1`, status `draf`, `menggantikan_id` = versi lama. Versi lama tetap `terpublikasi` (tetap dipakai) sampai versi baru lolos tinjau; saat itu versi lama → `digantikan` dalam transaksi yang sama.
- Alasan: Tahap 2 akan mencatat jawaban siswa per `soal_id`; isi yang sudah pernah dikerjakan siswa tidak boleh berubah diam-diam (semangat BR-9).
- **Soal di paket:** paket menunjuk versi spesifik. Paket terpublikasi tetap memakai versi lama (`digantikan` tetap valid di paket yang sudah ada). Builder paket menampilkan badge "Versi baru tersedia"; memperbaruinya = membuat versi baru paket.
- Edit stimulus terpublikasi = versi baru stimulus **plus** versi baru semua soal aktif di kelompok itu, diajukan sebagai satu kelompok.

**Unit tinjau & publikasi (rekomendasi):**
- **Unit tinjau = soal** (atau kelompok stimulus). Paket **tidak** ditinjau ulang oleh sejawat — isinya hanya soal yang sudah lolos tinjau, dan urutan/judul bukan konten penilaian. Ini menghindari beban tinjau ganda.
- **Soal terpublikasi bisa dipakai sendiri-sendiri** (bank, paket lain, latihan harian Tahap 2).
- **Paket hanya terpublikasi bila semua soalnya terpublikasi.** "Ajukan paket": jika semua soal sudah terpublikasi → langsung `terpublikasi` (log `publikasi_paket`). Jika ada soal milik pembuat paket yang masih `draf` → soal-soal itu ikut diajukan, paket → `menunggu_soal`, dan **otomatis** terpublikasi di RPC tinjau begitu soal terakhirnya disetujui. Jika ada yang ditolak → paket kembali `draf` + notifikasi. Paket tidak bisa memuat draf milik mentor lain.
- Paket terpublikasi tidak diedit di tempat; edit = versi baru paket (pola yang sama).

---

## 3. Endpoint API & layar

### 3.1 API (semua `app/api/studio-soal/**`, `service_role`, session dicek di server)

| Method & path | Fungsi |
|---|---|
| `GET /api/studio-soal/soal?milik=saya\|bank&subtes=&status=&tipe=&topik=` | Daftar soal saya / bank terpublikasi |
| `POST /api/studio-soal/soal` | Buat draf (validasi parsial — draf boleh belum lengkap) |
| `GET/PATCH/DELETE /api/studio-soal/soal/[id]` | Detail / edit draf / hapus draf yang belum pernah diajukan |
| `POST /api/studio-soal/soal/[id]/ajukan` · `/tarik` · `/versi-baru` · `/arsipkan` | Transisi status |
| `POST /api/studio-soal/stimulus` · `GET/PATCH /stimulus/[id]` · `POST /stimulus/[id]/ajukan` · `/versi-baru` | Stimulus & ajukan kelompok |
| `GET/POST /api/studio-soal/topik?subtes=` | Daftar / buat topik |
| `POST /api/studio-soal/paket` · `GET/PATCH /paket/[id]` | Buat / edit metadata paket draf |
| `PUT /api/studio-soal/paket/[id]/item` | Ganti seluruh daftar item + urutan sekaligus (satu transaksi; lebih aman dari banyak PATCH kecil) |
| `POST /api/studio-soal/paket/[id]/ajukan` · `/versi-baru` · `/arsipkan` | Publikasi paket / menunggu soal |
| `GET /api/studio-soal/tinjau` | Antrean tinjau (mentor: subtes eligible, bukan miliknya; admin: semua + flag `bolehPublikasiAdmin`) |
| `POST /api/studio-soal/tinjau` | `{ objek: 'soal'\|'stimulus', id, aksi: 'setujui'\|'tolak', alasan? }` → RPC `tinjau_soal` |
| `POST /api/studio-soal/tinjau/publikasi-admin` | `{ objek, id, alasan }` → RPC `publikasi_soal_admin` |
| `POST /api/studio-soal/media` | Unggah gambar (commit terakhir, opsional — Bagian 4) |

Transisi status yang menyentuh lebih dari satu baris (ajukan kelompok, tinjau, publikasi admin, publikasi paket, versi baru) dikerjakan **RPC Postgres** dalam satu transaksi dengan `FOR UPDATE` pada baris yang diubah (pola `putuskan_sesi_review`/`daftar_siswa_manual`). RPC mengulang cek otorisasi inti (status diajukan, peninjau ≠ penulis, eligible, jumlah eligible = 0 untuk Admin) — tidak hanya percaya cek di route.

Notifikasi memakai nilai enum `notifikasi_tipe` yang **sudah ada**: `konten_review` (ke mentor eligible saat ada pengajuan — fungsi `notifyMentorsKontenMenungguReview` sudah ada, tinggal diadaptasi agar mengecualikan penulis) dan `sistem` (ke penulis saat disetujui/ditolak + alasannya). Tidak ada perubahan enum.

### 3.2 Layar

**Mentor — menu baru "Studio Soal"** (`/studio-soal`, `lockedForPendingMentor: true`):
- `/studio-soal` — tab **Soal Saya · Stimulus Saya · Paket Saya · Bank Subtes**. Filter subtes/status/tipe/kesulitan/topik. Chip status: Draf, Menunggu Tinjau, Terpublikasi, Ditolak (dengan alasan terlihat), Digantikan, Diarsipkan.
- `/studio-soal/soal/baru` → pilih subtes + tipe → `/studio-soal/soal/[id]` **builder**: kiri form (redaksi dengan tombol sisip rumus `\( \)`, opsi A–E + radio kunci / tabel pernyataan + preset label + toggle kunci per baris / redaksi dengan tombol "Sisipkan rumpang" + daftar jawaban diterima per rumpang + jenis teks/angka + uji coba jawaban), pembahasan, kesulitan, topik, estimasi waktu. Kanan **pratinjau langsung** memakai komponen yang sama dengan antrean review. Error validator tampil per field. Tombol Simpan Draf / Ajukan.
- `/studio-soal/stimulus/[id]` — editor blok (teks / tabel / gambar), daftar soal dalam stimulus (tambah, urutkan), Ajukan Kelompok.
- `/studio-soal/paket/[id]` — metadata; panel kiri pilih dari bank (filter), panel kanan daftar berurutan dengan tombol ↑/↓ (dapat diakses keyboard; drag-and-drop menyusul), soal berstimulus bergerak sebagai satu blok; status tiap item; badge "Versi baru tersedia"; Ajukan Paket.

**Antrean review — memakai ulang `/review-konten`** ("Materi & Latihan Soal"): tambah tab **"Studio Soal"** di samping tab lama (Materi AI / Soal AI tetap utuh, tidak diubah). Tiap item bisa dibuka → **pratinjau lengkap**: stimulus, redaksi, opsi/pernyataan/rumpang, kunci (disorot), pembahasan, metadata — dirender oleh komponen yang sama dengan tampilan siswa Tahap 2 (`SoalPratinjau` dengan prop `tampilkanKunci`). Aksi Setujui / Tolak; Tolak membuka textarea dengan penghitung karakter (`panjangKarakter`) dan tombol aktif hanya bila ≥ 10.

**Admin — Kelola Konten, tab "Review Konten AI"**: tambah sub-tab "Studio Soal" (semua subtes, nama penulis). Tombol **"Publikasikan sebagai Admin"** hanya tampil bila server menghitung 0 mentor eligible lain; wajib alasan. Tolak tersedia. Panel kecil riwayat log per objek.

**Komponen bersama (baru):** `components/studio-soal/SoalPratinjau.tsx`, `StimulusPratinjau.tsx`, `TeksKaya.tsx` (teks + rumus), `TinjauSoalList.tsx`, builder per tipe. Hitungan dashboard mentor/admin ("konten menunggu review") ditambah sumber `soal_bank`/`soal_stimulus` berstatus `diajukan`.

---

## 4. Rumus & gambar

**Kondisi sekarang:** tidak ada KaTeX/LaTeX/markdown di `package.json` maupun di UI (hasil grep "latex" yang muncul hanya `translateX`). Bucket yang ada hanya `avatars` dan `mentor-landing` (public). Tidak ada bucket untuk soal.

**Rekomendasi minimum:**
1. **Teks + rumus inline KaTeX.** Pembatas `\( … \)` (inline) dan `\[ … \]` (blok) — **bukan `$…$`**, karena teks Literasi B. Inggris bisa memuat tanda dolar biasa. Paragraf dipisah baris kosong; format tambahan hanya **tebal** dan *miring* (`**…**`, `*…*`), cukup untuk penekanan di soal Literasi/PBM. Parser kecil sendiri (`lib/shared/studio-soal/teksKaya.ts`) → segmen; teks biasa dirender React (otomatis di-escape), rumus via `katex.renderToString` dengan `trust: false`, `strict: 'warn'`, `maxExpand: 1000`, `maxSize: 10`. Tidak pakai `dangerouslySetInnerHTML` untuk teks mentor — hanya untuk keluaran KaTeX.
2. **Tabel sederhana** sebagai blok terstruktur di stimulus (JSON kepala+baris, sel berisi teks/rumus), bukan markdown/HTML → tidak ada risiko XSS.
3. **Gambar opsional**, hanya di blok stimulus. Bucket baru **`soal-media` private**, JPEG/PNG/WEBP (tanpa SVG — pola `avatars`), maks 1 MB, path `<penulis_id>/<uuid>.<ext>` dari session, DB menyimpan **path** (bukan URL), dirender lewat signed URL (TTL 1 jam) dibuat server. Private karena Tahap 2 bisa memuat konten premium. Foto dari HP bisa tampil miring karena EXIF — builder menormalkan orientasi di browser (`createImageBitmap(file, { imageOrientation: 'from-image' })` → canvas → WEBP) sebelum unggah.

**Biaya:**
- Paket `katex` (MIT): ±270 KB JS (±75 KB gzip) + CSS ±23 KB + font yang dimuat sesuai kebutuhan. Render di Server Component → halaman pratinjau/antrean hanya mengirim HTML + CSS + font. JS KaTeX hanya dimuat (dynamic import) di halaman builder untuk pratinjau langsung. Versi dikunci persis di `package.json`.
- Storage: pemakaian kecil (gambar ≤ 1 MB, hanya stimulus); cek kuota paket Supabase saat ini sebelum mengaktifkan. Bucket dibuat lewat dashboard Supabase (bukan SQL migrasi).
- Gambar dijadikan **commit terakhir yang bisa ditunda** tanpa memblokir sisa Tahap 1.

---

## 5. Fungsi penilaian `nilaiJawaban(soal, jawaban)`

Lokasi: `lib/shared/studio-soal/nilaiJawaban.ts` — **fungsi murni**, tanpa import server/DB, sehingga bisa dites langsung dan dipakai di server Tahap 2 (penilaian tetap dihitung di server).

```ts
type HasilNilai = {
  benar: boolean;            // aturan 'semua_benar'
  skor: number;              // 0 atau soal.bobot (parsial nanti: proporsi × bobot)
  bagian: { id: string; benar: boolean }[];  // per opsi/baris/rumpang — dasar skor parsial nanti
};
function nilaiJawaban(soal: { tipe; kunci; konten; aturan_skor; bobot }, jawaban: unknown): HasilNilai
```
- **PG:** `benar = jawaban.opsi === kunci.opsi`. `bagian = [{id:'opsi', benar}]`.
- **Majemuk:** untuk setiap pernyataan di `konten` (bukan di jawaban): `jawaban.per_baris[id] === kunci.per_baris[id]`. Baris kosong = salah. `benar` = semua baris benar. Id tak dikenal di jawaban diabaikan.
- **Isian:** untuk setiap rumpang di `konten`: cocokkan dengan salah satu `diterima`. `benar` = semua rumpang benar.
- Jawaban tidak berbentuk benar / `null` / tipe salah → semua bagian salah, **tidak melempar error**.
- `aturan_skor` tidak dikenal → lempar error (jaring pengaman saat CHECK diperluas tapi kode belum).

Skor parsial nanti cukup menambah cabang `aturan_skor === 'parsial_per_bagian'` yang memakai `bagian` — tanpa migrasi destruktif.

### Aturan pencocokan isian (usulan pasti)

**Rumpang `teks`:**
1. Unicode NFKC (menyatukan karakter lebar penuh, ligatur).
2. Trim; semua whitespace berturut-turut (termasuk NBSP, tab, baris baru) → satu spasi.
3. Huruf kecil (`toLocaleLowerCase('id-ID')`).
4. Tanda kutip lengkung → lurus (`“ ” ‘ ’` → `" '`).
5. Bandingkan persis dengan setiap `diterima` yang dinormalkan sama. **Tidak** menghapus tanda baca lain, aksen, atau titik akhir (mentor menambah alternatif kalau perlu) — supaya tidak ada "benar" yang tidak disengaja.

**Rumpang `angka`:**
1. Normalisasi seperti teks lalu hapus semua spasi; `−` (minus unicode) → `-`; `+` di depan diizinkan.
2. Bentuk yang diterima: bilangan bulat (`12`, `-3`), desimal dengan **satu** pemisah `,` atau `.` (`0,5` = `0.5`), pecahan `a/b` (`1/2`, `-3/4`, b ≠ 0).
3. **Tidak** didukung (dianggap salah): pemisah ribuan / lebih dari satu pemisah (`1.000,5`, `1,000.5`), persen (`50%`), bilangan campuran (`1 1/2`), notasi ilmiah, akar/π. Konsekuensi: `1.000` dibaca **satu** (desimal), bukan seribu → builder menampilkan petunjuk "tulis tanpa pemisah ribuan" di bawah rumpang angka, dan mentor menambahkan alternatif bila perlu.
4. Bandingkan sebagai **pecahan eksak** (BigInt pembilang/penyebut, disederhanakan): `1/2` = `0,5` = `2/4` = `0.50`. Tanpa floating point.
5. Bila `toleransi` diisi: benar jika `|nilai − diterima| ≤ toleransi` (untuk jawaban hasil pembulatan, mis. 3,14).
6. Input kosong = salah.

### Rencana test penilaian (`tests/nilai-jawaban.test.ts`)
- PG: benar, salah, kosong, huruf kecil `"c"` (salah — kunci huruf besar dari UI), bentuk rusak.
- Majemuk: semua benar; satu baris salah → salah; satu baris kosong → salah; id asing diabaikan; urutan pernyataan diacak tetap benar.
- Isian teks: `"  Jakarta "` = `"jakarta"`; `"JAKARTA"`; spasi ganda; NBSP; alternatif kedua cocok; `"Jakarta."` ≠ `"Jakarta"` (kecuali didaftarkan).
- Isian angka: `0,5`=`0.5`=`1/2`=`2/4`=`.5` (K5: `.5` diterima, `5.` ditolak); `-0,5` vs `−0,5`; `+7`=`7`; `1/0` salah; `1.000` = 1; `1.000,5` salah; `50%` salah; toleransi 0,01 untuk 3,14 vs 3,1416; angka sangat panjang tidak overflow (BigInt).
- Multi-rumpang: semua benar → benar; satu salah → salah; `bagian` berisi status per rumpang.
- `aturan_skor` tak dikenal → throw.

---

## 6. Migrasi

**File:** `db/add_studio_soal.sql` (satu file, idempotent, pola file migrasi yang sudah ada):
1. `CREATE TABLE IF NOT EXISTS` keenam tabel (urutan: `soal_topik` → `soal_stimulus` → `soal_bank` → `paket_soal` → `paket_soal_item` → `soal_tinjauan_log`).
2. Constraint ditambah lewat `DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = …) THEN ALTER TABLE … ADD CONSTRAINT …` supaya aman diulang.
3. `CREATE [UNIQUE] INDEX IF NOT EXISTS`.
4. `CREATE OR REPLACE FUNCTION` untuk RPC: `ajukan_soal`, `ajukan_kelompok_stimulus`, `tinjau_soal`, `publikasi_soal_admin`, `buat_versi_soal`, `simpan_item_paket`, `ajukan_paket`; lalu `REVOKE ALL … FROM PUBLIC, anon, authenticated`.
5. `ALTER TABLE … ENABLE ROW LEVEL SECURITY` keenam tabel (blok RLS di `schema.sql` tidak retroaktif).
6. Query verifikasi di komentar akhir.
- **Tidak ada** `ALTER TYPE`, tidak ada perubahan tabel yang sudah ada.

**Urutan dry-run (SQL Editor Supabase):**
1. Jalankan `BEGIN;` + isi file + skenario uji `db/test_studio_soal_DRYRUN.sql` (insert soal tiap tipe, coba melanggar tiap CHECK → harus gagal, panggil RPC tinjau oleh penulis → harus ditolak, publikasi admin saat ada mentor eligible → ditolak) + `ROLLBACK;`. Pastikan tidak ada error tak terduga.
2. Cek `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'soal_%' OR tablename LIKE 'paket_soal%';` di dalam transaksi yang sama sebelum ROLLBACK.
3. Jalankan file sungguhan (tanpa skenario uji). Jalankan ulang sekali lagi → harus tanpa error (bukti idempotent).
4. Buat bucket `soal-media` (private, 1 MB, MIME terbatas) lewat dashboard — hanya saat commit gambar.

**Dokumen yang diperbarui di commit migrasi:**
- `db/schema.sql` — tambah keenam tabel + perbaiki drift `subtes.ditawarkan`.
- `docs/PRD.md` **Bagian 13** — entitas `SoalTopik`, `SoalStimulus`, `SoalBank`, `PaketSoal`, `PaketSoalItem`, `SoalTinjauanLog`; catatan `soal_ai` tetap untuk AI.
- `docs/PRD.md` **Bagian 7.7** — ⚠️ saat ini tertulis "konten manual dari mentor yang sudah di-approve langsung `published` tanpa gerbang review". Keputusan baru: **soal manual wajib tinjau sejawat**. 7.7 direvisi + **BR-37 baru** (tinjau sejawat, penulis ≠ peninjau, publikasi Admin hanya bila tidak ada mentor eligible lain, alasan tolak ≥ 10 karakter). BR-31 (AI) tidak berubah. Materi manual (7.5.1) tetap auto-publish.
- `docs/erd.mermaid` — tabel baru.
- `docs/Checklist_Fitur_Dimentoring.md` — butir uji Studio Soal (lihat Bagian 7).

---

## 7. Rencana test

**`tests/studio-soal.test.ts`** — Supabase tiruan di memori (pola `tests/presensi-mentor.test.ts`: `FakeQuery` + `fakeFrom`, ditambah `insert`, `delete`, dan tiruan `rpc` yang meniru aturan RPC). Ditambahkan ke skrip `npm test`.
- **Otorisasi:** tanpa session 401; siswa 403; mentor pending 403; mentor tanpa subtes itu 403 saat buat/tinjau; mentor multi-subtes boleh di kedua subtesnya, ditolak di subtes ketiga; subtes TKA ditolak (Tahap 1 hanya SNBT); peran dari session, bukan body.
- **Review sendiri ditolak:** penulis meninjau soalnya → 403; penulis stimulus meninjau kelompoknya → 403; Admin yang juga penulis tidak bisa publikasi admin.
- **Batas Admin:** ada 1 mentor eligible lain → `publikasi-admin` 409; 0 eligible → berhasil + log `jumlah_peninjau_eligible=0` + alasan; mentor eligible yang pending/rejected tidak dihitung; Admin tetap bisa menolak.
- **Validasi tiap tipe:** PG 4 atau 6 opsi, kunci `F`, opsi kosong, opsi duplikat; majemuk 1 label, label sama, 1 pernyataan, 7 pernyataan, kunci kurang satu baris; isian penanda yatim, rumpang tanpa jawaban, rumpang angka dengan jawaban "abc"; rumus LaTeX rusak ditolak saat ajukan.
- **Alasan tolak:** kosong, 9 karakter, 9 emoji + spasi (dihitung per code point), 10 karakter → hanya yang terakhir lolos.
- **Status:** edit `diajukan` ditolak; tarik → draf; tinjau soal yang sudah ditinjau → 409; versi baru: versi lama tetap terpublikasi sampai versi baru disetujui, lalu `digantikan`; satu keluarga tidak bisa punya dua draf.
- **Stimulus dipakai banyak soal:** 3 soal satu stimulus diajukan bersama; disetujui → keempat baris terpublikasi; ditolak → keempatnya ditolak dengan alasan sama; mentor lain tidak bisa menambah soal ke stimulus orang lain.
- **Paket campuran:** paket berisi PG + majemuk + isian; semua terpublikasi → langsung terpublikasi; ada draf milik sendiri → `menunggu_soal`, otomatis terpublikasi saat soal terakhir disetujui, kembali `draf` bila ada yang ditolak; draf milik orang lain tidak bisa dimasukkan; soal beda subtes ditolak; soal berstimulus harus berurutan; atur ulang urutan (tukar) berhasil; arsip soal yang dipakai paket terpublikasi ditolak.
- **Penilaian:** `tests/nilai-jawaban.test.ts` (Bagian 5).
- **Teks kaya:** `tests/teks-kaya.test.ts` — `\(`…`\)` dipisah benar, `$` biasa tidak dianggap rumus, `<script>` di teks tetap teks, `\href` diblok.

Logika di dalam RPC SQL tidak tercakup Supabase tiruan → diuji lewat `db/test_studio_soal_DRYRUN.sql` (BEGIN/ROLLBACK) di Bagian 6, ditambah satu butir checklist uji manual di staging.

---

## 8. Risiko, hal tidak jelas, perkiraan

**Risiko**
1. **Kemacetan peninjau.** Subtes dengan hanya 1–2 mentor aktif → antrean macet; dengan tepat 2 mentor, mereka saling meninjau terus (potensi kolusi). Mitigasi: hitungan antrean di dashboard + jalur Admin; pantau setelah rilis.
2. **Konflik PRD 7.7** (soal manual auto-publish) — harus direvisi bersamaan; kalau tidak, dua dokumen berselisih.
3. **Hak cipta stimulus (BR-18).** Bacaan Literasi rawan disalin dari artikel/soal resmi SNPMB. `sumber_rujukan` disediakan, tapi kebijakannya (boleh adaptasi? wajib atribusi?) perlu diputuskan dan dijadikan butir cek peninjau.
4. **Ambiguitas angka `1.000`** — diterima sebagai 1; diatasi dengan petunjuk UI + alternatif jawaban.
5. **Kurva belajar LaTeX** untuk mentor — tombol sisip rumus + contekan singkat di builder.
6. **Dua tabel soal sementara** (`soal_ai` + `soal_bank`) — membingungkan pembaca kode; dicatat di PRD 13 dan komentar schema.
7. Hitungan dashboard "menunggu review" yang sekarang membaca `soal_ai` perlu ditambah sumber baru (`lib/mentor/dashboardData.ts`, `lib/admin/dashboardData.ts`) — perubahan kecil, bukan modul terlarang.

**Keputusan** — semua sudah diputuskan, lihat tabel "Keputusan final" (K1–K8) di awal dokumen. Kebutuhan terbuka: alur Admin menugaskan ulang penulis bila penulis nonaktif (K3) — belum dirancang.

**Perkiraan & urutan implementasi** (±16 commit, ±50 file; tiap PR bisa dites & di-merge sendiri):

| PR | Isi | Commit | File (±) |
|---|---|---|---|
| 0 | Dokumen desain ini | 1 | 1 |
| 1 | Migrasi + `schema.sql` + PRD 13/7.7/BR-37 + ERD + checklist; dry-run SQL | 2 | 6 |
| 2 | Modul bersama: tipe, `validasiSoal`, `nilaiJawaban`, `teksKaya` + KaTeX, `SoalPratinjau` + 3 file test | 3 | 10 |
| 3 | Builder soal: API soal + topik, halaman Studio (daftar + builder 3 tipe), menu sidebar, test otorisasi/validasi | 3 | 12 |
| 4 | Stimulus: API + editor + ajukan kelompok + test | 2 | 6 |
| 5 | Review: RPC tinjau/publikasi admin, API tinjau, tab Studio Soal di `/review-konten` & Kelola Konten, notifikasi, dashboard count, test | 3 | 10 |
| 6 | Paket: API + builder + ajukan/auto-publish + test | 2 | 7 |
| 7 | (opsional) Gambar: bucket, API media, blok gambar | 1 | 4 |

PR 1–2 tidak mengubah perilaku apa pun yang terlihat user (hanya tabel kosong + modul murni), jadi aman di-merge lebih dulu. Karena tidak menyentuh Payment/Auth/Referral, review manual wajib CLAUDE.md tidak dipicu, tetapi RPC tinjau (PR 5) disarankan tetap direview manual karena memuat aturan otorisasi.
