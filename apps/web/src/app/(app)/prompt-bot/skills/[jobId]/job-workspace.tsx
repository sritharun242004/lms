"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Pencil, Trash2 } from "lucide-react";
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
  const [step, setStep] = React.useState<JobStep>("job");
  const [stalledFor, setStalledFor] = React.useState("");
  const confirmRef = React.useRef<ConfirmDialogHandle>(null);

  // Without the AI key there is nothing to score with: edits still save, and the bars never report a failure.
  const state = useMatrixAnswers({
    initialAnswers: initial.answers,
    initialRevision: initial.scoreRevision,
    saveAnswer: (questionId, patch, options) => saveJobAnswer(initial.id, questionId, patch, options),
    score: aiConfigured ? (revision) => scoreJob(initial.id, revision) : null,
  });
  const { bumpRevision, scheduleScore, queueSave } = state;
  const rescore = React.useCallback(() => {
    bumpRevision();
    scheduleScore();
  }, [bumpRevision, scheduleScore]);

  // A job that was never scored (fresh from the home page) gets its bars once.
  const [neverScored] = React.useState(initial.answers.length === 0 && initial.description.trim() !== "");
  React.useEffect(() => {
    if (neverScored) scheduleScore();
  }, [neverScored, scheduleScore]);

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

  // Analysis and generation run after their requests return, so the job is polled while either is running.
  const key = pollKey(job);
  const stalled = key !== "" && stalledFor === key;
  React.useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = POLL_FIRST_MS;
    let waited = 0;
    const poll = async () => {
      const result = await getJob(initial.id);
      if (cancelled) return;
      if (result.ok) {
        const fresh = result.data;
        const { analysed } = mergePolled(jobRef.current, fresh);
        setJob((current) => mergePolled(current, fresh).job);
        if (analysed) rescore();
      }
      waited += delay;
      if (waited >= POLL_CAP_MS) return setStalledFor(key);
      delay = nextPollDelay(delay);
      timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, initial.id, rescore]);

  function updateDescription(value: string) {
    setDescription(value);
    bumpRevision();
    queueSave("description", async (options) => {
      const saved = await patchJob(initial.id, { description: value }, options);
      if (!saved.ok) toast.error(saved.message);
      scheduleScore();
    });
  }

  const onFileChange = React.useCallback(
    (file: JobFileView) => {
      const previous = jobRef.current.files.find((f) => f.id === file.id);
      setJob((j) => ({
        ...j,
        files: j.files.some((f) => f.id === file.id) ? j.files.map((f) => (f.id === file.id ? file : f)) : [...j.files, file],
      }));
      const analysisChanged = file.analysisStatus === "READY" && (previous?.analysisStatus !== "READY" || previous.analysis !== file.analysis);
      if (analysisChanged) rescore();
    },
    [rescore],
  );

  const onFileRemoved = React.useCallback(
    (fileId: string) => {
      setJob((j) => ({
        ...j,
        files: j.files.filter((f) => f.id !== fileId),
        skills: j.skills.map((s) => (s.fileIds.includes(fileId) ? { ...s, fileIds: s.fileIds.filter((id) => id !== fileId) } : s)),
      }));
      rescore();
    },
    [rescore],
  );

  const onSkillChange = React.useCallback((skill: JobSkillView) => {
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
    job: null,
    files: { value: String(job.files.length), label: "files" },
    questions: { value: `${ready.answered} of ${ready.relevant}`, label: "answered" },
    skills: { value: String(job.skills.length), label: "skills" },
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
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
        <ol className="flex flex-wrap gap-2">
          {JOB_STEPS.map((s, i) => {
            const current = step === s.id;
            const badge = badges[s.id];
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    current ? "bg-primary text-primary-foreground" : "bg-white/55 text-muted-foreground hover:bg-white/80 hover:text-foreground dark:bg-white/5 dark:hover:bg-white/10",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("flex size-5 items-center justify-center rounded-full text-xs tabular-nums", current ? "bg-white/20" : "bg-black/5 dark:bg-white/10")}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                  {badge && (
                    <span className={cn("rounded-full px-1.5 text-xs tabular-nums", current ? "bg-white/20" : "bg-black/5 dark:bg-white/10")}>
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

      <div hidden={step !== "job"}>
        <DescribePanel jobId={job.id} description={description} onDescriptionChange={updateDescription} />
      </div>
      <div hidden={step !== "files"}>
        <FilesPanel jobId={job.id} files={job.files} aiConfigured={aiConfigured} onFileChange={onFileChange} onFileRemoved={onFileRemoved} />
      </div>
      <div hidden={step !== "questions"}>
        <QuestionsPanel matrix={job.matrix} state={state} />
      </div>
      <div hidden={step !== "skills"}>
        <SkillsPanel
          job={job}
          gaps={gaps}
          aiConfigured={aiConfigured}
          flushSaves={state.flushSaves}
          onJobChange={onJobChange}
          onSkillChange={onSkillChange}
          onSkillRemoved={onSkillRemoved}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Your job, files and answers are stored in the LMS and sent to Anthropic&apos;s API to build your skills.
      </p>
      <ConfirmDialog ref={confirmRef} />
    </div>
  );
}
