/**
 * Supabase tiruan di memori untuk tes bank soal Admin (tidak pernah menyentuh
 * database asli). Hanya meniru BACA yang dipakai data layer + mencatat panggilan
 * RPC; aturan RPC-nya diuji di DRYRUN SQL, bukan ditiru di sini.
 */
import { NextRequest } from "next/server";

export type Row = Record<string, unknown>;
export const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const ADMIN = u(1);
export const ADMIN_NONAKTIF = u(2);
export const SISWA = u(21);

/** Batas baris per permintaan, seperti max-rows PostgREST. */
const MAKS_BARIS = 1000;

export const db: Record<string, Row[]> = {};
export const tulisLangsung: string[] = [];
export const rpc: { panggilan: { nama: string; args: Row }[]; jawab: Row | ((args: Row, nama: string) => Row); gagal: boolean } = {
  panggilan: [],
  jawab: {},
  gagal: false,
};

type Hasil = { data: Row[] | null; error: null | { message: string; code?: string }; count: number | null };

class Kueri implements PromiseLike<Hasil> {
  private urut: { kolom: string; naik: boolean }[] = [];
  private jangkauan: [number, number] | null = null;
  private batas: number | null = null;
  private hitung = false;
  constructor(private baris: Row[]) {}
  select(_kolom?: string, opsi?: { count?: string }) {
    if (opsi?.count) this.hitung = true;
    return this;
  }
  eq(k: string, v: unknown) {
    this.baris = this.baris.filter((r) => r[k] === v);
    return this;
  }
  neq(k: string, v: unknown) {
    this.baris = this.baris.filter((r) => r[k] !== v);
    return this;
  }
  in(k: string, v: unknown[]) {
    this.baris = this.baris.filter((r) => v.includes(r[k]));
    return this;
  }
  ilike(k: string, pola: string) {
    // Pola LIKE: % = apa saja, _ = satu karakter, \x = x harfiah.
    const isi = pola.replace(/\\(.)|(%)|(_)|([.*+?^${}()|[\]\\])/g, (_, harfiah: string, persen: string, garis: string, khusus: string) =>
      harfiah !== undefined ? harfiah.replace(/[.*+?^${}()|[\]\\%_]/g, "\\$&") : persen ? ".*" : garis ? "." : `\\${khusus}`,
    );
    const re = new RegExp(`^${isi}$`, "is");
    this.baris = this.baris.filter((r) => re.test(String(r[k] ?? "")));
    return this;
  }
  order(kolom: string, opsi?: { ascending?: boolean }) {
    this.urut.push({ kolom, naik: opsi?.ascending !== false });
    return this;
  }
  range(a: number, b: number) {
    this.jangkauan = [a, b];
    return this;
  }
  limit(n: number) {
    this.batas = n;
    return this;
  }
  private jalankan(): Hasil {
    const hasil = [...this.baris].sort((x, y) => {
      for (const { kolom, naik } of this.urut) {
        const c = String(x[kolom] ?? "").localeCompare(String(y[kolom] ?? ""));
        if (c !== 0) return naik ? c : -c;
      }
      return 0;
    });
    const count = this.hitung ? hasil.length : null;
    const [a, b] = this.jangkauan ?? [0, MAKS_BARIS - 1];
    if (this.hitung && a > 0 && a >= hasil.length) {
      return { data: null, error: { message: "Requested range not satisfiable", code: "PGRST103" }, count: null };
    }
    let potong = hasil.slice(a, Math.min(b + 1, a + MAKS_BARIS));
    if (this.batas !== null) potong = potong.slice(0, this.batas);
    return { data: potong, error: null, count };
  }
  maybeSingle() {
    const h = this.jalankan();
    return Promise.resolve({ data: h.data?.[0] ?? null, error: h.error });
  }
  then<A, B>(onfulfilled?: ((v: Hasil) => A | PromiseLike<A>) | null, onrejected?: ((r: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.jalankan()).then(onfulfilled, onrejected);
  }
}

/** Supabase Storage tiruan: kunci "bucket/path". */
export const penyimpanan = {
  berkas: new Map<string, Buffer>(),
  diminta: [] as string[],
  diunduh: [] as string[],
  gagalUnggah: false,
  /** Path yang gagal dihapus. */
  gagalHapus: new Set<string>(),
};

const storageTiruan = {
  from: (bucket: string) => ({
    createSignedUploadUrl: async (path: string) => {
      penyimpanan.diminta.push(`${bucket}/${path}`);
      return { data: { path, token: "token-uji", signedUrl: `http://storage.test/${bucket}/${path}?token=token-uji` }, error: null };
    },
    download: async (path: string) => {
      penyimpanan.diunduh.push(`${bucket}/${path}`);
      const isi = penyimpanan.berkas.get(`${bucket}/${path}`);
      return isi ? { data: new Blob([new Uint8Array(isi)]), error: null } : { data: null, error: { message: "Object not found" } };
    },
    upload: async (path: string, isi: Buffer) => {
      if (penyimpanan.gagalUnggah) return { data: null, error: { message: "gagal" } };
      penyimpanan.berkas.set(`${bucket}/${path}`, isi);
      return { data: { path }, error: null };
    },
    remove: async (paths: string[]) => {
      if (paths.some((p) => penyimpanan.gagalHapus.has(p))) return { data: null, error: { message: "gagal hapus" } };
      for (const p of paths) penyimpanan.berkas.delete(`${bucket}/${p}`);
      return { data: paths.map((name) => ({ name })), error: null };
    },
    createSignedUrls: async (paths: string[], detik: number) => ({
      data: paths.map((path) => ({ path, signedUrl: `http://storage.test/${bucket}/${path}?berlaku=${detik}`, error: null })),
      error: null,
    }),
  }),
};

export function resetDbTiruan() {
  penyimpanan.berkas.clear();
  penyimpanan.diminta = [];
  penyimpanan.diunduh = [];
  penyimpanan.gagalUnggah = false;
  penyimpanan.gagalHapus.clear();
  for (const k of Object.keys(db)) delete db[k];
  db.user_roles = [
    { user_id: ADMIN, role_type: "admin", status: "active" },
    { user_id: ADMIN_NONAKTIF, role_type: "admin", status: "inactive" },
    { user_id: SISWA, role_type: "student", status: "active" },
  ];
  for (const t of ["soal_bank", "soal_stimulus", "soal_impor_batch", "soal_topik", "subtes", "soal_tinjauan_log"]) db[t] = [];
  tulisLangsung.length = 0;
  rpc.panggilan = [];
  rpc.jawab = {};
  rpc.gagal = false;
}

/** Pasang tiruan ke supabaseServer; mengembalikan pembuat NextRequest bercookie session. */
export async function pasangDbTiruan() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  const sesi = await import("@/lib/auth/session");
  Object.defineProperty(supabaseServer, "storage", { value: storageTiruan, configurable: true });
  Object.assign(supabaseServer, {
    from: (tabel: string) => {
      db[tabel] ??= [];
      const tolak = (op: string) => () => {
        tulisLangsung.push(`${op} ${tabel}`);
        return Promise.resolve({ data: null, error: null });
      };
      return Object.assign(new Kueri(db[tabel]), { insert: tolak("insert"), update: tolak("update"), upsert: tolak("upsert"), delete: tolak("delete") });
    },
    rpc: (nama: string, args: Row) => {
      rpc.panggilan.push({ nama, args });
      const data = typeof rpc.jawab === "function" ? rpc.jawab(args, nama) : rpc.jawab;
      return Promise.resolve(rpc.gagal ? { data: null, error: { message: "boom" } } : { data, error: null });
    },
  });
  return (userId: string | null, role: "admin" | "student", method: string, body?: unknown) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (userId) headers.cookie = `${sesi.SESSION_COOKIE_NAME}=${sesi.createSessionToken({ userId, role })}`;
    return new NextRequest("http://localhost/api/uji", { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  };
}
