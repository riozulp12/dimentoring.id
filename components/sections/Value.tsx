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
    <section className="grid w-full grid-cols-2 gap-4 px-5 py-10 sm:gap-6 sm:px-8 sm:py-12 md:grid-cols-4 md:px-12 lg:gap-6 lg:px-16 lg:py-14 min-[1440px]:flex min-[1440px]:items-center min-[1440px]:justify-between min-[1440px]:gap-0 min-[1440px]:px-[120px] min-[1440px]:py-16">
      {VALUES.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 && (
            <div className="hidden h-[100px] w-0 border-l-2 border-[#E3E3E3] min-[1440px]:block" />
          )}
          <div className="relative flex h-28 w-full shrink-0 flex-col items-center justify-center gap-0.5 rounded-[16px] border-[0.8px] border-[#CAC9C9] bg-white px-3 sm:h-32 sm:rounded-[20px] lg:h-28 min-[1440px]:h-[132px] min-[1440px]:!w-[300px]">
            <p className="w-full min-w-0 text-center text-2xl leading-[1.5] font-semibold tracking-[-0.36px] text-[#081EEA] sm:text-[28px] lg:text-[32px]">
              {formatCount(item.count)}
            </p>
            <p className="w-full min-w-0 text-center text-lg leading-[1.5] tracking-[-0.36px] text-black">
              {item.label}
            </p>
            <Mascot
              variant={item.mascot}
              className="pointer-events-none absolute right-[-6px] bottom-0 h-9 w-auto select-none sm:h-11 min-[1440px]:right-[-15px] min-[1440px]:h-20"
            />
          </div>
        </Fragment>
      ))}
    </section>
  );
}
