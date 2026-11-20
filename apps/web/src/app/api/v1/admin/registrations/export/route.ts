import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api/response";
import { csvResponseHeaders, rowsToCsv, rowsToXlsxBuffer, xlsxResponseHeaders } from "@/lib/export/spreadsheet";

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Registered — Payment Pending",
  PAYMENT_DONE: "Payment Marked Done",
};

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return errorResponse("Admin access required", "FORBIDDEN", 403);
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const status = url.searchParams.get("status");
  const workshopPackage = url.searchParams.get("workshopPackage");

  const registrations = await prisma.workshopRegistration.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(workshopPackage ? { workshopPackage: workshopPackage as never } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  // Every field the registration form collects, so the sheet is the full
  // record rather than a summary.
  const rows = registrations.map((r) => ({
    "Registration ID": r.registrationCode,
    "Full Name": r.fullName,
    Email: r.email,
    "WhatsApp Number": r.whatsappNumber,
    Designation: r.designation,
    Type: r.registrationKind === "COMPANY" ? "Company" : "Individual",
    "Company / Organisation": r.company ?? "",
    "Company Name": r.companyName ?? "",
    "Company Address": r.companyAddress ?? "",
    GSTIN: r.companyGstin ?? "",
    Package: r.workshopPackage,
    "Done Day 1 Before": r.previousDay1Attendance === null ? "" : r.previousDay1Attendance ? "Yes" : "No",
    "Day 1 When": r.previousDay1When ?? "",
    "AI Level": r.aiExperienceLevel,
    "AI Task": r.aiUseCase ?? "",
    Subscriptions: r.subscriptions.join(", "),
    "Needs GST Invoice": r.needsGstInvoice ? "Yes" : "No",
    "GST Invoice Company": r.gstCompanyName ?? "",
    "GST Invoice GSTIN": r.gstin ?? "",
    "Referred By": r.referredBy ?? "",
    "Amount (INR)": r.amountInInr,
    Status: STATUS_LABEL[r.status] ?? r.status,
    "Payment Marked Done At": r.paymentMarkedDoneAt ? r.paymentMarkedDoneAt.toISOString() : "",
    "Registered At": r.createdAt.toISOString(),
  }));

  const filename = `workshop-registrations-${new Date().toISOString().slice(0, 10)}.${format}`;

  if (format === "xlsx") {
    const buffer = rowsToXlsxBuffer(rows, "Registrations");
    return new NextResponse(new Uint8Array(buffer), { headers: xlsxResponseHeaders(filename) });
  }
  return new NextResponse(rowsToCsv(rows), { headers: csvResponseHeaders(filename) });
}
