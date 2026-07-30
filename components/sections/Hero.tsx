import Image from "next/image";
import Button from "@/components/ui/Button";

const AVATARS = [
  "/images/hero-avatar-1.png",
  "/images/hero-avatar-2.png",
  "/images/hero-avatar-3.png",
  "/images/hero-avatar-4.png",
  "/images/hero-avatar-5.png",
];

export default function Hero() {
  return (
    <section className="w-full bg-gradient-to-b from-[#E7EAFF] to-[#F7F8FF] px-20 py-[72px]">
      <div className="flex w-full items-start justify-between gap-16">
        <div className="flex flex-col gap-20">
          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-5">
              <span className="inline-flex w-fit items-center rounded-[20px] border-[0.8px] border-[#CAC9C9] bg-[#F9F9F9] px-8 py-2.5 text-lg leading-[1.5] tracking-[-0.36px] text-[#081EEA]">
                #BertumbuhBersama
              </span>
              <h1 className="max-w-[934px] text-[64px] font-semibold leading-[1.5] tracking-[-1.28px] text-black">
                Setiap Siswa Punya{" "}
                <span className="text-[#081EEA]">Perjalanan Belajar</span> yang
                Berbeda
              </h1>
              <p className="w-full text-2xl leading-[1.5] tracking-[-0.48px] text-black">
                Mulai dari awal menyusun strategi, mempersiapkan menghadapi SNBT
                dan Ujian Mandiri sampai dengan masuk ke perkuliahan,
                Dimentoring hadir sebagai mentor dalam setiap langkahmu
              </p>
            </div>

            <div className="flex w-full gap-8">
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                style={{ padding: "20px 32px" }}
              >
                Cek Peluang Masuk PTN mu
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                style={{ padding: "20px 32px" }}
              >
                Konsultasi
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center">
              {AVATARS.map((src, index) => (
                <Image
                  key={src}
                  src={src}
                  width={56}
                  height={56}
                  alt=""
                  className={[
                    "rounded-full object-cover",
                    index > 0 ? "-ml-6" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-[28px] font-medium leading-[1.5] tracking-[-0.56px] text-black">
                100+ Siswa
              </p>
              <p className="w-[382px] text-lg leading-[1.5] tracking-[-0.36px] text-black">
                Lebih dari 100 siswa telah belajar dengan kami dan mendapatkan
                PTN impiannya
              </p>
            </div>
          </div>
        </div>

        <Image
          src="/images/hero-illustration.png"
          width={716}
          height={790}
          alt=""
          className="h-auto w-full max-w-[716px]"
          priority
        />
      </div>
    </section>
  );
}
