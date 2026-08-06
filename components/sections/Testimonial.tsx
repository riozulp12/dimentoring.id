import Mascot, { type MascotVariant } from "@/components/ui/Mascot";
import type { CSSProperties } from "react";

const ALL_MASCOTS: MascotVariant[] = [
  "Listen",
  "Guidance",
  "Sing",
  "Happy",
  "Happy1",
  "Happy With Univ",
  "Sad",
  "Angry",
  "Plenger",
  "Confuse",
  "Happy2",
  "Happy Graduate",
  "Teaching",
];

function pickRandomMascots(count: number): MascotVariant[] {
  return [...ALL_MASCOTS].sort(() => Math.random() - 0.5).slice(0, count);
}

interface TestimonialItem {
  quote: string;
  name: string;
  role: string;
}

// Placeholder testimonials — replace with real Dimentorian stories
const TESTIMONIALS: TestimonialItem[] = [
  {
    quote:
      "“Lorem ipsum metus et sollicitudin etiam id pharetra, Lorem ipsum metus et sollicitudin”",
    name: "~ N***",
    role: "Ilmu Komputer UI",
  },
  {
    quote:
      "“Lorem ipsum metus et sollicitudin etiam id pharetra, Lorem ipsum metus et sollicitudin”",
    name: "~ N***",
    role: "Ilmu Komputer UI",
  },
  {
    quote:
      "“Lorem ipsum metus et sollicitudin etiam id pharetra, Lorem ipsum metus et sollicitudin”",
    name: "~ N***",
    role: "Ilmu Komputer UI",
  },
  {
    quote:
      "“Lorem ipsum metus et sollicitudin etiam id pharetra, Lorem ipsum metus et sollicitudin”",
    name: "~ N***",
    role: "Ilmu Komputer UI",
  },
];

const MARQUEE_STYLE = {
  "--marquee-duration": "34s",
  "--marquee-distance": "-33.3334%",
} as CSSProperties;

export default function Testimonial() {
  const mascots = pickRandomMascots(TESTIMONIALS.length);
  const loopTestimonials = [...TESTIMONIALS, ...TESTIMONIALS, ...TESTIMONIALS];

  return (
    <section className="flex w-full flex-col items-center gap-8 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:gap-12 lg:px-20 lg:py-16">
      <div className="flex flex-col items-center gap-3 text-center sm:gap-5">
        <h4 className="text-2xl leading-[1.5] font-semibold tracking-[-0.48px] text-black sm:text-[32px] sm:tracking-[-0.64px] lg:text-[40px] lg:tracking-[-0.8px]">
          Kisah Sukses <span className="text-[#081EEA]">Dimentorian</span>
        </h4>
        <p className="text-lg leading-[1.5] tracking-[-0.36px] text-[#7E7C7C]">
          Mereka aja bisa, kalian pasti lebih bisa
        </p>
      </div>

      <div className="w-full overflow-hidden">
        <div
          className="animate-marquee flex w-max items-stretch gap-6 sm:gap-10 lg:gap-[67px]"
          style={MARQUEE_STYLE}
        >
          {loopTestimonials.map((item, index) => (
            <div
              key={index}
              className="relative min-h-[220px] w-[280px] shrink-0 overflow-hidden rounded-[20px] border border-[#E3E3E3] bg-white sm:min-h-[240px] sm:w-[420px] lg:h-[254px] lg:w-[622px]"
            >
              <div className="flex h-full flex-col justify-center gap-2.5 px-5 py-4 sm:px-6 sm:py-3">
                <p className="pr-16 text-lg leading-[1.5] tracking-[-0.36px] text-black sm:pr-24 lg:pr-0">
                  {item.quote}
                </p>
                <div className="flex flex-col gap-2 sm:gap-2.5">
                  <p className="text-lg leading-[1.5] font-medium tracking-[-0.36px] text-black">
                    {item.name}
                  </p>
                  <p className="text-lg leading-[1.5] tracking-[-0.36px] text-black">
                    {item.role}
                  </p>
                </div>
              </div>
              <Mascot
                variant={mascots[index % mascots.length]}
                className="pointer-events-none absolute right-3 -bottom-3 h-[100px] w-auto select-none sm:right-4 sm:-bottom-4 sm:h-[140px] lg:right-5 lg:-bottom-6 lg:h-[180px]"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
