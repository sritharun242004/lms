import {
  WorkshopNav,
  Hero,
  WhyNow,
  About,
  Journey,
  Curriculum,
  Builds,
  DaySchedule,
  Audience,
  Trainers,
  Pricing,
  WhatToBring,
  Faq,
  WorkshopFooter,
} from "@/components/workshop/landing/sections";
import { RegistrationSection } from "@/components/workshop/registration-section";

// Section order follows the XI brief (sections 0-14) exactly.
export default function XiLandingPage() {
  return (
    <main>
      <WorkshopNav />
      <Hero />
      <WhyNow />
      <About />
      <Journey />
      <Curriculum />
      <Builds />
      <DaySchedule />
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
