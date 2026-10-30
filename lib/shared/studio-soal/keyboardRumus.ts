/**
 * Keyboard layar editor rumus (Studio Soal revisi UX-3 butir 11). Modul MURNI
 * (hanya tipe dari mathlive) supaya isi tombolnya bisa diuji terhadap
 * cekRumusEditor/cekRumus yang sama dengan validasi Ajukan.
 *
 * Masalah sebelumnya: keyboard numerik bawaan MathLive memakai tombol "/"
 * sebagai PECAHAN dan "*" sebagai titik (\cdot) — tidak ada tombol bagi (÷)
 * dan kali (×). Sekarang:
 *   - "Huruf & angka" (bawaan saat editor dibuka): QWERTY + angka + simbol
 *     lazim. × = \times, ÷ = \div, "/" = garis miring biasa, pecahan
 *     tombol tersendiri.
 *   - "Rumus": keyboard numerik bawaan MathLive (pecahan, pangkat, akar, …).
 *   - "Simbol": keyboard simbol + huruf Yunani bawaan MathLive.
 * Hasil editor tetap teks rumus yang sama (\( … \)); tidak ada migrasi.
 */
import type { VirtualKeyboardKeycap, VirtualKeyboardLayout, VirtualKeyboardName } from "mathlive";

type Tombol = string | Partial<VirtualKeyboardKeycap>;

const huruf = (deret: string): Tombol[] => [...deret].map((c) => ({ latex: c, shift: c.toUpperCase() }));

/** Tombol simbol yang ditambahkan sendiri (bukan bawaan MathLive) — semua diuji lolos cekRumus. */
export const TOMBOL_SIMBOL: { latex: string; label?: string; tooltip: string }[] = [
  { latex: "+", tooltip: "tambah" },
  { latex: "-", label: "−", tooltip: "kurang" },
  { latex: "\\times", label: "×", tooltip: "kali" },
  { latex: "\\div", label: "÷", tooltip: "bagi" },
  { latex: "=", tooltip: "sama dengan" },
  { latex: "<", tooltip: "kurang dari" },
  { latex: ">", tooltip: "lebih dari" },
  { latex: "\\le", label: "≤", tooltip: "kurang dari atau sama dengan" },
  { latex: "\\ge", label: "≥", tooltip: "lebih dari atau sama dengan" },
  { latex: "\\ne", label: "≠", tooltip: "tidak sama dengan" },
  { latex: "(", tooltip: "kurung buka" },
  { latex: ")", tooltip: "kurung tutup" },
  { latex: ",", tooltip: "koma" },
  { latex: ".", tooltip: "titik" },
  { latex: "/", tooltip: "garis miring (bukan pecahan)" },
  { latex: "\\%", label: "%", tooltip: "persen" },
];

/** Tombol bentuk (dengan kotak isian) — #@ = isi sebelumnya/terpilih, #? / #0 = kotak kosong. */
export const TOMBOL_BENTUK: { latex: string; label: string; tooltip: string }[] = [
  { latex: "\\frac{#@}{#?}", label: "a⁄b", tooltip: "pecahan" },
  { latex: "#@^{#?}", label: "xⁿ", tooltip: "pangkat" },
  { latex: "\\sqrt{#0}", label: "√", tooltip: "akar" },
];

const tombol = (t: { latex: string; label?: string; tooltip: string }, kelas?: string): Tombol => ({
  latex: t.latex,
  ...(t.label ? { label: t.label } : {}),
  tooltip: t.tooltip,
  ...(kelas ? { class: kelas } : {}),
});

const simbol = (latex: string) => tombol(TOMBOL_SIMBOL.find((t) => t.latex === latex)!);
const bentuk = (latex: string) => tombol(TOMBOL_BENTUK.find((t) => t.latex === latex)!, "small");

/** Keyboard "Huruf & angka" (QWERTY) — keyboard bawaan saat editor dibuka. */
export const KEYBOARD_HURUF: VirtualKeyboardLayout = {
  id: "dimentoring-huruf",
  label: "abc",
  tooltip: "Huruf, angka & simbol",
  displayEditToolbar: true,
  rows: [
    [..."1234567890"],
    huruf("qwertyuiop"),
    ["[separator-5]", ...huruf("asdfghjkl"), "[separator-5]"],
    ["[shift]", ...huruf("zxcvbnm"), "[backspace]"],
    ["+", "-", "\\times", "\\div", "=", "<", ">", "\\le", "\\ge", "\\ne"].map(simbol),
    [...["(", ")", ",", ".", "/", "\\%"].map(simbol), ...TOMBOL_BENTUK.map((t) => bentuk(t.latex)), "[left]", "[right]"],
  ],
};

export type JenisKeyboard = "huruf" | "rumus" | "simbol";

export const JENIS_KEYBOARD: { id: JenisKeyboard; label: string; keterangan: string }[] = [
  { id: "huruf", label: "Huruf & angka", keterangan: "Huruf, angka, + − × ÷ = < > ( ) / √" },
  { id: "rumus", label: "Rumus", keterangan: "Pecahan, pangkat, akar, dan fungsi" },
  { id: "simbol", label: "Simbol", keterangan: "Simbol matematika dan huruf Yunani" },
];

/** Isi `mathVirtualKeyboard.layouts` untuk jenis keyboard yang dipilih. */
export function layoutKeyboard(jenis: JenisKeyboard): (VirtualKeyboardName | VirtualKeyboardLayout)[] {
  if (jenis === "rumus") return ["numeric"];
  if (jenis === "simbol") return ["symbols", "greek"];
  return [KEYBOARD_HURUF];
}

/** Contoh hasil tombol bentuk setelah kotaknya diisi (untuk uji validasi). */
export const contohIsi = (latex: string) => latex.replace(/#[@?0-9]/g, "x");
