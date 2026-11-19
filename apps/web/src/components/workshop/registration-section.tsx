"use client";

import * as React from "react";
import { RegistrationForm } from "./registration-form";
import { PaymentStep } from "./payment-step";

export function RegistrationSection() {
  const [registrationCode, setRegistrationCode] = React.useState<string | null>(null);

  return (
    <section id="register" className="mx-auto max-w-2xl px-6 py-16">
      <h2 className="text-3xl font-bold tracking-tight">Reserve your seat</h2>
      <p className="mt-2 text-muted-foreground">
        Fill this in. You&apos;ll see the amount and payment options right after.
      </p>
      <div className="mt-8">
        {registrationCode ? (
          <PaymentStep registrationCode={registrationCode} />
        ) : (
          <React.Suspense fallback={null}>
            <RegistrationForm onRegistered={(registration) => setRegistrationCode(registration.registrationCode)} />
          </React.Suspense>
        )}
      </div>
    </section>
  );
}
