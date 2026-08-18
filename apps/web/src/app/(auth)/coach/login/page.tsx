import * as React from "react";
import { StaffLoginForm } from "@/components/auth/staff-login-form";

export default function CoachLoginPage() {
  return <React.Suspense fallback={null}><StaffLoginForm portal="coach" /></React.Suspense>;
}
