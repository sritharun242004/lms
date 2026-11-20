"use client";

import * as React from "react";
import { useLenis } from "lenis/react";
import { RegistrationForm } from "./registration-form";
import { PaymentStep } from "./payment-step";
import { BlueBand, SectionHeader } from "./landing/sections";

export function RegistrationSection() {
  const [registrationCode, setRegistrationCode] = React.useState<string | null>(null);
  const [generalWhatsAppUrl, setGeneralWhatsAppUrl] = React.useState<string | null>(null);

  const lenis = useLenis();

  function handleRegistered(registration: { registrationCode: string }) {
    setRegistrationCode(registration.registrationCode);
    // The payment step replaces a much taller form, so bring its top into
    // view instead of leaving the visitor scrolled past it.
    if (lenis) lenis.scrollTo("#register", { offset: 24 });
    else document.getElementById("register")?.scrollIntoView();
    // The general workshop WhatsApp group is offered on the final
    // thank-you step, distinct from the Day1/Day2-specific group link an
    // admin pastes in once payment is approved.
    fetch("/api/v1/workshop/config")
      .then((res) => res.json())
      .then((result) => {
        if (result.success) setGeneralWhatsAppUrl(result.data.generalWhatsAppInviteUrl);
      })
      .catch((error: unknown) => {
        // The registration itself already succeeded; without the URL the
        // thank-you step simply has no join button.
        console.error("Could not load the workshop WhatsApp link", error);
      });
  }

  return (
    <BlueBand id="register" className="mt-4" innerClassName="px-5 py-20 sm:px-8 sm:py-28">
      <SectionHeader center onBlue label="Register" title="Reserve your seat">
        Fill this in. You&apos;ll see the amount and payment options right after.
      </SectionHeader>
      <div className="mx-auto mt-12 flex max-w-3xl flex-col gap-4 rounded-[28px] bg-white p-6 text-slate-900 shadow-[0_40px_90px_-40px_rgba(2,6,23,0.7)] sm:p-10">
        {registrationCode ? (
          <PaymentStep registrationCode={registrationCode} whatsAppUrl={generalWhatsAppUrl} />
        ) : (
          <React.Suspense fallback={null}>
            <RegistrationForm onRegistered={handleRegistered} />
          </React.Suspense>
        )}
      </div>
    </BlueBand>
  );
}
