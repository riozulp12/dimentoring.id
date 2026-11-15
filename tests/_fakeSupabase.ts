/**
 * Supabase TIRUAN di memori untuk tes (bukan berkas tes — tidak didaftarkan di
 * skrip npm test). Mendukung select/insert/update/delete + filter eq/in/is/not,
 * maybeSingle, dan penggagalan per tabel ("tabel") atau per operasi ("tabel:op").
 * Semua tulisan dicatat di `log` supaya tes bisa memastikan APA yang ditulis/dihapus
 * (mis. diff tidak pernah menghapus yang tidak dilepas).
 *
 * Filter + mutasi dievaluasi sinkron saat di-await, meniru atomisitas satu statement SQL.
 */

export type Row = Record<string, unknown>;
export type Db = Record<string, Row[]>;
type Hasil = { data: Row[] | Row | null; error: { message: string } | null };
export type Op = "select" | "insert" | "update" | "delete";
export interface CatatanTulis {
  op: Exclude<Op, "select">;
  table: string;
  /** Baris yang disisipkan / baris yang terkena update / baris yang dihapus. */
  rows: Row[];
}

export type HasilRpc = { data: unknown; error: { message: string; code?: string } | null };

export function buatFakeSupabase(db: Db) {
  const gagal = new Set<string>();
  /** "tabel:op" -> mulai pemanggilan ke-N (1-based) semua pemanggilan berikutnya gagal. Untuk menggagalkan query ke-N saja. */
  const gagalMulaiKe = new Map<string, number>();
  const hitung = new Map<string, number>();
  const log: CatatanTulis[] = [];
  /** Pemanggilan rpc() — tes mendaftarkan handler yang meniru fungsi SQL-nya. */
  const rpcHandlers: Record<string, (args: Record<string, unknown>) => HasilRpc> = {};
  const rpcLog: { nama: string; args: Record<string, unknown> }[] = [];

  class FakeQuery implements PromiseLike<Hasil> {
    private filters: Array<(row: Row) => boolean> = [];
    private op: Op = "select";
    private values: Row | Row[] | null = null;
    private satuBaris = false;

    constructor(private table: string) {}

    select() {
      return this;
    }
    insert(values: Row | Row[]) {
      this.op = "insert";
      this.values = values;
      return this;
    }
    update(values: Row) {
      this.op = "update";
      this.values = values;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }
    is(column: string, value: null) {
      this.filters.push((row) => (row[column] ?? null) === value);
      return this;
    }
    not(column: string, _operator: string, value: unknown) {
      this.filters.push((row) => (row[column] ?? null) !== value);
      return this;
    }
    order() {
      return this;
    }
    maybeSingle() {
      this.satuBaris = true;
      return this;
    }
    single() {
      this.satuBaris = true;
      return this;
    }
    then<A, B>(onfulfilled?: ((value: Hasil) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve(this.jalankan()).then(onfulfilled, onrejected);
    }

    private jalankan(): Hasil {
      const rows = (db[this.table] ??= []);
      const kunciOp = `${this.table}:${this.op}`;
      const ke = (hitung.get(kunciOp) ?? 0) + 1;
      hitung.set(kunciOp, ke);
      if (gagal.has(this.table) || gagal.has(kunciOp) || (gagalMulaiKe.has(kunciOp) && ke >= (gagalMulaiKe.get(kunciOp) as number))) {
        return { data: null, error: { message: "galat tiruan" } };
      }
      if (this.op === "insert") {
        const baru = (Array.isArray(this.values) ? this.values : [this.values as Row]).map((r) => ({ ...r }));
        // Tabel dengan kunci id otomatis (gen_random_uuid) — dipakai route yang membaca id hasil insert.
        if (this.table === "kelas") for (const r of baru) r.id ??= `kelas-baru-${rows.length + 1}`;
        rows.push(...baru);
        log.push({ op: "insert", table: this.table, rows: baru });
        return { data: this.satuBaris ? (baru[0] ?? null) : baru, error: null };
      }
      const cocok = rows.filter((row) => this.filters.every((f) => f(row)));
      if (this.op === "update") {
        for (const row of cocok) Object.assign(row, this.values as Row);
        log.push({ op: "update", table: this.table, rows: cocok.map((r) => ({ ...r })) });
      } else if (this.op === "delete") {
        log.push({ op: "delete", table: this.table, rows: cocok.map((r) => ({ ...r })) });
        for (const row of cocok) rows.splice(rows.indexOf(row), 1);
      }
      return { data: this.satuBaris ? (cocok[0] ?? null) : cocok, error: null };
    }
  }

  return {
    from: (table: string) => new FakeQuery(table),
    rpc: (nama: string, args: Record<string, unknown>): Promise<HasilRpc> => {
      rpcLog.push({ nama, args });
      const handler = rpcHandlers[nama];
      return Promise.resolve(handler ? handler(args) : { data: null, error: { message: `Could not find the function public.${nama}`, code: "PGRST202" } });
    },
    rpcHandlers,
    rpcLog,
    gagal,
    gagalMulaiKe,
    log,
    tulisan: (op?: CatatanTulis["op"], table?: string) => log.filter((l) => (!op || l.op === op) && (!table || l.table === table)),
  };
}
