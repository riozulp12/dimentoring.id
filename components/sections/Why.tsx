import Image from "next/image";

interface WhyItem {
  icon: string;
  title: string;
  description: string;
}

const WHY_ITEMS: WhyItem[] = [
  {
    icon: "/icons/why-fleksibel.svg",
    title: "Fleksibel",
    description:
      "Atur sendiri jadwal belajarmu, cocok untuk siswa super sibuk.",
  },
  {
    icon: "/icons/why-mentor-berkualitas.svg",
    title: "Mentor Berkualitas",
    description:
      "Dibimbing mentor berpengalaman yang sabar, suportif, dan berprestasi.",
  },
  {
    icon: "/icons/why-personalized-learning.svg",
    title: "Personalized Learning",
    description:
      "Setiap anak unik, kami sesuaikan gaya belajar sesuai karaktermu.",
  },
  {
    icon: "/icons/why-berlanjut.svg",
    title: "Berlanjut Sampai Kuliah",
    description:
      "Mentoring berlanjut sampai kuliah berupa pemberian informasi beasiswa, dll",
  },
];

export default function Why() {
  return (
    <section className="flex w-full flex-col items-center gap-12 px-[120px] py-16">
      <div className="flex w-[643px] max-w-full flex-col items-center gap-5 text-center">
        <h2 className="text-[40px] leading-[1.5] font-semibold tracking-[-0.8px] text-black">
          Kenapa Harus <span className="text-[#081EEA]">Dimentoring</span>?
        </h2>
        <p className="text-2xl leading-[1.5] tracking-[-0.48px] text-[#7E7C7C]">
          Belajar nyaman, efektif, dan sesuai kebutuhan setiap siswa
        </p>
      </div>

      <div className="flex w-full items-stretch gap-8">
        {WHY_ITEMS.map((item) => (
          <div
            key={item.title}
            className="flex flex-1 flex-col items-start gap-8 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-[18px] shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)]"
          >
            <div className="flex items-center rounded-[100px] bg-white p-4 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)]">
              <Image src={item.icon} width={64} height={64} alt="" />
            </div>
            <div className="flex flex-col gap-5">
              <p className="text-[28px] leading-[1.5] font-semibold tracking-[-0.56px] text-black">
                {item.title}
              </p>
              <p className="text-2xl leading-[1.5] tracking-[-0.48px] text-black">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
