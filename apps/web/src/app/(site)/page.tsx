import { BookingSteps } from "@/components/home/booking-steps";
import { CategoryStrip } from "@/components/home/category-strip";
import { CtaBand } from "@/components/home/cta-band";
import { FeaturedTalent } from "@/components/home/featured-talent";
import { ForTalent } from "@/components/home/for-talent";
import { Hero } from "@/components/home/hero";
import { Occasions } from "@/components/home/occasions";
import { PromiseSection } from "@/components/home/promise-section";
import { SearchBar } from "@/components/home/search-bar";

export default function HomePage() {
  return (
    <>
      <Hero />
      <SearchBar />
      <CategoryStrip />
      <FeaturedTalent />
      <PromiseSection />
      <BookingSteps />
      <Occasions />
      <ForTalent />
      <CtaBand />
    </>
  );
}
