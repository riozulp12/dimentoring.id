"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { getMetaPixelId, isPathTrackable, trackPageView } from "@/lib/analytics/metaPixel";

/**
 * Base code Meta Pixel + PageView di tiap perpindahan halaman (SPA).
 * Env NEXT_PUBLIC_META_PIXEL_ID kosong -> tidak merender apa pun.
 * PageView pertama dikirim dari snippet (kalau path boleh dilacak); perpindahan
 * berikutnya dari efek di bawah. Tanpa advanced matching (tidak ada data user).
 */
export default function MetaPixel() {
  const pixelId = getMetaPixelId();
  const pathname = usePathname();
  const pertama = useRef(true);

  useEffect(() => {
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    trackPageView(pathname);
  }, [pathname]);

  if (!pixelId) return null;

  const pageViewAwal = isPathTrackable(pathname) ? "fbq('track','PageView');" : "";

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');${pageViewAwal}`}
    </Script>
  );
}
