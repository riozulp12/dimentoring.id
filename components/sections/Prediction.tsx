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
    <section className="flex w-full flex-col items-center gap-12 px-[120px] py-16">
      <div className="flex flex-col items-center gap-5 text-center">
        <h2 className="text-[40px] leading-[1.5] font-semibold tracking-[-0.8px] text-black">
          Lihat Keketatan Jurusan dan PTN Pilihanmu
        </h2>
        <p className="text-2xl leading-[1.5] tracking-[-0.48px] text-[#7E7C7C]">
          Keketatan ini dihitung berdasarkan data dari snpmb
        </p>
      </div>

      <div className="flex w-full flex-col gap-8">
        <div className="flex flex-col gap-5">
          <p className="text-[32px] leading-[1.5] font-medium tracking-[-0.64px] text-black">
            Pilih Jalur
          </p>
          <div className="flex w-full items-center gap-6">
            {JALUR_OPTIONS.map((option) => (
              <Button
                key={option}
                variant={jalur === option ? "primary" : "secondary"}
                size="md"
                className="w-[200px]"
                onClick={() => setJalur(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-8 rounded-[32px] border border-[#CAC9C9] bg-white p-16 shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)]">
          <div className="flex w-full items-center gap-16">
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
          <Button variant="primary" size="lg" className="w-[300px]">
            Cek Keketetan
          </Button>
        </div>
      </div>
    </section>
  );
}
