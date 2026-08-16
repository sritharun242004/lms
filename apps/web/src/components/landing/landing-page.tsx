"use client";

import * as React from "react";
import { ParticipantEntryForm } from "@/components/auth/participant-entry-form";

export function LandingPage() {
  return <React.Suspense fallback={null}><ParticipantEntryForm standalone /></React.Suspense>;
}
