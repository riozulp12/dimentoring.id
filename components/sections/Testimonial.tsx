import Mascot, { type MascotVariant } from "@/components/ui/Mascot";

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

export default function Testimonial() {
  const mascots = pickRandomMascots(TESTIMONIALS.length);

  return (
    <section className="flex w-full flex-col items-center gap-12 px-20 py-16">
      <div className="flex flex-col items-center gap-5 text-center">
        <h2 className="text-[40px] leading-[1.5] font-semibold tracking-[-0.8px] text-black">
          Kisah Sukses <span className="text-[#081EEA]">Dimentorian</span>
        </h2>
        <p className="text-2xl leading-[1.5] tracking-[-0.48px] text-[#7E7C7C]">
          Mereka aja bisa, kalian pasti lebih bisa
        </p>
      </div>

      <div className="flex w-full items-stretch gap-[67px] overflow-x-auto">
        {TESTIMONIALS.map((item, index) => (
          <div
            key={index}
            className="relative h-[254px] w-[622px] shrink-0 overflow-hidden rounded-[20px] border border-[#E3E3E3] bg-white"
          >
            <div className="flex h-full flex-col justify-center gap-2.5 px-6 py-3">
              <p className="text-2xl leading-[1.5] tracking-[-0.48px] text-black">
                {item.quote}
              </p>
              <div className="flex flex-col gap-2.5">
                <p className="text-[28px] leading-[1.5] font-medium tracking-[-0.56px] text-black">
                  {item.name}
                </p>
                <p className="text-2xl leading-[1.5] tracking-[-0.48px] text-black">
                  {item.role}
                </p>
              </div>
            </div>
            <Mascot
              variant={mascots[index]}
              className="pointer-events-none absolute right-5 -bottom-6 h-[180px] w-auto select-none"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
