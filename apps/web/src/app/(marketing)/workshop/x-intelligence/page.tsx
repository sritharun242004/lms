import {
  Hero,
  WhyNow,
  About,
  Journey,
  Outcomes,
  Curriculum,
  DailySchedule,
  DailyOutcomes,
  Trainers,
  Pricing,
  Audience,
  Faq,
  CityBand,
  WorkshopFooter,
} from "@/components/workshop/landing/sections";
import { RegistrationSection } from "@/components/workshop/registration-section";

export default function XiLandingPage() {
  return (
    <main>
      <Hero />
      <WhyNow />
      <About />
      <Journey />
      <Outcomes />
      <Curriculum />
      <DailySchedule />
      <DailyOutcomes />
      <Trainers />
      <Pricing />
      <Audience />
      <Faq />
      <CityBand />
      <RegistrationSection />
      <WorkshopFooter />
    </main>
  );
}
