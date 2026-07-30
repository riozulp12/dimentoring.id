import { Fragment } from "react";
import Mascot, { type MascotVariant } from "@/components/ui/Mascot";

interface ValueItem {
  count: number;
  label: string;
  mascot: MascotVariant;
}

const VALUES: ValueItem[] = [
  { count: 100, label: "Siswa Hebat", mascot: "Happy Graduate" },
  { count: 30, label: "Mentor Keren", mascot: "Happy" },
  { count: 5, label: "Event", mascot: "Listen" },
  { count: 7, label: "Program Akademik", mascot: "Happy1" },
];

function formatCount(count: number) {
  return `${count}+`;
}

export default function Value() {
  return (
    <section className="flex w-full items-center justify-between px-[120px] py-16">
      {VALUES.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 && (
            <div className="h-[100px] w-0 border-l-2 border-[#E3E3E3]" />
          )}
          <div className="relative flex h-[132px] w-[300px] flex-col items-center justify-center rounded-[20px] border-[0.8px] border-[#CAC9C9] bg-white">
            <p className="text-[32px] leading-[1.5] font-medium tracking-[-0.64px] text-[#081EEA]">
              {formatCount(item.count)}
            </p>
            <p className="text-center text-2xl leading-[1.5] tracking-[-0.48px] text-black">
              {item.label}
            </p>
            <Mascot
              variant={item.mascot}
              className="pointer-events-none absolute right-[-15px] bottom-0 h-20 w-auto select-none"
            />
          </div>
        </Fragment>
      ))}
    </section>
  );
}
