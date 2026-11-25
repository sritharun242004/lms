"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Download, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogHandle } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { NotConfigured } from "@/components/prompt-bot/not-configured";
import { useMatrixAnswers } from "@/components/prompt-bot/use-matrix-answers";
import { readiness } from "@/lib/prompt-bot/scoring";
import { downloadZip } from "@/lib/skills/client";
import { deleteJob, getJob, jobDownloadUrl, patchJob, saveJobAnswer, scoreJob } from "@/lib/skills/jobs/client";
import type { JobFileView, JobSkillView, JobView } from "@/lib/skills/jobs/types";
import { JOB_LIMITS } from "@/lib/skills/limits";
import { cn } from "@/lib/utils";
import { DescribePanel } from "./describe-panel";
import { FilesPanel } from "./files-panel";
import { JOB_STEPS, mergePolled, nextPollDelay, POLL_CAP_MS, POLL_FIRST_MS, pollKey, stepFromHash, unansweredCount, type JobStep } from "./job-steps";
import { QuestionsPanel } from "./questions-panel";
import { SkillsPanel } from "./skills-panel";

type Props = { initial: JobView; aiConfigured: boolean; isAdmin: boolean };

export function JobWorkspace({ initial, aiConfigured, isAdmin }: Props) {
  const router = useRouter();
  const [job, setJob] = React.useState(initial);
  const jobRef = React.useRef(job);
  React.useEffect(() => {
    jobRef.current = job;
  });
  const [description, setDescription] = React.useState(initial.description);
  const [title, setTitle] = React.useState(initial.title);
  const [editingTitle, setEditingTitle] = React.useState(false);
  /** Set once a rename is committed, so Enter followed by the input's blur saves it only once. */
  const titleCommitted = React.useRef(false);
  const [step, setStep] = React.useState<JobStep>("task");
  const [stalledFor, setStalledFor] = React.useState("");
  /** Set when a poll finds the job gone (deleted in another tab): polling stops and the page says so. */
  const [deleted, setDeleted] = React.useState(false);
  /**
   * Bumped whenever a row starts waiting again (re-analyse, Generate v2). A poll sent before that
   * would copy the row's older finished state back over it, so its reply is not merged.
   */
  const restarts = React.useRef(0);
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);

  // Without the AI key there is nothing to score with: edits still save, and the bars never report a failure.
  const state = useMatrixAnswers({
    initialAnswers: initial.answers,
    initialRevision: initial.scoreRevision,
    saveAnswer: (questionId, patch, options) => saveJobAnswer(initial.id, questionId, patch, options),
    score: aiConfigured ? (revision) => scoreJob(initial.id, revision) : null,
  });
  // Scoring runs only when asked ("Check answer" / "Check all"). A change to what answers are scored
  // against (description, file analyses) flags the bars as out of date instead of rescoring.
  const { markStale, check, queueSave } = state;

  // A job that was never scored (fresh from the home page) gets its bars once. The ref keeps a
  // development double-run of this effect from paying for a second check.
  const [neverScored] = React.useState(initial.answers.length === 0 && initial.description.trim() !== "");
  const firstCheck = React.useRef(false);
  React.useEffect(() => {
    if (!neverScored || !aiConfigured || firstCheck.current) return;
    firstCheck.current = true;
    markStale();
    void check();
  }, [neverScored, aiConfigured, markStale, check]);

  // The step lives in the URL hash, so reload and Back keep it.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the hash is browser-only state, read after hydration
    setStep(stepFromHash(window.location.hash));
    const read = () => setStep(stepFromHash(window.location.hash));
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  function go(next: JobStep) {
    setStep(next);
    window.history.replaceState(null, "", `#${next}`);
  }
  // Moving with the Back/Next buttons at the bottom also brings the new step's top into view.
  function goAndScroll(next: JobStep) {
    go(next);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  const stepIndex = JOB_STEPS.findIndex((s) => s.id === step);
  const prevStep = stepIndex > 0 ? JOB_STEPS[stepIndex - 1] : null;
  const nextStep = stepIndex < JOB_STEPS.length - 1 ? JOB_STEPS[stepIndex + 1] : null;

  // Analysis and generation run after their requests return, so the job is polled while either is running.
  // A hidden tab stops polling until it is shown again; the time hidden doesn't count towards the cap.
  const key = pollKey(job);
  const stalled = key !== "" && stalledFor === key;
  React.useEffect(() => {
    if (!key || deleted) return;
    let cancelled = false;
    let paused = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = POLL_FIRST_MS;
    let waited = 0;
    const poll = async () => {
      if (document.visibilityState === "hidden") {
        paused = true;
        return;
      }
      const sentAt = restarts.current;
      const result = await getJob(initial.id);
      if (cancelled) return;
      if (!result.ok && result.code === "NOT_FOUND") return setDeleted(true);
      if (result.ok && sentAt === restarts.current) {
        const fresh = result.data;
        const { analysed } = mergePolled(jobRef.current, fresh);
        setJob((current) => mergePolled(current, fresh).job);
        if (analysed) markStale();
      }
      waited += delay;
      if (waited >= POLL_CAP_MS) return setStalledFor(key);
      delay = nextPollDelay(delay);
      timer = setTimeout(poll, delay);
    };
    const onVisibility = () => {
      if (!paused || document.visibilityState === "hidden") return;
      paused = false;
      void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    timer = setTimeout(poll, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, deleted, initial.id, markStale]);

  function updateDescription(value: string) {
    setDescription(value);
    markStale();
    queueSave("description", async (options) => {
      const saved = await patchJob(initial.id, { description: value }, options);
      if (!saved.ok) toast.error(saved.message);
    });
  }

  const onFileChange = React.useCallback(
    (file: JobFileView) => {
      const previous = jobRef.current.files.find((f) => f.id === file.id);
      if (file.analysisStatus === "PENDING") restarts.current += 1;
      setJob((j) => ({
        ...j,
        files: j.files.some((f) => f.id === file.id) ? j.files.map((f) => (f.id === file.id ? file : f)) : [...j.files, file],
      }));
      const analysisChanged = file.analysisStatus === "READY" && (previous?.analysisStatus !== "READY" || previous.analysis !== file.analysis);
      if (analysisChanged) markStale();
    },
    [markStale],
  );

  const onFileRemoved = React.useCallback(
    (fileId: string) => {
      setJob((j) => ({
        ...j,
        files: j.files.filter((f) => f.id !== fileId),
        skills: j.skills.map((s) => (s.fileIds.includes(fileId) ? { ...s, fileIds: s.fileIds.filter((id) => id !== fileId) } : s)),
      }));
      markStale();
    },
    [markStale],
  );

  const onSkillChange = React.useCallback((skill: JobSkillView) => {
    if (skill.status === "GENERATING") restarts.current += 1;
    setJob((j) => ({
      ...j,
      skills: j.skills.some((s) => s.id === skill.id) ? j.skills.map((s) => (s.id === skill.id ? skill : s)) : [...j.skills, skill],
    }));
  }, []);
  const onSkillRemoved = React.useCallback((skillId: string) => {
    setJob((j) => ({ ...j, skills: j.skills.filter((s) => s.id !== skillId) }));
  }, []);
  const onJobChange = React.useCallback((next: JobView) => {
    setJob((j) => ({ ...j, skills: next.skills, suggestedAt: next.suggestedAt }));
  }, []);

  function startRename() {
    titleCommitted.current = false;
    setTitle(job.title);
    setEditingTitle(true);
  }

  async function saveTitle(event?: React.FormEvent) {
    event?.preventDefault();
    if (titleCommitted.current) return;
    titleCommitted.current = true;
    setEditingTitle(false);
    const value = title.trim();
    if (!value || value === job.title) return setTitle(job.title);
    const result = await patchJob(job.id, { title: value });
    if (!result.ok) {
      toast.error(result.message);
      return setTitle(job.title);
    }
    setJob((j) => ({ ...j, title: result.data.title }));
    setTitle(result.data.title);
  }

  async function remove() {
    const confirmed = await confirmRef.current?.open({
      title: "Delete this job?",
      description: "This deletes its files, answers, skills and every version. It can't be undone.",
      confirmLabel: "Delete job",
      destructive: true,
    });
    if (!confirmed) return;
    const result = await deleteJob(job.id);
    if (!result.ok) return void toast.error(result.message);
    router.push("/prompt-bot/skills");
  }

  const [downloading, setDownloading] = React.useState(false);
  async function downloadAll() {
    if (downloading) return;
    setDownloading(true);
    const result = await downloadZip(jobDownloadUrl(job.id));
    setDownloading(false);
    if (!result.ok) toast.error(result.message);
  }

  const answers = job.matrix.questions.map((q) => state.answerFor(q.id));
  const ready = readiness(answers);
  const gaps = unansweredCount(job.matrix.questions, state.answerFor);
  const canDownload = job.skills.some((s) => s.latestVersion > 0);
  const badges: Record<JobStep, { value: string; label: string } | null> = {
    task: null,
    questions: { value: `${ready.answered} of ${ready.relevant}`, label: "answered" },
    skills: { value: String(job.skills.length), label: "skills" },
  };
  const done: Record<JobStep, boolean> = {
    task: description.trim() !== "",
    questions: ready.answered > 0,
    skills: canDownload,
  };

  if (deleted) {
    return (
      <div className="glass mx-auto flex max-w-xl flex-col items-center gap-3 rounded-[1.75rem] px-5 py-10 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-balance">This job was deleted</h1>
        <p className="max-w-md text-sm text-pretty text-muted-foreground">
          It may have been deleted in another tab or window. Its files, answers and skills are gone too.
        </p>
        <Button asChild size="lg" className="mt-1">
          <Link href="/prompt-bot/skills">
            <ArrowLeft className="size-4" aria-hidden />
            Back to your jobs
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          {editingTitle ? (
            <form onSubmit={saveTitle} className="max-w-xl">
              <label htmlFor="job-title" className="sr-only">
                Job title
              </label>
              <Input
                id="job-title"
                autoFocus
                value={title}
                maxLength={JOB_LIMITS.titleChars}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => void saveTitle()}
                className="h-11 text-lg font-semibold"
              />
            </form>
          ) : (
            <div className="flex min-w-0 items-center gap-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight" title={job.title}>
                {job.title}
              </h1>
              <Button variant="ghost" size="icon" aria-label="Rename job" className="size-11 shrink-0 text-muted-foreground hover:text-foreground" onClick={startRename}>
                <Pencil className="size-4" aria-hidden />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="lg" disabled={!canDownload || downloading} aria-busy={downloading || undefined} onClick={() => void downloadAll()}>
            {downloading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            Download all skills
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete job"
            className="size-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void remove()}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </header>

      {!aiConfigured && <NotConfigured isAdmin={isAdmin} />}

      <nav aria-label="Steps">
        <ol className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {JOB_STEPS.map((s, i) => {
            const current = step === s.id;
            const badge = badges[s.id];
            const complete = done[s.id] && !current;
            return (
              <li key={s.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    current ? "bg-primary text-primary-foreground" : "bg-white/55 text-muted-foreground hover:bg-white/80 hover:text-foreground dark:bg-white/5 dark:hover:bg-white/10",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-xs tabular-nums",
                      current ? "bg-white/20" : complete ? "bg-success/15 text-success" : "bg-black/5 dark:bg-white/10",
                    )}
                  >
                    {complete ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  {s.label}
                  {complete && <span className="sr-only"> (done)</span>}
                  {badge && (
                    <span className={cn("ml-auto rounded-full px-1.5 sm:ml-0 text-xs tabular-nums", current ? "bg-white/20" : "bg-black/5 dark:bg-white/10")}>
                      {badge.value}
                      <span className="sr-only"> {badge.label}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div role="status">
        {stalled && (
          <p className="rounded-xl bg-warning/10 px-3 py-2 text-sm">
            Still working. This is taking longer than usual. Refresh this page later to see the result.
          </p>
        )}
      </div>

      <div hidden={step !== "task"}>
        <DescribePanel jobId={job.id} description={description} onDescriptionChange={updateDescription} />
      </div>
      <div hidden={step !== "questions"} className="flex flex-col gap-5">
        <QuestionsPanel matrix={job.matrix} state={state} />
        <FilesPanel jobId={job.id} files={job.files} aiConfigured={aiConfigured} onFileChange={onFileChange} onFileRemoved={onFileRemoved} />
      </div>
      <div hidden={step !== "skills"}>
        <SkillsPanel
          job={job}
          gaps={gaps}
          aiConfigured={aiConfigured}
          flushSaves={state.flushSaves}
          queueSave={queueSave}
          onJobChange={onJobChange}
          onSkillChange={onSkillChange}
          onSkillRemoved={onSkillRemoved}
        />
      </div>

      <nav aria-label="Step navigation" className="flex items-center justify-between gap-3">
        {prevStep ? (
          <Button type="button" variant="ghost" onClick={() => goAndScroll(prevStep.id)}>
            <ArrowLeft className="size-4" aria-hidden />
            Back: {prevStep.label}
          </Button>
        ) : (
          <span />
        )}
        {nextStep && (
          <Button type="button" onClick={() => goAndScroll(nextStep.id)}>
            Next: {nextStep.label}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        )}
      </nav>

      <p className="text-center text-xs text-muted-foreground">
        Your job, files and answers are stored in the LMS and sent to Anthropic&apos;s API to build your skills.
      </p>
      <ConfirmDialog ref={confirmRef} />
    </div>
  );
}
