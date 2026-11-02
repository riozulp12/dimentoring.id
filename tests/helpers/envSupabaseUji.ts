/**
 * Impor PERTAMA di tes yang memuat modul server secara statis: klien Supabase
 * (lib/supabase/server.ts) membaca env saat modul dimuat. Nilainya palsu, tidak
 * pernah menyambung ke database.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-key";
process.env.SESSION_SECRET ??= "test-session-secret";
export {};
