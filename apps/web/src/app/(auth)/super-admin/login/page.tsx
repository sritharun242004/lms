import * as React from "react";
import { StaffLoginForm } from "@/components/auth/staff-login-form";

export default function SuperAdminLoginPage() {
  return <React.Suspense fallback={null}><StaffLoginForm portal="super-admin" /></React.Suspense>;
}
