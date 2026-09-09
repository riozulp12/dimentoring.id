"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar, { type NavItemKey } from "@/components/ui/Navbar";
import type { NavbarSessionProps } from "@/lib/dashboard/getNavbarProps";
import CampaignPopup from "./CampaignPopup";
import CampaignBanner from "./CampaignBanner";
import type { ActiveLandingCampaign } from "@/lib/landing/getActiveLandingCampaign";

/**
 * Orkestrator alur bertahap popup-lalu-banner landing page (PRD Bagian 13
 * landing_campaign — BARU). Menggantikan <Navbar/> langsung di app/page.tsx
 * SUPAYA CampaignBanner (kalau step-nya "banner") bisa menggeser Navbar turun
 * lewat topOffsetPx — satu-satunya tempat popup & banner campaign dirender,
 * jangan ditempel manual di komponen lain.
 *
 * STATE MACHINE (sessionStorage, PER TAB/SESI — reset begitu tab/incognito
 * baru dibuka):
 * - "loading": render awal SSR/sebelum useEffect jalan — TIDAK render popup
 *   maupun banner (mencegah flash salah & hydration mismatch, sessionStorage
 *   cuma bisa dibaca di client).
 * - "popup": campaign_popup_closed BELUM ada → popup tampil, banner TIDAK.
 * - "banner": campaign_popup_closed SUDAH true DAN campaign_banner_closed
 *   BELUM ada → banner tampil, popup TIDAK (mereka TIDAK PERNAH bersamaan).
 * - "hidden": campaign_banner_closed SUDAH true (atau tidak ada campaign
 *   valid sama sekali) → keduanya tidak tampil, sisa sesi ini.
 */

const POPUP_CLOSED_KEY = "campaign_popup_closed";
const BANNER_CLOSED_KEY = "campaign_banner_closed";

type Step = "loading" | "popup" | "banner" | "hidden";

function readSessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "true";
  } catch {
    // sessionStorage tidak bisa diakses (mis. private mode ketat) — anggap
    // belum pernah ditutup, popup tetap tampil tiap load (fallback aman,
    // bukan nge-block popup selamanya).
    return false;
  }
}

function writeSessionFlag(key: string) {
  try {
    sessionStorage.setItem(key, "true");
  } catch {
    // Diamkan — kalau gagal ditulis, popup/banner cuma akan muncul lagi di
    // load berikutnya, bukan error yang perlu diblokir ke user.
  }
}

export default function CampaignChrome({
  campaign,
  activeItem,
  navbarProps,
}: {
  campaign: ActiveLandingCampaign | null;
  activeItem: NavItemKey;
  navbarProps: NavbarSessionProps;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [bannerHeight, setBannerHeight] = useState(0);

  useEffect(() => {
    if (!campaign) {
      setStep("hidden");
      return;
    }
    if (readSessionFlag(BANNER_CLOSED_KEY)) {
      setStep("hidden");
      return;
    }
    setStep(readSessionFlag(POPUP_CLOSED_KEY) ? "banner" : "popup");
  }, [campaign]);

  const closePopup = useCallback(() => {
    writeSessionFlag(POPUP_CLOSED_KEY);
    setStep("banner");
  }, []);

  const closeBanner = useCallback(() => {
    writeSessionFlag(BANNER_CLOSED_KEY);
    setBannerHeight(0);
    setStep("hidden");
  }, []);

  if (!campaign) {
    return <Navbar activeItem={activeItem} {...navbarProps} />;
  }

  return (
    <>
      {step === "banner" ? (
        <CampaignBanner
          judul={campaign.judul}
          linkTujuan={campaign.linkTujuan}
          onClose={closeBanner}
          onHeightChange={setBannerHeight}
        />
      ) : null}
      <Navbar activeItem={activeItem} {...navbarProps} topOffsetPx={step === "banner" ? bannerHeight : 0} />
      {step === "popup" ? (
        <CampaignPopup judul={campaign.judul} linkTujuan={campaign.linkTujuan} onClose={closePopup} />
      ) : null}
    </>
  );
}
