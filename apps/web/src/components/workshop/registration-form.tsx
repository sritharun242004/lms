"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { TOTAL_STEPS, WizardProgress } from "./wizard-progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { WORKSHOP_PACKAGE_PRICING_INR } from "@/lib/workshop/pricing";

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

  // The fee cards on the landing page write ?package= after the form has
  // already mounted, so follow later changes too, not just the first value.
  const requestedPackage = searchParams.get("package");
  React.useEffect(() => {
    if (requestedPackage === "DAY1" || requestedPackage === "DAY2" || requestedPackage === "BOTH") {
      form.setValue("workshopPackage", requestedPackage);
    }
  }, [requestedPackage, form]);

  const registrationKind = form.watch("registrationKind");
  const workshopPackage = form.watch("workshopPackage");
  const previousDay1Attendance = form.watch("previousDay1Attendance");
  const needsGstInvoice = form.watch("needsGstInvoice");
  const aiExperienceLevel = form.watch("aiExperienceLevel");
  const subscriptions = form.watch("subscriptions");

  const [step, setStep] = React.useState(0);
  const [day1NoticeOpen, setDay1NoticeOpen] = React.useState(false);
  const isLastStep = step === STEPS.length - 1;

  // Field-level rules come from the schema; the company-detail rules live
  // in superRefine, which zod skips until the whole object parses, so the
  // company step re-checks them here.
  async function goNext() {
    const fieldsOk = await form.trigger(STEPS[step].fields);
    const values = form.getValues();
    let crossFieldOk = true;
    if (STEPS[step].key === "company" && values.registrationKind === "COMPANY") {
      for (const [name, message] of [
        ["companyName", "Enter your company name"],
        ["companyAddress", "Enter your company address"],
        ["companyGstin", "Enter your company GSTIN"],
      ] as const) {
        if (!values[name]) {
          form.setError(name, { message });
          crossFieldOk = false;
        }
      }
    }
    if (fieldsOk && crossFieldOk) setStep((current) => current + 1);
  }

  // The button only disables after a re-render, and validation runs first,
  // so two quick taps (or Enter + tap) could both get here and create two
  // registrations. A ref is set synchronously, so the second one stops here.
  const submittingRef = React.useRef(false);

  async function onSubmit(values: FormValues) {
    if (submittingRef.current) return;
    submittingRef.current = true;
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
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  // Enter moves forward a step; only the last step actually submits.
  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (isLastStep) return form.handleSubmit(onSubmit)(event);
    event.preventDefault();
    void goNext();
  }

  const current = STEPS[step];

  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit} className="flex flex-col gap-8">
        <WizardProgress current={step + 1} total={TOTAL_STEPS} />
        <h3 className="text-2xl font-extrabold tracking-[-0.02em] text-slate-950 sm:text-[1.75rem]">{current.title}</h3>

        {serverError ? (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {serverError}
          </p>
        ) : null}

        {current.key === "name" ? (
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  {/* No autoFocus here: this step renders on page load, and focusing
                      it would scroll every visitor straight past the landing
                      page to the form. Later steps only mount after "Next". */}
                  <Input {...field} className={FIELD} placeholder="As on your certificate" autoComplete="name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        {current.key === "basics" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} className={FIELD} type="email" autoComplete="email" autoFocus />
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
                    <Input {...field} className={FIELD} type="tel" autoComplete="tel" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="designation"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Role / designation</FormLabel>
                  <FormControl>
                    <Input {...field} className={FIELD} autoComplete="organization-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : null}

        {current.key === "company" ? (
          <>
            <Choice legend="Registering as">
              {([
                ["INDIVIDUAL", "Individual"],
                ["COMPANY", "Company"],
              ] as const).map(([value, label]) => (
                <ChoiceOption
                  key={value}
                  name="registrationKind"
                  checked={registrationKind === value}
                  onChange={() => form.setValue("registrationKind", value)}
                >
                  {label}
                  <span className="sr-only"> registration</span>
                </ChoiceOption>
              ))}
            </Choice>

            {registrationKind === "INDIVIDUAL" ? (
              <>
                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company / organisation (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} className={FIELD} autoComplete="organization" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-4">
                  <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 px-5 py-4">
                    <span className="text-sm font-medium">Need a GST invoice?</span>
                    <Switch
                      checked={needsGstInvoice}
                      onCheckedChange={(checked) => form.setValue("needsGstInvoice", checked)}
                    />
                  </label>
                  {needsGstInvoice ? (
                    <div className="grid gap-5 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="gstCompanyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company name</FormLabel>
                            <FormControl>
                              <Input {...field} className={FIELD} />
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
                              <Input {...field} className={FIELD} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company name</FormLabel>
                      <FormControl>
                        <Input {...field} className={FIELD} autoComplete="organization" />
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
                        <Input {...field} className={FIELD} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="companyAddress"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Company address</FormLabel>
                      <FormControl>
                        <Textarea {...field} className={FIELD_AREA} rows={2} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Your GST invoice will use the company details above, so no separate entry is needed.
                </p>
              </div>
            )}
          </>
        ) : null}

        {current.key === "days" ? (
          <>
            <Choice legend="Which days?" columns={3}>
              {([
                ["DAY1", "Day 1 only"],
                ["DAY2", "Day 2 only"],
                ["BOTH", "Both days"],
              ] as const).map(([value, label]) => (
                <ChoiceOption
                  key={value}
                  name="workshopPackage"
                  value={value}
                  checked={workshopPackage === value}
                  onChange={() => form.setValue("workshopPackage", value)}
                >
                  <span className="block">{label}</span>
                  <span className="mt-0.5 block text-xs font-normal opacity-70">
                    ₹{WORKSHOP_PACKAGE_PRICING_INR[value].toLocaleString("en-IN")}
                  </span>
                </ChoiceOption>
              ))}
            </Choice>

            {workshopPackage === "DAY2" ? (
              <div className="grid gap-4 rounded-2xl bg-slate-50 p-5">
                <Choice legend="Have you done our Day 1 before?">
                  <ChoiceOption
                    name="previousDay1Attendance"
                    checked={previousDay1Attendance === true}
                    onChange={() => form.setValue("previousDay1Attendance", true)}
                  >
                    Yes
                  </ChoiceOption>
                  <ChoiceOption
                    name="previousDay1Attendance"
                    checked={previousDay1Attendance === false}
                    onChange={() => {
                      form.setValue("previousDay1Attendance", false);
                      setDay1NoticeOpen(true);
                    }}
                  >
                    No
                  </ChoiceOption>
                </Choice>
                {previousDay1Attendance === true ? (
                  <FormField
                    control={form.control}
                    name="previousDay1When"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>When?</FormLabel>
                        <FormControl>
                          <Input {...field} className={FIELD} placeholder="e.g. March cohort" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                ) : null}
                {previousDay1Attendance === false ? (
                  <p className="text-sm text-slate-600">
                    Heads up: Day 2 builds on Day 1, so you will need to know the Day 1 material.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {current.key === "about" ? (
          <>
            <Choice legend="Your AI level" columns={3}>
              {([
                ["NEW", "New to it"],
                ["SOMETIMES", "Use it sometimes"],
                ["DAILY", "Use it daily"],
              ] as const).map(([value, label]) => (
                <ChoiceOption
                  key={value}
                  name="aiExperienceLevel"
                  checked={aiExperienceLevel === value}
                  onChange={() => form.setValue("aiExperienceLevel", value)}
                >
                  {label}
                </ChoiceOption>
              ))}
            </Choice>

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="aiUseCase"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>One task you&apos;d love AI to do for you (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} className={FIELD_AREA} rows={3} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <fieldset className="grid content-start gap-2">
                <legend className="mb-2 text-sm font-medium">Subscriptions you have</legend>
                <div className="grid grid-cols-2 gap-2">
                  {SUBSCRIPTION_OPTIONS.map((option) => (
                    <label
                      key={option}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-brand-50"
                    >
                      <Checkbox
                        checked={subscriptions.includes(option)}
                        onCheckedChange={(checked) => {
                          const currentSubscriptions = form.getValues("subscriptions");
                          form.setValue(
                            "subscriptions",
                            checked
                              ? [...currentSubscriptions, option]
                              : currentSubscriptions.filter((item) => item !== option)
                          );
                        }}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <FormField
              control={form.control}
              name="referredBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referred by (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} className={FIELD} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Checkbox
                  checked={form.watch("ageConfirmed") === true}
                  onCheckedChange={(checked) =>
                    form.setValue("ageConfirmed", checked === true ? true : (undefined as unknown as true))
                  }
                />
                I confirm I am 16 or older
              </label>
              {form.formState.errors.ageConfirmed ? (
                <p className="mt-2 text-sm text-destructive">{form.formState.errors.ageConfirmed.message}</p>
              ) : null}
            </div>
          </>
        ) : null}

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-6">
          {step > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="h-12 rounded-full px-5 font-semibold"
              onClick={() => setStep((currentStep) => currentStep - 1)}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={isSubmitting} size="lg" className="h-12 rounded-full px-8 text-[15px] font-bold">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {isLastStep ? "Continue to payment" : "Next"}
            {isLastStep ? null : <ArrowRight className="size-4" />}
          </Button>
        </div>
      </form>

      {/* A heads-up, never a gate: Day 2 alone stays bookable. */}
      <Dialog open={day1NoticeOpen} onOpenChange={setDay1NoticeOpen}>
        <DialogContent className="rounded-[24px] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Day 2 builds on Day 1</DialogTitle>
            <DialogDescription>
              You need to know the Day 1 material to attend Day 2. You can still book Day 2 only, or switch to
              Both days.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                form.setValue("workshopPackage", "BOTH");
                setDay1NoticeOpen(false);
              }}
            >
              Switch to Both days
            </Button>
            <Button type="button" className="rounded-full" onClick={() => setDay1NoticeOpen(false)}>
              Continue with Day 2
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Form>
  );
}

// The form is the first five steps; payment and the thank-you screen
// (rendered by PaymentStep) complete the count shown in the progress bar.
const STEPS: { key: "name" | "basics" | "company" | "days" | "about"; title: string; fields: (keyof FormValues)[] }[] = [
  { key: "name", title: "What's your name?", fields: ["fullName"] },
  { key: "basics", title: "Your basic details", fields: ["email", "whatsappNumber", "designation"] },
  { key: "company", title: "Company details", fields: ["company", "gstCompanyName", "gstin"] },
  { key: "days", title: "Which days are you joining?", fields: ["workshopPackage"] },
  { key: "about", title: "A little about you", fields: ["aiExperienceLevel", "ageConfirmed"] },
];

// Plain bordered fields for the public page; the app's filled pill inputs
// read as disabled on a white card.
const FIELD = "h-12 rounded-xl border-slate-200 bg-white px-4 focus-visible:border-primary";
const FIELD_AREA = "rounded-xl border-slate-200 bg-white px-4 py-3 focus-visible:border-primary";

function Choice({
  legend,
  columns = 2,
  children,
}: {
  legend: string;
  columns?: 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-medium">{legend}</legend>
      <div className={`grid gap-2 ${columns === 3 ? "sm:grid-cols-3" : "grid-cols-2"}`}>{children}</div>
    </fieldset>
  );
}

// A native radio, visually a tappable tile, so keyboard and screen-reader
// behaviour come from the browser rather than custom code.
function ChoiceOption({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value?: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`relative flex cursor-pointer flex-col justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 ${
        checked ? "border-primary bg-brand-50 text-brand-800 ring-1 ring-primary" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}
