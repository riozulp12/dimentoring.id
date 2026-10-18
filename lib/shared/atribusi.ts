/**
 * Atribusi first-touch (UTM) — PRD 7.4.6 / BR-38.
 *
 * Cookie `dm_attr` dipasang proxy.ts saat pengunjung pertama kali datang
 * lewat link berparameter UTM/fbclid, lalu dibaca server (register, Google
 * callback, submit Assessment, POST /api/leads). Isinya JSON ringkas, tanpa
 * data pribadi.
 *
 * File ini murni (tanpa "server-only" / modul Node) supaya bisa diimport
 * proxy.ts. Nilai cookie tetap bisa diedit pengguna, jadi SELALU dibaca lewat
 * `parseAtribusiCookie` yang membersihkan ulang setiap field.
 */

export const ATTR_COOKIE_NAME = "dm_attr";
export const ATTR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 hari
export const ATTR_MAX_PANJANG = 100;

export interface Atribusi {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  fbclid: string | null;
  landing_path: string | null;
  /** Waktu kunjungan pertama (epoch ms). */
  ts: number;
}

export const ATTR_PARAM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid"] as const;
type ParamKey = (typeof ATTR_PARAM_KEYS)[number];

/** Huruf, angka, spasi, `_ - .` saja; dipotong ATTR_MAX_PANJANG. Kosong -> null. */
export function bersihkanNilaiAtribusi(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bersih = value
    .replace(/[^A-Za-z0-9 _.-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ATTR_MAX_PANJANG)
    .trim();
  return bersih || null;
}

/** Path internal saja (diawali satu "/"), karakter aman, tanpa query string. */
export function bersihkanLandingPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  const bersih = value.replace(/[^A-Za-z0-9/_.-]/g, "").slice(0, ATTR_MAX_PANJANG);
  return bersih || null;
}

/**
 * Atribusi dari URL kunjungan. null kalau tidak ada satu pun parameter
 * UTM/fbclid yang terisi (kunjungan biasa tidak memasang cookie).
 */
export function buatAtribusiDariUrl(searchParams: URLSearchParams, pathname: string, now = Date.now()): Atribusi | null {
  const nilai = {} as Record<ParamKey, string | null>;
  for (const key of ATTR_PARAM_KEYS) nilai[key] = bersihkanNilaiAtribusi(searchParams.get(key));
  if (ATTR_PARAM_KEYS.every((key) => nilai[key] === null)) return null;
  return { ...nilai, landing_path: bersihkanLandingPath(pathname), ts: now };
}

export function serializeAtribusi(attr: Atribusi): string {
  return JSON.stringify(attr);
}

/** Baca & validasi ulang isi cookie dm_attr. Rusak/kosong/tanpa UTM -> null. */
export function parseAtribusiCookie(raw: string | undefined | null): Atribusi | null {
  if (!raw || raw.length > 2000) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;

  const nilai = {} as Record<ParamKey, string | null>;
  for (const key of ATTR_PARAM_KEYS) nilai[key] = bersihkanNilaiAtribusi(obj[key]);
  if (ATTR_PARAM_KEYS.every((key) => nilai[key] === null)) return null;

  const ts = typeof obj.ts === "number" && Number.isFinite(obj.ts) && obj.ts > 0 ? Math.floor(obj.ts) : 0;
  return { ...nilai, landing_path: bersihkanLandingPath(obj.landing_path), ts };
}

/** Pembacaan dari objek cookies (NextRequest.cookies atau cookies() Next). */
export function bacaAtribusi(cookieStore: { get(name: string): { value: string } | undefined }): Atribusi | null {
  return parseAtribusiCookie(cookieStore.get(ATTR_COOKIE_NAME)?.value);
}

/**
 * UTM yang disimpan ke users saat register (biasa & Google). Kalau query
 * /daftar membawa utm_source atau utm_campaign, perilaku lama dipakai apa
 * adanya. Kalau dua-duanya kosong, pakai atribusi first-touch dari dm_attr.
 */
export function pilihUtmPendaftaran(
  bodySource: string | undefined | null,
  bodyCampaign: string | undefined | null,
  attr: Atribusi | null,
): { utmSource: string | null; utmCampaign: string | null } {
  const utmSource = bodySource?.trim() || null;
  const utmCampaign = bodyCampaign?.trim() || null;
  if (utmSource || utmCampaign) return { utmSource, utmCampaign };
  return { utmSource: attr?.utm_source ?? null, utmCampaign: attr?.utm_campaign ?? null };
}
