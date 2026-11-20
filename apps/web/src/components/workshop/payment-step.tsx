"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type Registration = {
  registrationCode: string;
  amountInInr: number;
  workshopPackage: "DAY1" | "DAY2" | "BOTH";
  status: string;
};

const PACKAGE_LABEL: Record<Registration["workshopPackage"], string> = {
  DAY1: "Day 1",
  DAY2: "Day 2",
  BOTH: "Both days",
};

// Payment is never verified inside this application — the participant
// tells us themselves by clicking "Payment Done", which transitions the
// status immediately in the same request. No admin action changes this
// status from elsewhere, so there is nothing to poll for.
export function PaymentStep({ registrationCode }: { registrationCode: string }) {
  const [registration, setRegistration] = React.useState<Registration | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [demoMode, setDemoMode] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      const [registrationRes, qrRes] = await Promise.all([
        fetch(`/api/v1/workshop/registrations/${registrationCode}`),
        fetch(`/api/v1/workshop/registrations/${registrationCode}/qr`),
      ]);
      const [registrationResult, qrResult] = await Promise.all([registrationRes.json(), qrRes.json()]);
      if (cancelled) return;
      if (registrationResult.success) setRegistration(registrationResult.data.registration);
      if (qrResult.success) {
        setQrDataUrl(qrResult.data.qrDataUrl);
        setDemoMode(qrResult.data.demoMode);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [registrationCode]);

  async function handlePaymentDone() {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/workshop/registrations/${registrationCode}/payment-done`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Unable to update your registration");
      }
      setRegistration((current) => (current ? { ...current, ...result.data.registration } : result.data.registration));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update your registration");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!registration) {
    return <p className="text-sm text-muted-foreground">Loading your registration…</p>;
  }

  if (registration.status === "PAYMENT_DONE") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <CheckCircle2 className="size-12 text-emerald-600" />
          <p className="text-lg font-semibold">Thank you for registering! We will reach out to you shortly.</p>
          <p className="text-xs text-muted-foreground">Registration ID: {registration.registrationCode}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-6">
        <div>
          <p className="text-sm text-muted-foreground">Registration ID</p>
          <p className="text-lg font-semibold">{registration.registrationCode}</p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Selection</p>
            <p className="font-medium">{PACKAGE_LABEL[registration.workshopPackage]}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Amount (incl. GST)</p>
            <p className="text-xl font-bold">₹{registration.amountInInr.toLocaleString("en-IN")}</p>
          </div>
        </div>

        {qrDataUrl ? (
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Payment QR code" width={220} height={220} />
            {demoMode ? (
              <Badge variant="destructive">DEMO PAYMENT QR — NOT VALID FOR PAYMENT</Badge>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Scan the QR, or pay the amount above using your preferred UPI/payment app. Once you&apos;ve
          paid, let us know below — we do not verify payment inside this app.
        </p>

        <Button type="button" size="lg" disabled={isSubmitting} onClick={handlePaymentDone} className="rounded-none shadow-none">
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Payment Done
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
