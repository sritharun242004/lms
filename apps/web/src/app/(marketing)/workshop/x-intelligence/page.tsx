import {
  WorkshopNav,
  Hero,
  WhyNow,
  About,
  Journey,
  Curriculum,
  Outcomes,
  DailySchedule,
  Audience,
  Trainers,
  Pricing,
  WhatToBring,
  Faq,
  WorkshopFooter,
} from "@/components/workshop/landing/sections";
import { RegistrationSection } from "@/components/workshop/registration-section";

export default function XiLandingPage() {
  return (
    <main>
      <WorkshopNav />
      <Hero />
      <WhyNow />
      <About />
      <Journey />
      <Curriculum />
      <Outcomes />
      <DailySchedule />
      <Audience />
      <Trainers />
      <Pricing />
      <WhatToBring />
      <Faq />
      <RegistrationSection />
      <WorkshopFooter />
    </main>
  );
}
