// PERINGATAN: File ini HANYA boleh diimport dari kode yang berjalan di server
// (API routes, Server Components, Server Actions) — misal app/api/**/route.ts.
// SUPABASE_SECRET_KEY punya akses penuh (bypass RLS), jadi JANGAN pernah
// import file ini dari "use client" component atau kode yang bisa ikut
// ter-bundle ke browser. Import "server-only" di bawah akan membuat build
// gagal kalau file ini ketarik ke client bundle.
import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseSecretKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseServer = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
