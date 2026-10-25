/**
 * Pengaman READ-ONLY: fetch untuk klien Supabase yang menolak semua method
 * selain GET/HEAD. supabase-js memakai GET untuk select dan HEAD untuk
 * count — insert/update/upsert/delete/rpc (POST/PATCH/DELETE) gagal di sini
 * sebelum request dikirim.
 */
export const METHOD_DIIZINKAN = ["GET", "HEAD"] as const;

export function buatFetchHanyaBaca(fetchAsli: typeof fetch = fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!(METHOD_DIIZINKAN as readonly string[]).includes(method)) {
      throw new Error(`DITOLAK (read-only): request ${method} tidak diizinkan.`);
    }
    return fetchAsli(input, init);
  }) as typeof fetch;
}

/** Project ref dari URL Supabase (https://<ref>.supabase.co). */
export function projectRef(url: string): string {
  return new URL(url).hostname.split(".")[0];
}

/** Parse isi file .env sederhana (KEY=VALUE, kutip dibuang). */
export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}
