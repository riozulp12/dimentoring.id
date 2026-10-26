/**
 * Pengurai "teks kaya" Studio Soal — modul MURNI (tanpa KaTeX, tanpa DOM).
 * Dipakai komponen TeksKaya (render) dan rumus.ts (validasi rumus).
 *
 * Format yang dikenal (desain Bagian 4):
 *   \( … \)   rumus sebaris        \[ … \]   rumus blok
 *   **…**     tebal                *…*       miring
 *   baris kosong = paragraf baru, satu baris baru = pindah baris
 *   {{r1}}    penanda rumpang isian (hanya bila opsi `rumpang` aktif)
 *   \*  \\    bintang / garis miring terbalik biasa (bukan format)
 * Tanda `$` TIDAK dianggap rumus (teks Literasi B. Inggris bisa memuat dolar).
 *
 * Hasilnya struktur data, bukan HTML: teks biasa dirender React sebagai teks
 * (otomatis di-escape) — tidak pernah ada HTML dari teks pengguna.
 *
 * Aturan tebal/miring mengikuti markdown: penanda pembuka harus diikuti
 * karakter bukan-spasi, penutup harus didahului karakter bukan-spasi, dan
 * pasangan harus ada di paragraf yang sama. Selain itu penanda tampil apa
 * adanya (mis. "2 * 3 * 4" tetap teks biasa).
 */
import { POLA_ID_BAGIAN } from "./tipe";

export type Segmen =
  | { jenis: "teks"; teks: string; tebal: boolean; miring: boolean }
  | { jenis: "rumus"; tex: string; blok: boolean; tebal: boolean; miring: boolean }
  | { jenis: "baris_baru" }
  | { jenis: "rumpang"; id: string };

export interface Paragraf {
  segmen: Segmen[];
}

export interface OpsiUrai {
  /** Kenali {{id}} sebagai rumpang (redaksi soal isian). */
  rumpang?: boolean;
}

type Token =
  | { t: "teks"; v: string }
  | { t: "rumus"; tex: string; blok: boolean }
  | { t: "rumpang"; id: string }
  | { t: "penanda"; v: "**" | "*"; bisaBuka: boolean; bisaTutup: boolean }
  | { t: "baris" }
  | { t: "paragraf" };

const POLA_RUMPANG = /^\{\{([^{}]*)\}\}/;

/** Posisi penutup rumus (`\)` atau `\]`) mulai dari `dari`, atau -1. "\\" dilewati. */
function cariPenutup(s: string, dari: number, penutup: ")" | "]"): number {
  for (let j = dari; j < s.length - 1; j++) {
    if (s[j] !== "\\") continue;
    if (s[j + 1] === "\\") {
      j++;
      continue;
    }
    if (s[j + 1] === penutup) return j;
  }
  return -1;
}

const kosong = (c: string | undefined) => c === undefined || /\s/u.test(c);

function tokenisasi(s: string, opsi: OpsiUrai): Token[] {
  const token: Token[] = [];
  let teks = "";
  const dorongTeks = () => {
    if (teks) token.push({ t: "teks", v: teks });
    teks = "";
  };

  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === "\\") {
      const n = s[i + 1];
      if (n === "(" || n === "[") {
        const akhir = cariPenutup(s, i + 2, n === "(" ? ")" : "]");
        if (akhir !== -1) {
          dorongTeks();
          token.push({ t: "rumus", tex: s.slice(i + 2, akhir), blok: n === "[" });
          i = akhir + 2;
          continue;
        }
      } else if (n === "\\" || n === "*" || n === "{" || n === "}") {
        teks += n;
        i += 2;
        continue;
      }
      teks += c;
      i++;
      continue;
    }
    if (c === "*") {
      const ganda = s[i + 1] === "*";
      const panjang = ganda ? 2 : 1;
      dorongTeks();
      token.push({
        t: "penanda",
        v: ganda ? "**" : "*",
        bisaBuka: !kosong(s[i + panjang]),
        bisaTutup: !kosong(s[i - 1]),
      });
      i += panjang;
      continue;
    }
    if (c === "{" && opsi.rumpang && s[i + 1] === "{") {
      const m = POLA_RUMPANG.exec(s.slice(i));
      if (m && POLA_ID_BAGIAN.test(m[1])) {
        dorongTeks();
        token.push({ t: "rumpang", id: m[1] });
        i += m[0].length;
        continue;
      }
    }
    if (c === "\n" || c === "\r") {
      // Baris kosong (boleh berisi spasi) = paragraf baru; satu baris = pindah baris.
      const m = /^(?:\r?\n[ \t]*){2,}/.exec(s.slice(i));
      dorongTeks();
      if (m) {
        token.push({ t: "paragraf" });
        i += m[0].length;
      } else {
        token.push({ t: "baris" });
        i += c === "\r" && s[i + 1] === "\n" ? 2 : 1;
      }
      continue;
    }
    teks += c;
    i++;
  }
  dorongTeks();
  return token;
}

/** Pasangkan penanda dalam satu paragraf; yang tidak berpasangan jadi teks biasa. */
function pasangkan(token: Token[]): Set<number> {
  const dipakai = new Set<number>();
  for (const jenis of ["**", "*"] as const) {
    let buka = -1;
    token.forEach((tk, i) => {
      if (tk.t !== "penanda" || tk.v !== jenis) return;
      if (buka !== -1 && tk.bisaTutup) {
        dipakai.add(buka);
        dipakai.add(i);
        buka = -1;
      } else if (tk.bisaBuka) {
        buka = i;
      }
    });
  }
  return dipakai;
}

function susunParagraf(token: Token[]): Paragraf {
  const dipakai = pasangkan(token);
  const segmen: Segmen[] = [];
  let tebal = false;
  let miring = false;
  const tambahTeks = (v: string) => {
    const akhir = segmen[segmen.length - 1];
    if (akhir?.jenis === "teks" && akhir.tebal === tebal && akhir.miring === miring) akhir.teks += v;
    else segmen.push({ jenis: "teks", teks: v, tebal, miring });
  };
  token.forEach((tk, i) => {
    switch (tk.t) {
      case "teks":
        tambahTeks(tk.v);
        break;
      case "penanda":
        if (!dipakai.has(i)) tambahTeks(tk.v);
        else if (tk.v === "**") tebal = !tebal;
        else miring = !miring;
        break;
      case "rumus":
        segmen.push({ jenis: "rumus", tex: tk.tex, blok: tk.blok, tebal, miring });
        break;
      case "rumpang":
        segmen.push({ jenis: "rumpang", id: tk.id });
        break;
      case "baris":
        segmen.push({ jenis: "baris_baru" });
        break;
    }
  });
  return { segmen };
}

export function uraiTeksKaya(teks: string, opsi: OpsiUrai = {}): Paragraf[] {
  const token = tokenisasi(teks ?? "", opsi);
  const hasil: Paragraf[] = [];
  let kini: Token[] = [];
  for (const tk of token) {
    if (tk.t === "paragraf") {
      if (kini.length) hasil.push(susunParagraf(kini));
      kini = [];
    } else {
      kini.push(tk);
    }
  }
  if (kini.length) hasil.push(susunParagraf(kini));
  return hasil;
}

/** Semua rumus di teks (untuk validasi KaTeX). */
export function ambilRumus(teks: string): { tex: string; blok: boolean }[] {
  return tokenisasi(teks ?? "", {})
    .filter((tk): tk is Extract<Token, { t: "rumus" }> => tk.t === "rumus")
    .map((tk) => ({ tex: tk.tex, blok: tk.blok }));
}
