"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";

type Jalur = "SNBP" | "SNBT";

const JALUR_OPTIONS: Jalur[] = ["SNBP", "SNBT"];

// Placeholder options — to be replaced with live data from https://snpmb.id/
const UNIVERSITY_OPTIONS = [
  { label: "Universitas Indonesia", value: "ui" },
  { label: "Institut Teknologi Bandung", value: "itb" },
  { label: "Universitas Gadjah Mada", value: "ugm" },
];

const MAJOR_OPTIONS = [
  { label: "Teknik Informatika", value: "informatika" },
  { label: "Kedokteran", value: "kedokteran" },
  { label: "Manajemen", value: "manajemen" },
];

export default function Prediction() {
  const [jalur, setJalur] = useState<Jalur>("SNBP");

  return (
    <section className="flex w-full flex-col items-center gap-8 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:gap-12 lg:px-[120px] lg:py-16">
      <div className="flex flex-col items-center gap-3 text-center sm:gap-5">
        <h4 className="text-2xl leading-[1.5] font-semibold tracking-[-0.48px] text-black sm:text-[32px] sm:tracking-[-0.64px] lg:text-[40px] lg:tracking-[-0.8px]">
          Lihat Keketatan Jurusan dan PTN Pilihanmu
        </h4>
        <p className="text-lg leading-[1.5] tracking-[-0.36px] text-[#7E7C7C]">
          Keketatan ini dihitung berdasarkan data dari snpmb
        </p>
      </div>

      <div className="flex w-full flex-col gap-6 lg:gap-8">
        <div className="flex flex-col gap-3 sm:gap-5">
          <p className="text-lg leading-[1.5] font-medium tracking-[-0.36px] text-black">
            Pilih Jalur
          </p>
          <div className="flex w-full items-center gap-3 sm:gap-6">
            {JALUR_OPTIONS.map((option) => (
              <Button
                key={option}
                variant={jalur === option ? "primary" : "secondary"}
                size="md"
                className="w-full flex-1 sm:w-[200px] sm:flex-none"
                onClick={() => setJalur(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-6 rounded-[20px] border border-[#CAC9C9] bg-white p-6 shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)] sm:rounded-[24px] sm:p-10 lg:gap-8 lg:rounded-[32px] lg:p-16">
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:gap-8 lg:gap-16">
            <InputField
              type="dropdown"
              placeholder="Pilih Universitas"
              options={UNIVERSITY_OPTIONS}
              className="flex-1 shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)]"
            />
            <InputField
              type="dropdown"
              placeholder="Pilih Jurusan"
              options={MAJOR_OPTIONS}
              className="flex-1 shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)]"
            />
          </div>
          <Button variant="primary" size="lg" className="w-full sm:w-[300px]">
            Cek Keketetan
          </Button>
        </div>
      </div>
    </section>
  );
}
