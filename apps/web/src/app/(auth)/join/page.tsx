import * as React from "react";
import { ParticipantEntryForm } from "@/components/auth/participant-entry-form";

export default function JoinPage() {
  return <React.Suspense fallback={null}><ParticipantEntryForm /></React.Suspense>;
}
