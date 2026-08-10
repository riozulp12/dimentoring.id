"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Mascot from "@/components/ui/Mascot";

const RESEND_SECONDS = 60;
const GMAIL_INBOX_URL = "https://mail.google.com/mail/u/0/#inbox";

function maskEmail(raw: string) {
  if (!raw.includes("@")) return "xxxx@xxxx.com";
  const [local, domain] = raw.split("@");
  return `${local.slice(0, 2) || local}xxxx@${domain}`;
}

function formatCountdown(total: number) {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function VerifikasiClient({ email }: { email: string }) {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  function handleResend() {
    if (secondsLeft > 0) return;
    setSecondsLeft(RESEND_SECONDS);
  }

  return (
    <main className="flex min-h-dvh w-full items-center justify-center overflow-x-hidden bg-[#F9FAFF] px-5 py-10 sm:px-8">
      <div className="flex w-full max-w-[640px] flex-col items-center">
        <div className="relative z-0 -mb-10 flex h-[180px] w-[180px] shrink-0 items-center justify-center sm:-mb-12 sm:h-[220px] sm:w-[220px] lg:-mb-14 lg:h-[260px] lg:w-[260px]">
          <div className="absolute inset-0 rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[10%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[20%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />

          <Mascot
            variant="Listen"
            alt="Maskot Dimentoring menunggu verifikasi"
            className="relative h-[70%] w-auto"
            priority
          />

          <div className="absolute top-[26%] right-[4%] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0px_2px_6px_0px_rgba(0,0,0,0.15)] sm:h-12 sm:w-12 lg:h-14 lg:w-14">
            <img
              src="/icons/footer-gmail.svg"
              alt=""
              className="h-7 w-7 sm:h-9 sm:w-9 lg:h-10 lg:w-10"
            />
          </div>
        </div>

        <div className="relative z-10 flex w-full flex-col items-center gap-4 rounded-[24px] border-[0.8px] border-[#E3E3E3] bg-white px-6 py-8 text-center shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)] sm:gap-5 sm:rounded-[32px] sm:px-10 sm:py-9">
          <span className="inline-flex items-center rounded-full border border-[#CAC9C9] bg-[#F9F9F9] px-4 py-1.5 text-sm leading-[1.5] font-medium tracking-[-0.28px] text-[#081EEA] sm:text-base">
            Satu Langkah Lagi
          </span>

          <h1 className="text-2xl leading-[1.5] font-semibold tracking-[-0.02em] text-black sm:text-3xl lg:text-4xl">
            Cek Gmail Kamu
          </h1>

          <div className="flex w-full flex-col items-center gap-2 sm:gap-3">
            <p className="text-sm leading-[1.5] tracking-[-0.28px] text-[#7E7C7C] sm:text-base lg:text-lg">
              Kami sudah kirim link verifikasi ke
            </p>
            <p className="text-base leading-[1.5] font-medium tracking-[-0.32px] text-black sm:text-lg lg:text-xl">
              {maskEmail(email)}
            </p>
          </div>

          <div className="flex w-full flex-col items-stretch gap-3 sm:gap-4">
            <a href={GMAIL_INBOX_URL} target="_blank" rel="noopener noreferrer" className="w-full">
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="flex w-full items-center justify-center gap-2 text-[20px]!"
              >
                <img src="/icons/footer-gmail.svg" alt="" className="h-5 w-5 sm:h-6 sm:w-6" />
                Buka Gmail
              </Button>
            </a>

            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={secondsLeft > 0}
              onClick={handleResend}
              className="flex w-full items-center justify-center gap-2 text-[20px]!"
            >
              Kirim Ulang Link
              {secondsLeft > 0 ? (
                <span className="text-[#7E7C7C]">({formatCountdown(secondsLeft)})</span>
              ) : null}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
