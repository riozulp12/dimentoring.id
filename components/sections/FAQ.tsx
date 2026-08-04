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
      "Dimentoring ga cuma online, kami juga tersedia untuk versi offline dengan mentor datang ke rumahmu, tetapi untuk saat ini Dimentoring offline baru tersedia untuk daerah Yogyakarta dan Kabupaten Banyumas dan sekitarnya.",
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
    <section className="flex w-full flex-col items-center gap-12 bg-white py-20 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)]">
      <div className="flex flex-col items-center gap-5 text-center">
        <h2 className="text-[40px] leading-[1.5] font-semibold tracking-[-0.8px] text-black">
          Pertanyaan yang Sering Ditanyakan Tentang{" "}
          <span className="text-[#081EEA]">Dimentoring?</span>
        </h2>
        <p className="text-2xl leading-[1.5] tracking-[-0.48px] text-[#7E7C7C]">
          Temukan jawaban cepat seputar program dan layanan Dimentoring tanpa
          perlu bingung lagi
        </p>
      </div>

      <div className="flex w-[1100px] max-w-full flex-col items-center gap-6">
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
                className="flex min-h-[70px] w-full items-center justify-between gap-5 px-8 py-5 text-left"
              >
                <span className="text-2xl leading-[1.5] font-semibold tracking-[-0.48px] text-black">
                  {item.question}
                </span>
                <Image
                  src="/icons/input-chevron-down.svg"
                  width={24}
                  height={24}
                  alt=""
                  className={`shrink-0 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isOpen ? (
                <p className="px-8 pb-6 text-xl leading-[1.5] tracking-[-0.4px] text-[#7E7C7C]">
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
