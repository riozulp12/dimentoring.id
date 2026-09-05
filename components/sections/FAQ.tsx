"use client";

import Image from "next/image";
import { useState } from "react";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: "Dimentoring cuma online?",
    answer:
      "Dimentoring ga cuma online, kami juga tersedia untuk versi offline dengan mentor datang ke rumahmu, tetapi untuk saat ini Dimentoring offline baru tersedia untuk daerah Yogyakarta dan sekitarnya.",
  },
  {
    question: "Hasil prediksi peluang dijamin akurat ga?",
    answer:
      "Hasil prediksi dihitung berdasarkan data dari website resmi snpmb.id. Untuk hasil akhirnya balik lagi ke diri kalian masing-masing, makanya ayo belajar bersama Dimentoring.",
  },
  {
    question: "Kalo cuma mau konsultasi bayar ga?",
    answer:
      "Untuk konsultasi pertama kita free selama 1 hari dan jika ingin lanjut, silahkan pesan untuk paket konsultasi kita.",
  },
];

export default function FAQ() {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  const toggleItem = (index: number) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <section
      id="faq"
      className="flex w-full scroll-mt-24 flex-col items-center gap-8 bg-white px-5 py-10 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:gap-10 sm:px-8 sm:py-14 md:px-12 lg:gap-12 lg:px-0 lg:py-20 min-[1440px]:scroll-mt-32"
    >
      <div className="flex flex-col items-center gap-3 text-center sm:gap-5">
        <h2 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl">
          Pertanyaan yang Sering Ditanyakan Tentang{" "}
          <span className="text-[#081EEA]">Dimentoring?</span>
        </h2>
        <p className="text-base leading-[1.5] tracking-[-0.36px] text-[#7E7C7C]">
          Temukan jawaban cepat seputar program dan layanan Dimentoring tanpa
          perlu bingung lagi
        </p>
      </div>

      <div className="flex w-[1100px] max-w-full flex-col items-center gap-4 sm:gap-6">
        {FAQS.map((item, index) => {
          const isOpen = openItems.has(index);
          return (
            <div
              key={item.question}
              className="w-full rounded-[20px] border border-[#AFAFAF] bg-white shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)]"
            >
              <button
                type="button"
                onClick={() => toggleItem(index)}
                aria-expanded={isOpen}
                className="flex min-h-[56px] w-full items-center justify-between gap-4 px-5 py-4 text-left sm:gap-5 sm:px-6 sm:py-5 lg:min-h-[70px] lg:px-8"
              >
                <span className="text-base leading-[1.5] font-semibold tracking-[-0.32px] text-black sm:text-lg sm:tracking-[-0.4px] lg:text-xl lg:tracking-[-0.48px]">
                  {item.question}
                </span>
                <Image
                  src="/icons/input-chevron-down.svg"
                  width={24}
                  height={24}
                  alt=""
                  className={`h-5 w-5 shrink-0 transition-transform sm:h-6 sm:w-6 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isOpen ? (
                <p className="px-5 pb-4 text-base leading-[1.5] tracking-[-0.36px] text-[#7E7C7C] sm:px-6 lg:px-8 lg:pb-6">
                  {item.answer}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
