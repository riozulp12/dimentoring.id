import Navbar from "@/components/ui/Navbar";
import Hero from "@/components/sections/Hero";
import Value from "@/components/sections/Value";
import Prediction from "@/components/sections/Prediction";
import Why from "@/components/sections/Why";
import Program from "@/components/sections/Program";
import Mentor from "@/components/sections/Mentor";
import Testimonial from "@/components/sections/Testimonial";
import Leaderboard from "@/components/sections/Leaderboard";
import FAQ from "@/components/sections/FAQ";
import Statement from "@/components/sections/Statement";
import Footer from "@/components/sections/Footer";

export default function Home() {
  return (
    <div className="flex w-full flex-col">
      <Navbar activeItem="home" />
      <Hero />
      <Value />
      <Prediction />
      <Why />
      <Program />
      <Mentor />
      <Testimonial />
      <Leaderboard />
      <FAQ />
      <Statement />
      <Footer />
    </div>
  );
}
