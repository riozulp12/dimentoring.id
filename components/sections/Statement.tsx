import Mascot from "@/components/ui/Mascot";

export default function Statement() {
  return (
    <section className="w-full px-20 py-16">
      <div className="relative flex min-h-[352px] w-full items-center overflow-hidden rounded-[64px] border-[0.8px] border-[#E3E3E3] bg-white shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)]">
        <Mascot
          variant="Plenger"
          className="pointer-events-none absolute top-11 left-8 h-[380px] w-auto select-none"
        />
        <div className="flex flex-col gap-[18px] py-10 pr-16 pl-[476px]">
          <h2 className="text-[40px] leading-[1.5] font-semibold tracking-[-0.8px] text-black">
            Tidak Semua{" "}
            <span className="text-[#081EEA]">Perjalanan Belajarmu</span> Sama
            dengan Temanmu
            <br />
            Kamu <span className="text-[#081EEA]">Punya Versimu</span> Sendiri
          </h2>
          <p className="text-2xl leading-[1.5] tracking-[-0.48px] text-black">
            Temukan versi belajarmu dan gapai cita - citamu bersama kami, kami
            akan bimbing kamu sampai berhasil
          </p>
        </div>
      </div>
    </section>
  );
}
