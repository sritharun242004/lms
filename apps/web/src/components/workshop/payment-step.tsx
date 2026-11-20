"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type Registration = {
  registrationCode: string;
  amountInInr: number;
  workshopPackage: "DAY1" | "DAY2" | "BOTH";
  status: string;
  whatsappGroupInviteUrl: string | null;
};

const PACKAGE_LABEL: Record<Registration["workshopPackage"], string> = {
  DAY1: "Day 1",
  DAY2: "Day 2",
  BOTH: "Both days",
};

const POLL_INTERVAL_MS = 5000;

// Approval is the only state this never needs to leave — every other
// status (including a rejection) can still change again from the admin
// side or after the participant re-uploads, so polling keeps going.
function isPollable(status: string): boolean {
  return status !== "APPROVED";
}

export function PaymentStep({ registrationCode }: { registrationCode: string }) {
  const [registration, setRegistration] = React.useState<Registration | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [demoMode, setDemoMode] = React.useState(true);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pollError, setPollError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fetchRegistration = React.useCallback(async (): Promise<Registration | null> => {
    const response = await fetch(`/api/v1/workshop/registrations/${registrationCode}`);
    const result = await response.json();
    if (!result.success) throw new Error(result.error?.message || "Unable to load registration");
    return result.data.registration as Registration;
  }, [registrationCode]);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      const [registrationRes, qrRes] = await Promise.all([
        fetch(`/api/v1/workshop/registrations/${registrationCode}`),
        fetch(`/api/v1/workshop/registrations/${registrationCode}/qr`),
      ]);
      const [registrationResult, qrResult] = await Promise.all([
        registrationRes.json(),
        qrRes.json(),
      ]);
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

  // Live status polling: stops once approved, pauses while the tab is
  // hidden, and a single failed request never kills the loop — it just
  // tries again next tick (graceful network-failure handling).
  React.useEffect(() => {
    if (!registration || !isPollable(registration.status)) return;
    let cancelled = false;

    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const latest = await fetchRegistration();
        if (cancelled || !latest) return;
        setPollError(null);
        setRegistration(latest);
      } catch {
        if (!cancelled) setPollError("Having trouble checking your status — retrying…");
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [registration?.status, fetchRegistration, registration]);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/v1/workshop/registrations/${registrationCode}/payment-proof`, {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Unable to submit payment proof");
      }
      setRegistration(await fetchRegistration());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit payment proof");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!registration) {
    return <p className="text-sm text-muted-foreground">Loading your registration…</p>;
  }

  if (registration.status === "APPROVED") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <CheckCircle2 className="size-12 text-emerald-600" />
          <h2 className="text-2xl font-bold">Payment Verified!</h2>
          <p className="text-muted-foreground">
            Your registration ({registration.registrationCode}) is confirmed. Join the workshop
            WhatsApp group below.
          </p>
          {registration.whatsappGroupInviteUrl ? (
            <Button asChild size="lg">
              <a href={registration.whatsappGroupInviteUrl} target="_blank" rel="noreferrer">
                Join WhatsApp Group
              </a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your group invitation link is on its way — check back shortly.
            </p>
          )}
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

        {registration.status === "REJECTED" || registration.status === "RESUBMISSION_REQUESTED" ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              Your payment proof was not accepted. Please upload a clearer screenshot or the
              correct proof below.
            </span>
          </div>
        ) : null}

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
          Scan the QR or use the payment link shared with you, then upload your payment screenshot
          below. Your seat is confirmed once an admin reviews and approves your payment.
        </p>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            onChange={handleUpload}
            className="hidden"
            id="payment-proof-input"
          />
          <Button
            type="button"
            variant="outline"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload payment proof
          </Button>
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          Status: <span className="font-medium">{STATUS_LABEL[registration.status] ?? registration.status}</span>
        </div>
        {pollError ? <p className="text-xs text-muted-foreground">{pollError}</p> : null}
      </CardContent>
    </Card>
  );
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PROOF_SUBMITTED: "Submitted. We'll confirm once an admin reviews your payment.",
  UNDER_VERIFICATION: "Under admin verification",
  APPROVED: "Payment approved — you're in!",
  REJECTED: "Payment rejected — upload a replacement below",
  RESUBMISSION_REQUESTED: "Please upload a clearer payment proof",
};
