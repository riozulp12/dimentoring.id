import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync("./.env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const toInsert = ["Jawa Barat", "Jawa Timur"];

for (const nama of toInsert) {
  const { data: existing } = await supabase.from("provinsi").select("id").eq("nama", nama).maybeSingle();
  if (existing) {
    console.log(`SKIP (sudah ada): ${nama} -> ${existing.id}`);
    continue;
  }
  const { data, error } = await supabase.from("provinsi").insert({ nama }).select("id").single();
  if (error) {
    console.log(`ERROR insert ${nama}:`, error.message);
  } else {
    console.log(`INSERTED: ${nama} -> ${data.id}`);
  }
}

const { data: all } = await supabase.from("provinsi").select("*").order("nama");
console.log("\nSemua provinsi sekarang:", JSON.stringify(all, null, 2));
