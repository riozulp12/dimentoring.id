import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Halaman perantara OAuth Google — `code` di URL cuma sekali pakai
        // (PKCE), jadi respons ini tidak boleh pernah kena cache CDN/browser.
        // Kalau ke-cache, reload/navigasi ulang bisa balik ke `code` LAMA yang
        // sudah dipakai, memicu "invalid flow state" dari server Supabase.
        source: "/auth/callback",
        headers: [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate" }],
      },
    ];
  },
  images: {
    // Avatar foto (app/api/profil/avatar/route.ts) disimpan di Supabase Storage
    // bucket "avatars" (public) dan dirender lewat next/image di components/ui/Avatar.tsx
    // — next/image menolak domain eksternal yang belum di-allowlist di sini.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
