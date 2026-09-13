// Setup SEKALI JALAN — buat Supabase Storage bucket "mentor-landing" kalau
// belum ada (dipakai app/api/admin/mentor-landing/route.ts). Idempotent:
// aman dijalankan ulang, tidak error kalau bucket sudah ada.
//
// Jalankan: node --env-file=.env.local scripts/setup-mentor-landing-bucket.mjs

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di env.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET_NAME = "mentor-landing";

const { data: buckets, error: listError } = await supabase.storage.listBuckets();
if (listError) {
  console.error("Gagal list bucket:", listError);
  process.exit(1);
}

if (buckets.some((b) => b.name === BUCKET_NAME)) {
  console.log(`Bucket "${BUCKET_NAME}" sudah ada, tidak perlu dibuat ulang.`);
  process.exit(0);
}

const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
  public: true,
  fileSizeLimit: "8MB",
  allowedMimeTypes: ["image/png"],
});

if (createError) {
  console.error("Gagal membuat bucket:", createError);
  process.exit(1);
}

console.log(`Bucket "${BUCKET_NAME}" berhasil dibuat (public, PNG-only, maks 8MB).`);
