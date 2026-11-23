/**
 * Silabus SNBT statis ("Peta Materi") untuk tampilan baca-saja di detail kelas. Murni & client-safe (tanpa server-only).
 * v2: mengikuti kerangka resmi SNPMB. Tampilannya di belakang saklar SILABUS_SNBT_AKTIF
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
    kemampuanInti: "Memecahkan masalah baru dengan berpikir logis dan sistematis.",
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
    kemampuanInti: "Menguasai kosakata, wawasan umum sosiobudaya Indonesia, dan perkembangan bahasa.",
    tipeSoal: [
      t("Kosakata dan makna kata", "Pelajari kata lewat konteks, bukan hafalan daftar. Latih sinonim, antonim, dan padanan di dalam kalimat."),
      t("Penggunaan kata dalam konteks", "Uji kata dengan menggantinya ke kalimat. Pilih yang paling wajar dan tepat maknanya."),
      t("Wawasan umum sosiobudaya Indonesia", "Baca topik umum secara rutin, bukan menghafal fakta. Kaitkan kejadian dengan sebab dan konteksnya."),
      t("Perkembangan bahasa", "Kenali kata serapan, istilah baru, dan perubahan makna. Bedakan bentuk baku dan bentuk yang populer."),
      t("Bacaan pendek dan panjang", "Baca pertanyaan dulu agar tahu apa yang dicari. Tandai kata kunci sebelum membaca ulang bagian yang relevan."),
    ],
  },
  {
    kunci: "pbm",
    nama: "Pemahaman Bacaan dan Menulis",
    aliasNama: ["pbm", "pemahaman bacaan dan menulis"],
    kemampuanInti: "Memilih, menata, dan memperbaiki gagasan dalam tulisan.",
    tipeSoal: [
      t("Memilih gagasan: judul, diksi, dan kalimat rumpang", "Pilih judul dari inti seluruh teks, bukan satu bagian. Uji diksi dan kalimat rumpang dengan membaca ulang paragrafnya."),
      t("Menata gagasan: kalimat utama dan penggabungan kalimat", "Cari kalimat utama lebih dulu. Gabungkan kalimat dengan konjungsi yang menjaga hubungan maknanya."),
      t("Menata gagasan: tanda baca dan variasi kalimat", "Kuasai aturan tanda baca yang paling sering diujikan. Variasikan struktur kalimat tanpa mengubah makna."),
      t("Menata gagasan: urutan dan penempatan kalimat", "Cari kalimat pembuka dan penutup lebih dulu. Susun bagian tengah mengikuti alur sebab-akibat atau kronologi."),
      t("Memperbaiki gagasan: ejaan, kata, dan konjungsi", "Latih ejaan per aturan, bukan soal acak. Cek ketepatan kata hubung dengan makna antarkalimat."),
      t("Memperbaiki gagasan: redundansi, kehematan, dan revisi", "Hapus kata yang mengulang makna. Pilih revisi yang paling hemat dan jelas."),
    ],
  },
  {
    kunci: "pk",
    nama: "Pengetahuan Kuantitatif",
    aliasNama: ["pk", "pengetahuan kuantitatif"],
    kemampuanInti: "Berpikir logis, sistematis, dan analitis pada masalah kuantitatif setara kurikulum SMA.",
    tipeSoal: [
      t("Bilangan", "Sederhanakan dulu sebelum menghitung. Latih hitung cepat tanpa kalkulator."),
      t("Aljabar", "Ubah soal cerita menjadi persamaan. Cek jawaban dengan substitusi cepat."),
      t("Geometri dan pengukuran", "Gambar ulang dan tandai semua informasi. Cek satuan sebelum menghitung."),
      t("Analisis data", "Baca judul, sumbu, dan satuan sebelum angka. Cari tren dulu, hitung belakangan."),
      t("Peluang", "Tentukan ruang sampel dengan rapi. Bedakan kejadian bebas dan bersyarat."),
    ],
  },
  {
    kunci: "lbi",
    nama: "Literasi dalam Bahasa Indonesia",
    // "literasi dalam bahasa ..." = nama resmi di tabel subtes (db/seed_subtes.sql); alias lama tetap agar pencocokan tidak putus.
    aliasNama: ["literasi bahasa indonesia", "lbi", "literasi dalam bahasa indonesia"],
    kemampuanInti: "Menemukan, memahami, menilai, dan merefleksikan informasi dalam teks berbahasa Indonesia, dengan penekanan literasi sains.",
    tipeSoal: [
      b("Proses", "Menemukan informasi dalam teks", "Pindai kata kunci dari pertanyaan ke teks. Informasi yang ditanyakan langsung selalu bisa ditunjuk di teks."),
      b("Proses", "Memahami isi dan makna teks", "Kaitkan antarparagraf, bukan satu kalimat. Rangkum tiap paragraf dengan satu frasa."),
      b("Proses", "Menilai isi dan cara penyajian teks", "Periksa bukti yang dipakai penulis. Nilai apakah data mendukung simpulan."),
      b("Proses", "Merefleksikan teks ke pengalaman dan konteks", "Hubungkan isi teks dengan situasi nyata. Tentukan implikasinya bagi pembaca."),
      b("Konteks", "Konteks sains (kimia, fisika, biologi)", "Pahami istilah kunci di awal teks. Fokus pada sebab-akibat dan data, bukan hafalan rumus."),
      b("Konteks", "Konteks sosial humaniora (ekonomi, sejarah, sosiogeografi)", "Bedakan fakta, penafsiran, dan opini. Perhatikan sudut pandang penulis."),
      b("Konteks", "Konteks personal dan apresiasi sastra", "Kenali tokoh, sudut pandang, dan nilai cerita. Hubungkan nilai itu dengan konteks sosialnya."),
    ],
  },
  {
    kunci: "lbing",
    nama: "Literasi dalam Bahasa Inggris",
    // "literasi dalam bahasa ..." = nama resmi di tabel subtes (db/seed_subtes.sql); alias lama tetap agar pencocokan tidak putus.
    aliasNama: ["literasi bahasa inggris", "lbing", "literasi dalam bahasa inggris"],
    kemampuanInti: "Menemukan, memahami, menilai, dan merefleksikan informasi dalam teks berbahasa Inggris (literasi sains, bukan tes kemampuan bahasa Inggris umum).",
    tipeSoal: [
      b("Proses", "Menemukan informasi: main idea dan detail", "Skim kalimat topik tiap paragraf. Scan detail hanya setelah paham pertanyaan."),
      b("Proses", "Memahami makna: inference dan vocabulary in context", "Cari petunjuk di teks sebelum menebak. Tebak kata dari kalimat sekitar, bukan terjemahan harfiah."),
      b("Proses", "Menilai teks: tujuan, nada, dan argumen", "Kenali tujuan dan nada dari pilihan kata penulis. Periksa apakah bukti mendukung klaim."),
      b("Proses", "Merefleksikan teks ke konteks", "Hubungkan isi teks dengan situasi nyata. Hindari opsi yang melampaui isi teks."),
      b("Konteks", "Konteks sains, sosial humaniora, dan personal", "Kenali istilah umum sains dan sosial dalam bahasa Inggris. Fokus pada ide teks, bukan tata bahasa."),
    ],
  },
  {
    kunci: "pm",
    nama: "Penalaran Matematika",
    aliasNama: ["penalaran matematika", "pm"],
    kemampuanInti: "Bernalar secara matematis: merumuskan, menerapkan, dan menafsirkan matematika dalam konteks nyata.",
    tipeSoal: [
      t("Merumuskan masalah nyata secara matematis", "Terjemahkan cerita ke model matematika satu kalimat dulu. Beri nama variabel sebelum menghitung."),
      t("Menerapkan konsep dan prosedur", "Pilih konsep paling sederhana untuk masalah itu. Hitung dengan rapi dan cek satuan."),
      t("Menafsirkan dan mengevaluasi hasil", "Cek apakah hasil masuk akal dalam konteks. Tuliskan kesimpulan dalam kalimat, bukan hanya angka."),
      t("Menganalisis argumen matematis", "Cari langkah yang tidak didukung data. Uji argumen dengan contoh penyangkal."),
      t("Konteks personal, pekerjaan, sosial, dan saintifik", "Baca konteks dulu untuk tahu besaran yang penting. Abaikan informasi yang tidak dipakai."),
    ],
  },
];

/**
 * Waktu resmi per subtes (jumlah soal, menit). HANYA data — tidak ditampilkan di UI.
 */
export const WAKTU_RESMI: Record<string, { soal: number; menit: number }> = {
  pu: { soal: 30, menit: 30 },
  ppu: { soal: 20, menit: 15 },
  pbm: { soal: 20, menit: 25 },
  pk: { soal: 20, menit: 20 },
  lbi: { soal: 30, menit: 42.5 },
  lbing: { soal: 20, menit: 20 },
  pm: { soal: 20, menit: 42.5 },
};

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
