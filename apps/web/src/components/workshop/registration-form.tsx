"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// Client-side validation only — the server re-validates with the
// authoritative schema in lib/workshop/registration.ts. Duplicated here
// (not imported) because that module pulls in prisma, which cannot be
// bundled into a client component.
const formSchema = z
  .object({
    registrationKind: z.enum(["INDIVIDUAL", "COMPANY"]),
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    email: z.string().trim().email("Enter a valid email"),
    whatsappNumber: z.string().trim().min(8, "Enter a valid WhatsApp number").max(20),
    company: z.string().trim().optional(),
    designation: z.string().trim().min(1, "Enter your role or designation"),
    workshopPackage: z.enum(["DAY1", "DAY2", "BOTH"]),
    previousDay1Attendance: z.boolean().optional(),
    previousDay1When: z.string().trim().optional(),
    aiExperienceLevel: z.enum(["NEW", "SOMETIMES", "DAILY"]),
    aiUseCase: z.string().trim().optional(),
    subscriptions: z.array(z.string()),
    needsGstInvoice: z.boolean(),
    gstCompanyName: z.string().trim().optional(),
    gstin: z.string().trim().optional(),
    companyName: z.string().trim().optional(),
    companyAddress: z.string().trim().optional(),
    companyGstin: z.string().trim().optional(),
    referredBy: z.string().trim().optional(),
    ageConfirmed: z.literal(true, { errorMap: () => ({ message: "You must confirm you are 16 or older" }) }),
  })
  .superRefine((value, ctx) => {
    if (value.workshopPackage === "DAY2" && !value.previousDay1Attendance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previousDay1Attendance"],
        message: "Day 2 needs Day 1 first",
      });
    }
    if (value.registrationKind === "COMPANY") {
      if (!value.companyName) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyName"], message: "Enter your company name" });
      }
      if (!value.companyAddress) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyAddress"], message: "Enter your company address" });
      }
      if (!value.companyGstin) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyGstin"], message: "Enter your company GSTIN" });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

type RegisteredResult = {
  registrationCode: string;
  amountInInr: number;
  workshopPackage: "DAY1" | "DAY2" | "BOTH";
};

const SUBSCRIPTION_OPTIONS = ["ChatGPT Business", "Claude Pro", "Copilot Studio", "None yet"];

export function RegistrationForm({
  onRegistered,
}: {
  onRegistered: (registration: RegisteredResult) => void;
}) {
  const searchParams = useSearchParams();
  const initialPackage = (searchParams.get("package") as FormValues["workshopPackage"]) || "BOTH";
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      registrationKind: "INDIVIDUAL",
      fullName: "",
      email: "",
      whatsappNumber: "+91",
      company: "",
      designation: "",
      workshopPackage: ["DAY1", "DAY2", "BOTH"].includes(initialPackage) ? initialPackage : "BOTH",
      previousDay1Attendance: undefined,
      previousDay1When: "",
      aiExperienceLevel: "SOMETIMES",
      aiUseCase: "",
      subscriptions: [],
      needsGstInvoice: false,
      gstCompanyName: "",
      gstin: "",
      companyName: "",
      companyAddress: "",
      companyGstin: "",
      referredBy: "",
      ageConfirmed: undefined as unknown as true,
    },
  });

  const registrationKind = form.watch("registrationKind");
  const workshopPackage = form.watch("workshopPackage");
  const previousDay1Attendance = form.watch("previousDay1Attendance");
  const needsGstInvoice = form.watch("needsGstInvoice");

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    setServerError(null);
    try {
      const response = await fetch("/api/v1/workshop/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Unable to complete registration");
      }
      onRegistered(result.data.registration);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Unable to complete registration");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {serverError ? (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        ) : null}

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Registration type</legend>
          {([
            ["INDIVIDUAL", "Individual Registration"],
            ["COMPANY", "Company Registration"],
          ] as const).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={registrationKind === value}
                onChange={() => form.setValue("registrationKind", value)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="As it should appear on the certificate" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} type="email" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="whatsappNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>WhatsApp number</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {registrationKind === "INDIVIDUAL" ? (
          <FormField
            control={form.control}
            name="company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company / organisation (optional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <div className="grid gap-4 rounded-lg border border-border p-4">
            <p className="text-sm font-medium">Company details</p>
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="companyAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company address</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="companyGstin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company GSTIN</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <FormField
          control={form.control}
          name="designation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role / designation</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Which days?</legend>
          {([
            ["DAY1", "Day 1 only"],
            ["DAY2", "Day 2 only"],
            ["BOTH", "Both days"],
          ] as const).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value={value}
                checked={workshopPackage === value}
                onChange={() => form.setValue("workshopPackage", value)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        {workshopPackage === "DAY2" ? (
          <div className="grid gap-3 rounded-lg border border-border p-4">
            <p className="text-sm font-medium">Have you done our Day 1 before?</p>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={previousDay1Attendance === true}
                  onChange={() => form.setValue("previousDay1Attendance", true)}
                />
                Yes
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={previousDay1Attendance === false}
                  onChange={() => form.setValue("previousDay1Attendance", false)}
                />
                No
              </label>
            </div>
            {previousDay1Attendance === true ? (
              <FormField
                control={form.control}
                name="previousDay1When"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>When?</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. March cohort" />
                    </FormControl>
                  </FormItem>
                )}
              />
            ) : null}
            {previousDay1Attendance === false ? (
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3 text-sm">
                <span>Day 2 needs Day 1 first. Switch to Both days?</span>
                <Button type="button" size="sm" variant="outline" onClick={() => form.setValue("workshopPackage", "BOTH")}>
                  Switch
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Your AI level</legend>
          {([
            ["NEW", "New to it"],
            ["SOMETIMES", "Use it sometimes"],
            ["DAILY", "Use it daily"],
          ] as const).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={form.watch("aiExperienceLevel") === value}
                onChange={() => form.setValue("aiExperienceLevel", value)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <FormField
          control={form.control}
          name="aiUseCase"
          render={({ field }) => (
            <FormItem>
              <FormLabel>One task you&apos;d love AI to do for you (optional)</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} />
              </FormControl>
            </FormItem>
          )}
        />

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Subscriptions you have</legend>
          {SUBSCRIPTION_OPTIONS.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.watch("subscriptions").includes(option)}
                onCheckedChange={(checked) => {
                  const current = form.getValues("subscriptions");
                  form.setValue(
                    "subscriptions",
                    checked ? [...current, option] : current.filter((item) => item !== option)
                  );
                }}
              />
              {option}
            </label>
          ))}
        </fieldset>

        {registrationKind === "INDIVIDUAL" ? (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <span className="text-sm font-medium">Need a GST invoice?</span>
              <Switch
                checked={needsGstInvoice}
                onCheckedChange={(checked) => form.setValue("needsGstInvoice", checked)}
              />
            </div>
            {needsGstInvoice ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="gstCompanyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gstin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GSTIN</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Your GST invoice will use the company details above — no separate entry needed.
          </p>
        )}

        <FormField
          control={form.control}
          name="referredBy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Referred by (optional)</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.watch("ageConfirmed") === true}
            onCheckedChange={(checked) => form.setValue("ageConfirmed", checked === true ? true : (undefined as unknown as true))}
          />
          I confirm I am 16 or older
        </label>
        {form.formState.errors.ageConfirmed ? (
          <p className="text-sm text-destructive">{form.formState.errors.ageConfirmed.message}</p>
        ) : null}

        <Button type="submit" disabled={isSubmitting} size="lg" className="rounded-none shadow-none">
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Continue to payment
        </Button>
      </form>
    </Form>
  );
}
