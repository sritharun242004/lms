"use client";

import * as React from "react";
import { Loader2, Upload } from "lucide-react";
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

export function PaymentStep({ registrationCode }: { registrationCode: string }) {
  const [registration, setRegistration] = React.useState<Registration | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [demoMode, setDemoMode] = React.useState(true);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function fetchRegistration() {
    const response = await fetch(`/api/v1/workshop/registrations/${registrationCode}`);
    const result = await response.json();
    if (result.success) setRegistration(result.data.registration);
  }

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
      await fetchRegistration();
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
      </CardContent>
    </Card>
  );
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PROOF_SUBMITTED: "Submitted. We'll confirm once an admin reviews your payment.",
  UNDER_VERIFICATION: "Under admin verification",
  APPROVED: "Payment approved — you're in!",
  REJECTED: "Payment rejected — see your email/WhatsApp for details",
  RESUBMISSION_REQUESTED: "Please upload a clearer payment proof",
};
