import * as React from "react";
import { StaffLoginForm } from "@/components/auth/staff-login-form";

export default function AdminLoginPage() {
  return <React.Suspense fallback={null}><StaffLoginForm /></React.Suspense>;
}
