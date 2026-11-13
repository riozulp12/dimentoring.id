/**
 * Layout email Dimentoring BERSAMA — dipakai semua event email (siswa baru ke
 * mentor, reset password, pembayaran berhasil, dst). Hanya TAMPILAN/isi: tidak
 * ada pengiriman, env, atau akses database di sini (sengaja bebas "server-only"
 * supaya bisa dipakai skrip pratinjau dan tes).
 *
 * Aturan teknis email: tabel bersarang + gaya inline (Gmail/Outlook), lebar
 * maksimum 600px, tanpa JS, tanpa web font. Setiap elemen yang berlatar selalu
 * diberi warna teks pasangannya (tidak ada teks putih di atas latar putih),
 * jadi tetap terbaca saat klien email membalik warna di mode gelap.
 * Semua teks dari luar di-escape; tautan tombol selalu absolut.
 *
 * Gambar: URL absolut ke produksi (di Preview belum tentu ada); aset ada di
 * public/email/ (PNG — SVG tidak tampil di Gmail).
 */

export const BASE_URL_BAWAAN = "https://dimentoring.id";
export const NOMOR_WA_TAMPIL = "0822-2598-2026";
export const TAUTAN_WA = "https://wa.me/6282225982026";
export const TAUTAN_INSTAGRAM = "https://instagram.com/dimentoring.id";
export const TAUTAN_TIKTOK = "https://tiktok.com/@dimentoring.id";
export const SLOGAN = "Bertumbuh Bersama, Dimentorin Sampai Berhasil";
export const CATATAN_OTOMATIS = "Email ini dikirim otomatis oleh sistem Dimentoring. Mohon tidak membalas email ini.";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const WARNA = {
  brand: "#081EEA",
  halaman: "#EEF1F8",
  kartu: "#F3F5FF",
  garisKartu: "#E0E5F7",
  teks: "#1F2937",
  teksIsi: "#374151",
  teksLabel: "#6B7280",
  headerParagraf: "#E6EAFF",
  footer: "#F4F6FB",
  garisFooter: "#E3E7F2",
  bantuanLatar: "#ECFDF3",
  bantuanGaris: "#BBF7D0",
  bantuanTeks: "#14532D",
  bantuanTautan: "#166534",
};

export function escapeHtml(teks: string): string {
  return teks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Satu baris saja (tanpa baris baru) supaya aman untuk subjek / nama pengirim / teks biasa. */
export function satuBaris(teks: string, maks: number): string {
  return teks.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maks);
}

/** http(s) absolut dipakai apa adanya; "/path" digabung ke baseUrl; selain itu jatuh ke baseUrl. */
export function jadikanTautanAbsolut(url: string, baseUrl: string): string {
  const bersih = url.trim();
  if (/^https?:\/\//i.test(bersih)) return bersih;
  const dasar = baseUrl.replace(/\/+$/, "");
  return bersih.startsWith("/") ? `${dasar}${bersih}` : dasar;
}

export interface BarisKartu {
  label: string;
  nilai: string;
}

export interface ParamLayoutEmail {
  /** Judul di header, mis. "Siswa Baru di Kelasmu". */
  namaEvent: string;
  /** Satu paragraf pendukung singkat di bawah judul header. */
  paragrafPendukung: string;
  namaPenerima: string;
  /** Kalimat pembuka di bawah salam. */
  pembuka: string;
  /** Baris kartu ringkasan (label kecil + nilai tebal). Kosong = kartu tidak ditampilkan. */
  isi?: BarisKartu[];
  tombol: { label: string; url: string };
  /** Catatan kecil di bawah tombol (opsional). */
  catatan?: string;
  /** Dasar untuk tautan relatif. Bawaan https://dimentoring.id. */
  baseUrl?: string;
  /** Dasar untuk gambar (logo/ikon). Bawaan produksi; pratinjau lokal boleh menimpa. */
  asetBaseUrl?: string;
}

export interface HasilLayoutEmail {
  html: string;
  teks: string;
}

function barisKartuHtml(baris: BarisKartu, terakhir: boolean): string {
  return `
                  <tr><td style="font-family:${FONT};font-size:12px;line-height:1.4;color:${WARNA.teksLabel};padding-bottom:3px;">${escapeHtml(baris.label)}</td></tr>
                  <tr><td style="font-family:${FONT};font-size:16px;line-height:1.4;color:${WARNA.teks};font-weight:700;${terakhir ? "" : "padding-bottom:14px;"}">${escapeHtml(baris.nilai)}</td></tr>`;
}

function ikonMedsosHtml(href: string, src: string, alt: string): string {
  return `
                      <td style="padding:0 7px;">
                        <a href="${escapeHtml(href)}" target="_blank" style="text-decoration:none;"><img src="${escapeHtml(src)}" width="40" height="40" alt="${escapeHtml(alt)}" style="display:block;width:40px;height:40px;border:0;outline:none;text-decoration:none;" /></a>
                      </td>`;
}

export function renderEmailLayout(param: ParamLayoutEmail): HasilLayoutEmail {
  const baseUrl = param.baseUrl ?? BASE_URL_BAWAAN;
  const aset = (berkas: string) => `${(param.asetBaseUrl ?? BASE_URL_BAWAAN).replace(/\/+$/, "")}/email/${berkas}`;
  const tautanTombol = jadikanTautanAbsolut(param.tombol.url, baseUrl);
  const baris = (param.isi ?? []).filter((b) => b.label.trim() && b.nilai.trim());

  const kartu = baris.length
    ? `
          <tr>
            <td class="px" style="padding:0 32px 8px;" bgcolor="#FFFFFF">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${WARNA.kartu};border:1px solid ${WARNA.garisKartu};border-radius:14px;" bgcolor="${WARNA.kartu}">
                <tr>
                  <td style="padding:18px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${baris
                      .map((b, i) => barisKartuHtml(b, i === baris.length - 1))
                      .join("")}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : "";

  const catatan = param.catatan?.trim()
    ? `
          <tr>
            <td class="px" style="padding:0 32px 24px;" bgcolor="#FFFFFF">
              <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${WARNA.teksIsi};">${escapeHtml(param.catatan.trim())}</p>
            </td>
          </tr>`
    : "";

  const html = `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(param.namaEvent)}</title>
    <style>
      @media only screen and (max-width:620px) {
        .px { padding-left:20px !important; padding-right:20px !important; }
        .btn-tbl { width:100% !important; }
        .btn-a { display:block !important; }
        .judul { font-size:22px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${WARNA.halaman};" bgcolor="${WARNA.halaman}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${WARNA.halaman};" bgcolor="${WARNA.halaman}">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-radius:20px;overflow:hidden;">
          <tr>
            <td class="px" align="center" bgcolor="${WARNA.brand}" style="background-color:${WARNA.brand};padding:32px 32px 30px;text-align:center;">
              <table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="text-align:center;">
                    <img src="${escapeHtml(aset("logo-putih.png"))}" width="150" height="40" alt="Dimentoring" style="display:block;margin:0 auto;width:150px;height:40px;border:0;outline:none;text-decoration:none;" />
                  </td>
                </tr>
                <tr>
                  <td align="center" style="text-align:center;">
                    <h1 class="judul" style="margin:22px 0 10px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:700;color:#FFFFFF;text-align:center;">${escapeHtml(param.namaEvent)}</h1>
                    <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${WARNA.headerParagraf};text-align:center;">${escapeHtml(param.paragrafPendukung)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:28px 32px 20px;">
              <p style="margin:0 0 10px;font-family:${FONT};font-size:16px;line-height:1.5;color:${WARNA.teks};">Halo <strong>${escapeHtml(param.namaPenerima)}</strong>,</p>
              <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${WARNA.teksIsi};">${escapeHtml(param.pembuka)}</p>
            </td>
          </tr>${kartu}
          <tr>
            <td class="px" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:20px 32px 12px;">
              <table role="presentation" class="btn-tbl" align="center" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" bgcolor="${WARNA.brand}" style="background-color:${WARNA.brand};border-radius:12px;">
                    <a class="btn-a" href="${escapeHtml(tautanTombol)}" target="_blank" style="display:block;padding:15px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.2;color:#FFFFFF;text-decoration:none;text-align:center;border-radius:12px;">${escapeHtml(param.tombol.label)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:0 32px 20px;">
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${WARNA.teksLabel};text-align:center;">Tombol tidak berfungsi? Salin dan buka tautan ini di browser:<br /><a href="${escapeHtml(tautanTombol)}" target="_blank" style="color:${WARNA.brand};word-break:break-all;">${escapeHtml(tautanTombol)}</a></p>
            </td>
          </tr>${catatan}
          <tr>
            <td class="px" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:0 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${WARNA.bantuanLatar};border:1px solid ${WARNA.bantuanGaris};border-radius:14px;" bgcolor="${WARNA.bantuanLatar}">
                <tr>
                  <td width="32" valign="middle" style="padding:14px 0 14px 18px;">
                    <img src="${escapeHtml(aset("ikon-whatsapp.png"))}" width="32" height="32" alt="WhatsApp" style="display:block;width:32px;height:32px;border:0;outline:none;text-decoration:none;" />
                  </td>
                  <td valign="middle" style="padding:14px 18px 14px 12px;font-family:${FONT};font-size:14px;line-height:1.6;color:${WARNA.bantuanTeks};">
                    Butuh bantuan atau punya pertanyaan? Hubungi WhatsApp Tim Dimentoring di <a href="${TAUTAN_WA}" target="_blank" style="color:${WARNA.bantuanTautan};font-weight:700;text-decoration:underline;">${NOMOR_WA_TAMPIL}</a>.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" align="center" bgcolor="${WARNA.footer}" style="background-color:${WARNA.footer};border-top:1px solid ${WARNA.garisFooter};padding:26px 32px 28px;">
              <img src="${escapeHtml(aset("logo-biru.png"))}" width="120" height="32" alt="Dimentoring" style="display:block;margin:0 auto;width:120px;height:32px;border:0;outline:none;text-decoration:none;" />
              <p style="margin:12px 0 16px;font-family:${FONT};font-size:13px;line-height:1.5;color:${WARNA.teksIsi};text-align:center;">${escapeHtml(SLOGAN)}</p>
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>${ikonMedsosHtml(TAUTAN_WA, aset("ikon-whatsapp.png"), "WhatsApp")}${ikonMedsosHtml(TAUTAN_INSTAGRAM, aset("ikon-instagram.png"), "Instagram")}${ikonMedsosHtml(TAUTAN_TIKTOK, aset("ikon-tiktok.png"), "TikTok")}
                </tr>
              </table>
              <p style="margin:18px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${WARNA.teksLabel};text-align:center;">${escapeHtml(CATATAN_OTOMATIS)}</p>
            </td>
          </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, teks: renderTeksLayout(param, baris, tautanTombol) };
}

function renderTeksLayout(param: ParamLayoutEmail, baris: BarisKartu[], tautanTombol: string): string {
  const t = (nilai: string) => satuBaris(nilai, 500);
  return [
    `DIMENTORING - ${t(param.namaEvent)}`,
    t(param.paragrafPendukung),
    "",
    `Halo ${t(param.namaPenerima)},`,
    "",
    t(param.pembuka),
    ...(baris.length ? ["", ...baris.map((b) => `${t(b.label)}: ${t(b.nilai)}`)] : []),
    "",
    `${t(param.tombol.label)}:`,
    tautanTombol,
    ...(param.catatan?.trim() ? ["", t(param.catatan)] : []),
    "",
    "--",
    `Butuh bantuan atau punya pertanyaan? Hubungi WhatsApp Tim Dimentoring di ${NOMOR_WA_TAMPIL}: ${TAUTAN_WA}`,
    "",
    `Dimentoring - ${SLOGAN}`,
    `WhatsApp: ${TAUTAN_WA}`,
    `Instagram: ${TAUTAN_INSTAGRAM}`,
    `TikTok: ${TAUTAN_TIKTOK}`,
    "",
    CATATAN_OTOMATIS,
  ].join("\n");
}
