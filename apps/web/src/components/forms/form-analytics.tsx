"use client";

import { ChartColumn, Download, FileText, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormResponsesTable } from "@/components/forms/form-responses-table";
import type { QuestionSummary, ResponseTable } from "@/lib/forms/analytics";
import { answerFilePath } from "@/lib/forms/file-links";

export type FormAnalyticsData = {
  formId: string;
  title: string;
  totalResponses: number;
  invitationsSent: number;
  completionRate: number | null;
  publicLinkResponses: number;
  questionSummaries: QuestionSummary[];
  responseTable: ResponseTable;
};

export function FormAnalytics({ analytics }: { analytics: FormAnalyticsData }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[.14em] text-primary uppercase">Analytics</p>
          <h1 className="text-2xl font-bold">{analytics.title}</h1>
        </div>
        <Button asChild variant="outline">
          <a href={`/api/v1/forms/${analytics.formId}/responses/export`}>
            <Download className="size-4" /> Export CSV
          </a>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total responses</p>
            <p className="text-2xl font-bold">{analytics.totalResponses}</p>
            {analytics.publicLinkResponses > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">{analytics.publicLinkResponses} via public link</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Invitations sent</p>
            <p className="text-2xl font-bold">{analytics.invitationsSent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Answered in chat</p>
            <p className="text-2xl font-bold">
              {analytics.completionRate === null ? "—" : `${Math.round(analytics.completionRate * 100)}%`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="summary" className="gap-4">
        <TabsList aria-label="Analytics view">
          <TabsTrigger value="summary">
            <ChartColumn aria-hidden="true" /> Summary
          </TabsTrigger>
          <TabsTrigger value="responses">
            <Table2 aria-hidden="true" /> Responses
          </TabsTrigger>
        </TabsList>

        {/* The table breaks out of this narrow column so long rows have room;
            it stays centred on the page and never wider than the viewport. */}
        <TabsContent value="responses" className="relative left-1/2 w-[min(80rem,calc(100vw-2rem))] -translate-x-1/2">
          <FormResponsesTable table={analytics.responseTable} />
        </TabsContent>

        <TabsContent value="summary" className="flex flex-col gap-4">
        {analytics.questionSummaries.map((summary) => (
          <Card key={summary.questionId}>
            <CardContent className="p-5">
              <p className="mb-3 font-medium">{summary.title}</p>
              {summary.type === "CHOICE" ? (
                <div className="flex flex-col gap-2">
                  {Object.entries(summary.counts).map(([option, count]) => (
                    <div key={option} className="flex items-center gap-2 text-sm">
                      <span className="w-32 shrink-0 truncate">{option}</span>
                      <div className="h-2 flex-1 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{
                            width: `${(count / Math.max(1, Math.max(...Object.values(summary.counts)))) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-right text-muted-foreground">{count}</span>
                    </div>
                  ))}
                </div>
              ) : summary.type === "RATING" ? (
                <p className="text-sm">
                  Average: <span className="font-semibold">{summary.average.toFixed(1)}</span>
                </p>
              ) : summary.type === "FILES" ? (
                summary.files.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No files yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {summary.files.map((file) => (
                      <li key={file.fileId}>
                        <a
                          href={answerFilePath(file.fileId)}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-2 text-primary hover:underline"
                        >
                          <FileText className="size-4" aria-hidden="true" />
                          {file.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {summary.answers.length === 0 ? <li>No answers yet.</li> : summary.answers.map((answer, i) => <li key={i}>{answer}</li>)}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
