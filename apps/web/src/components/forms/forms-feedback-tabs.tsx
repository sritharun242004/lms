"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormsRepository, type FormRow } from "@/components/forms/forms-repository";
import { FeedbackDashboard } from "@/components/forms/feedback-dashboard";
import { FeedbackSubmissionsTable } from "@/components/forms/feedback-submissions-table";

// Forms and Feedback share one nav item and one page, but stay two
// logically separate tabs internally — neither view's data or
// components are merged, just presented together.
export function FormsFeedbackTabs({
  forms,
  initialTab = "forms",
}: {
  forms: FormRow[];
  initialTab?: "forms" | "feedback";
}) {
  return (
    <Tabs defaultValue={initialTab} className="mx-auto flex max-w-5xl flex-col gap-6">
      <TabsList>
        <TabsTrigger value="forms">Forms</TabsTrigger>
        <TabsTrigger value="feedback">Feedback</TabsTrigger>
      </TabsList>
      <TabsContent value="forms">
        <FormsRepository forms={forms} />
      </TabsContent>
      <TabsContent value="feedback" className="flex flex-col gap-6">
        <FeedbackDashboard />
        <FeedbackSubmissionsTable />
      </TabsContent>
    </Tabs>
  );
}
