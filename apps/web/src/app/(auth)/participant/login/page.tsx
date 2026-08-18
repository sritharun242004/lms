import * as React from "react";
import { StaffLoginForm } from "@/components/auth/staff-login-form";

export default function ParticipantLoginPage() {
  return <React.Suspense fallback={null}><StaffLoginForm portal="participant" /></React.Suspense>;
}
