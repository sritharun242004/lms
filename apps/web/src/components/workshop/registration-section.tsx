"use client";

import * as React from "react";
import { RegistrationForm } from "./registration-form";
import { PaymentStep } from "./payment-step";

export function RegistrationSection() {
  const [registrationCode, setRegistrationCode] = React.useState<string | null>(null);
  const [generalWhatsAppUrl, setGeneralWhatsAppUrl] = React.useState<string | null>(null);

  function handleRegistered(registration: { registrationCode: string }) {
    setRegistrationCode(registration.registrationCode);
    // Opens the general workshop WhatsApp group in a new tab so this
    // tab keeps showing the registration confirmation and payment
    // instructions — distinct from the Day1/Day2-specific group link an
    // admin pastes in once payment is approved.
    fetch("/api/v1/workshop/config")
      .then((res) => res.json())
      .then((result) => {
        if (!result.success) return;
        const url: string | null = result.data.generalWhatsAppInviteUrl;
        setGeneralWhatsAppUrl(url);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      })
      .catch(() => {
        // Non-fatal — the registration itself already succeeded.
      });
  }

  return (
    <section id="register" className="mx-auto max-w-2xl px-6 py-16">
      <h2 className="text-3xl font-bold tracking-tight">Reserve your seat</h2>
      <p className="mt-2 text-muted-foreground">
        Fill this in. You&apos;ll see the amount and payment options right after.
      </p>
      <div className="mt-8 flex flex-col gap-4">
        {registrationCode ? (
          <>
            {generalWhatsAppUrl ? (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                We opened our general workshop WhatsApp group in a new tab.{" "}
                <a
                  href={generalWhatsAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline"
                >
                  Didn&apos;t open? Click here.
                </a>
              </p>
            ) : null}
            <PaymentStep registrationCode={registrationCode} />
          </>
        ) : (
          <React.Suspense fallback={null}>
            <RegistrationForm onRegistered={handleRegistered} />
          </React.Suspense>
        )}
      </div>
    </section>
  );
}
