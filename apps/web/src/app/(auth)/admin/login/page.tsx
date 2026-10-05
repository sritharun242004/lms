"use client";

import * as React from "react";
import { StaffLoginForm } from "@/components/auth/staff-login-form";

export default function AdminLoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-[280px]" />}>
      <StaffLoginForm />
    </React.Suspense>
  );
}
