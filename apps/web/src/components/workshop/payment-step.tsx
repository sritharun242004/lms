"use client";

import * as React from "react";
import { Check, CheckCircle2, Copy, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WizardProgress } from "./wizard-progress";

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
export function PaymentStep({
  registrationCode,
  whatsAppUrl = null,
}: {
  registrationCode: string;
  whatsAppUrl?: string | null;
}) {
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
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading your registration…
      </p>
    );
  }

  if (registration.status === "PAYMENT_DONE") {
    return (
      <div className="flex flex-col gap-8">
        <WizardProgress current={7} />
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <CheckCircle2 className="size-14 text-emerald-600" />
          <p className="text-xl font-bold">Thank you for registering! We will reach out to you shortly.</p>
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs text-muted-foreground">Registration ID: {registration.registrationCode}</p>
            <CopyButton value={registration.registrationCode} />
          </div>
          {whatsAppUrl ? (
            <Button asChild size="lg" className="mt-4 h-12 rounded-full bg-[#25D366] px-8 text-[15px] font-bold text-white hover:bg-[#1ebe5a]">
              <a href={whatsAppUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="size-5" />
                Join WhatsApp group
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const amount = `₹${registration.amountInInr.toLocaleString("en-IN")}`;

  return (
    <div className="flex flex-col gap-8">
      <WizardProgress current={6} />
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm text-muted-foreground">You&apos;re almost in. Your selection</p>
          <p className="mt-1 text-lg font-bold">{PACKAGE_LABEL[registration.workshopPackage]}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Amount (incl. GST)</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-primary">{amount}</p>
        </div>
      </div>

      <div className="grid items-start gap-8 md:grid-cols-[auto_1fr]">
        <div className="mx-auto flex w-full max-w-[384px] flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          {qrDataUrl ? (
            // Shown at its own pixel size: scaling a QR down blurs module
            // edges and makes it harder for phone cameras to read.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="UPI payment QR code" width={356} height={357} className="h-auto w-full max-w-[356px]" />
          ) : (
            <div className="flex size-52 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {demoMode ? <Badge variant="destructive" className="h-auto whitespace-normal py-1 text-center">DEMO PAYMENT QR. NOT VALID FOR PAYMENT</Badge> : null}
        </div>

        <div className="flex flex-col gap-6">
          <ol className="flex flex-col gap-4 text-sm">
            {[
              <>Scan the QR with any UPI app (GPay, PhonePe, Paytm, your bank app).</>,
              <>
                Enter <span className="whitespace-nowrap font-semibold">{amount}</span> as the amount.
              </>,
              <>
                Add your registration ID{" "}
                <span className="whitespace-nowrap font-semibold">{registration.registrationCode}</span> in the payment
                note.
              </>,
            ].map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-primary">
                  {index + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">Registration ID</p>
              <p className="font-mono text-base font-semibold">{registration.registrationCode}</p>
            </div>
            <CopyButton value={registration.registrationCode} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Once you&apos;ve paid, tap Payment Done. We do not verify payment inside this app; we confirm your seat on
            WhatsApp and email with the venue details.
          </p>
          <Button
            type="button"
            size="lg"
            disabled={isSubmitting}
            onClick={handlePaymentDone}
            className="h-12 rounded-full text-[15px] font-bold"
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Payment Done
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

// Copies the registration ID so it can be pasted into the UPI payment
// note. A failed copy (no clipboard permission, insecure context) says so
// rather than pretending it worked.
function CopyButton({ value }: { value: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");

  React.useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch (error) {
      console.error("Could not copy the registration ID", error);
      setState("failed");
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={copy}
      aria-label={`Copy registration ID ${value}`}
      className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold"
    >
      {state === "copied" ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}</span>
    </Button>
  );
}
