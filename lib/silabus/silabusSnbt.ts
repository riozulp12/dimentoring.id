/**
 * Silabus SNBT statis ("Peta Materi") untuk tampilan baca-saja di detail kelas. Murni & client-safe (tanpa server-only).
 * DRAF: isi belum diverifikasi ke kisi-kisi resmi SNPMB — tampilannya di belakang saklar SILABUS_SNBT_AKTIF
 * (lib/shared/silabusSnbtFlag.ts). Tiap `strategi` = dua kalimat: kalimat pertama (hook) saja yang ditampilkan.
 */

export interface TipeSoal {
  /** Pengelompokan opsional (mis. Induktif/Deduktif/Kuantitatif pada Penalaran Umum). */
  bagian?: string;
  nama: string;
  /** Dua kalimat: "Hook. Detail." — tampilan hanya memakai `strategiHook`. */
  strategi: string;
}

export interface Subtes {
  kunci: string;
  nama: string;
  /** Nama lain (huruf kecil, tanpa diakritik) yang dipetakan ke subtes ini. */
  aliasNama: string[];
  kemampuanInti: string;
  tipeSoal: TipeSoal[];
}

export const ALUR_SESI = "Diagnostik, Latihan per tipe soal, Strategi waktu, Tryout, Pembahasan";

const t = (nama: string, strategi: string): TipeSoal => ({ nama, strategi });
const b = (bagian: string, nama: string, strategi: string): TipeSoal => ({ bagian, nama, strategi });

export const SILABUS_SNBT: Subtes[] = [
  {
    kunci: "pu",
    nama: "Penalaran Umum",
    aliasNama: ["penalaran umum"],
    kemampuanInti: "Menarik pola, menyimpulkan dari premis, dan bernalar kuantitatif sederhana.",
    tipeSoal: [
      b("Induktif", "Pola bilangan dan deret", "Cari aturannya dari 2-3 contoh dulu. Uji ke contoh lain sebelum memilih jawaban."),
      b("Induktif", "Analogi dan hubungan", "Tentukan hubungan pasangan pertama dengan satu kalimat. Terapkan hubungan yang sama ke pasangan kedua."),
      b("Induktif", "Generalisasi dari fakta dan data", "Cari kesamaan dari semua fakta, bukan satu fakta saja. Tolak kesimpulan yang melebihi bukti."),
      b("Induktif", "Sebab-akibat", "Bedakan urutan kejadian dengan hubungan sebab. Uji apakah akibat tetap terjadi tanpa sebabnya."),
      b("Deduktif", "Silogisme", "Ubah premis ke diagram lingkaran. Hanya kesimpulan yang selalu benar yang boleh dipilih."),
      b("Deduktif", "Logika proposisi", "Ubah kalimat ke bentuk jika-maka. Gunakan kontraposisi untuk memeriksa jawaban."),
      b("Deduktif", "Penalaran kondisional dan urutan", "Buat tabel atau denah dari semua aturan. Isi yang pasti dulu, baru yang bersyarat."),
      b("Kuantitatif", "Hubungan kuantitas dan perbandingan", "Estimasi dulu sebelum menghitung. Hitung hanya bila opsi terlalu dekat."),
      b("Kuantitatif", "Aritmetika dan persentase", "Sederhanakan angka sebelum menghitung. Hafal pecahan kesayangan seperti 1/4, 1/5, dan 1/8 untuk persen."),
    ],
  },
  {
    kunci: "ppu",
    nama: "Pengetahuan dan Pemahaman Umum",
    aliasNama: ["ppu", "pengetahuan dan pemahaman umum"],
    kemampuanInti: "Memahami, menganalisis, dan menyimpulkan informasi dari bacaan umum.",
    tipeSoal: [
      t("Gagasan utama dan pendukung", "Baca kalimat pertama dan terakhir tiap paragraf lebih dulu. Tandai kata kunci yang berulang."),
      t("Makna kata dalam konteks", "Ganti kata itu dengan tiap opsi. Pilih yang membuat kalimat tetap wajar."),
      t("Inferensi dan simpulan", "Bedakan yang tertulis, yang tersirat, dan opini penulis. Jawaban inferensi harus punya pegangan di teks."),
      t("Hubungan antargagasan dan tujuan penulis", "Buat peta alur argumen singkat. Tanyakan mengapa penulis menulis bagian ini."),
      t("Kesesuaian pernyataan dengan teks", "Cocokkan tiap pernyataan ke satu kalimat sumber. Waspada kata mutlak seperti selalu dan semua."),
    ],
  },
  {
    kunci: "pbm",
    nama: "Pemahaman Bacaan dan Menulis",
    aliasNama: ["pbm", "pemahaman bacaan dan menulis"],
    kemampuanInti: "Memilih, menata, dan memperbaiki gagasan dalam tulisan.",
    tipeSoal: [
      t("Kalimat efektif", "Cek subjek dan predikat lebih dulu. Hapus kata yang tidak menambah makna."),
      t("Ejaan dan tanda baca", "Kuasai aturan yang paling sering diujikan. Latih per aturan, bukan soal acak."),
      t("Pilihan kata dan keformalan", "Bedakan baku dan tidak baku lewat contoh. Pilih kata yang sesuai ragam tulisannya."),
      t("Kohesi dan koherensi", "Perhatikan kata hubung dan kata rujukan. Cek apakah tiap kalimat nyambung dengan sebelumnya."),
      t("Penyusunan kalimat dan paragraf", "Cari kalimat utama dan kalimat penutup lebih dulu. Susun bagian tengah mengikuti alur sebab dan urutan."),
      t("Perbaikan kalimat atau paragraf rumpang", "Masukkan tiap opsi lalu baca ulang. Pilih yang paling logis dan hemat."),
    ],
  },
  {
    kunci: "pk",
    nama: "Pengetahuan Kuantitatif",
    aliasNama: ["pk", "pengetahuan kuantitatif"],
    kemampuanInti: "Menganalisis pola dan data lalu mengambil keputusan kuantitatif.",
    tipeSoal: [
      t("Aritmetika dan aljabar dasar", "Sederhanakan dulu sebelum menghitung. Latih hitung cepat tanpa kalkulator."),
      t("Geometri dasar", "Gambar ulang dan tandai semua informasi. Cari bangun yang dikenal di dalam gambar."),
      t("Statistika dan peluang", "Hafal rumus inti saja. Ubah soal cerita menjadi langkah hitung."),
      t("Analisis data tabel dan grafik", "Baca judul, sumbu, dan satuan sebelum angka. Cari tren dulu, hitung belakangan."),
      t("Perbandingan kuantitas dan kecukupan data", "Tentukan apa yang perlu diketahui untuk memutuskan. Cek apakah data yang ada sudah cukup."),
    ],
  },
  {
    kunci: "lbi",
    nama: "Literasi dalam Bahasa Indonesia",
    // "literasi dalam bahasa indonesia" = nama resmi di tabel subtes (db/seed_subtes.sql, rename_subtes_nama_resmi.sql).
    aliasNama: ["literasi bahasa indonesia", "lbi", "literasi dalam bahasa indonesia"],
    kemampuanInti: "Menemukan informasi, menafsirkan, dan mengevaluasi teks sastra dan nonsastra.",
    tipeSoal: [
      t("Menemukan informasi tersurat", "Pindai kata kunci dari pertanyaan ke teks. Jawaban tersurat selalu bisa ditunjuk di teks."),
      t("Menafsirkan makna dan gagasan tersirat", "Kaitkan antarparagraf, bukan satu kalimat. Tanyakan apa yang ingin disampaikan penulis."),
      t("Mengevaluasi isi, argumen, dan kebahasaan", "Cek bukti yang dipakai penulis. Nilai apakah penalaran dari bukti ke simpulan cukup kuat."),
      t("Teks sastra", "Kenali unsur pembangun dan sudut pandang. Hubungkan nilai cerita dengan konteks sosialnya."),
      t("Teks nonsastra", "Pisahkan fakta dari opini. Tentukan sudut pandang penulis dari pilihan katanya."),
    ],
  },
  {
    kunci: "lbing",
    nama: "Literasi dalam Bahasa Inggris",
    aliasNama: ["literasi bahasa inggris", "lbing", "literasi dalam bahasa inggris"],
    kemampuanInti: "Memahami teks bahasa Inggris akademik dan populer.",
    tipeSoal: [
      t("Main idea dan detail", "Skim paragraf pertama dan kalimat topik tiap paragraf. Scan detail hanya setelah paham pertanyaan."),
      t("Inference", "Cari petunjuk di teks sebelum menebak. Hindari opsi yang terlalu ekstrem."),
      t("Vocabulary in context", "Tebak dari kalimat sekitar, bukan terjemahan harfiah. Uji dengan mengganti kata itu ke kalimat."),
      t("Reference dan author's purpose/tone", "Telusuri kata ganti ke kata benda terdekat. Kenali nada penulis dari pilihan katanya."),
      t("Organisasi paragraf dan teks", "Perhatikan transition words. Susun urutan dari umum ke khusus atau secara kronologis."),
    ],
  },
  {
    kunci: "pm",
    nama: "Penalaran Matematika",
    aliasNama: ["penalaran matematika", "pm"],
    kemampuanInti: "Memodelkan dan menyelesaikan masalah kontekstual dengan matematika.",
    tipeSoal: [
      t("Aljabar dan fungsi dalam konteks", "Terjemahkan cerita ke satu persamaan dulu. Beri nama variabel sebelum menghitung."),
      t("Geometri dan pengukuran kontekstual", "Gambar situasinya lebih dulu. Cek satuan sebelum dan sesudah menghitung."),
      t("Data dan peluang kontekstual", "Tentukan data apa yang dibutuhkan. Hitung ruang sampel dengan rapi."),
      t("Bilangan, proporsi, dan perbandingan", "Cari hubungan skala dan laju. Bedakan perbandingan senilai dan berbalik nilai."),
      t("Interpretasi grafik dan model", "Baca sumbu dan tren lebih dulu. Cocokkan model dengan titik data yang diketahui."),
    ],
  },
];

/** Kalimat pertama strategi (potong di ". " pertama atau akhir teks), di-trim, selalu berakhiran titik. */
export function strategiHook(strategi: string): string {
  const teks = strategi.trim();
  const idx = teks.indexOf(". ");
  const hook = (idx >= 0 ? teks.slice(0, idx) : teks).trim().replace(/\.+$/, "");
  return `${hook}.`;
}

function normalisasi(nama: string): string {
  return nama
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Subtes silabus untuk nama subtes kelas; hanya untuk program SNBT. Nama generik ("Matematika") tidak dipetakan
 * (tidak ada di nama/alias mana pun). Tidak cocok = null.
 */
export function cariSilabusSnbt(namaSubtes: string | null | undefined, programKategori: string | null | undefined): Subtes | null {
  if (programKategori !== "snbt" || !namaSubtes) return null;
  const kunci = normalisasi(namaSubtes);
  return (
    SILABUS_SNBT.find((s) => normalisasi(s.nama) === kunci || s.aliasNama.some((a) => normalisasi(a) === kunci)) ?? null
  );
}
