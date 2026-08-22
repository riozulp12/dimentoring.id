import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
