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
    <section className="flex w-full flex-col items-center gap-8 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:gap-12 lg:px-[120px] lg:py-16">
      <div className="flex w-[643px] max-w-full flex-col items-center gap-3 text-center sm:gap-5">
        <h4 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl">
          Kenapa Harus <span className="text-[#081EEA]">Dimentoring</span>?
        </h4>
        <p className="text-base leading-[1.5] tracking-[-0.36px] text-[#7E7C7C]">
          Belajar nyaman, efektif, dan sesuai kebutuhan setiap siswa
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:gap-6 min-[1440px]:flex min-[1440px]:items-stretch min-[1440px]:gap-8">
        {WHY_ITEMS.map((item) => (
          <div
            key={item.title}
            className="flex flex-1 flex-col items-start gap-5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-[18px] shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] lg:gap-8"
          >
            <div className="flex items-center rounded-[100px] bg-white p-3 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:p-4">
              <Image
                src={item.icon}
                width={28}
                height={28}
                alt=""
                className="h-7 w-7"
              />
            </div>
            <div className="flex flex-col gap-3 sm:gap-5">
              <p className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black">
                {item.title}
              </p>
              <p className="text-base leading-[1.5] tracking-[-0.36px] text-black">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
