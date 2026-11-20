import { prisma } from "@/lib/db/prisma";
import { requireStaff } from "./form-service";

type Actor = { id: string; role: string };

export type FeedbackAggregate = {
  targetType: string;
  targetLabel: string;
  responseCount: number;
  averagesByQuestion: { questionId: string; questionTitle: string; average: number }[];
};

// Trainer-wise / session-wise / staff-wise feedback summaries: every
// FEEDBACK-category form that has a feedbackTargetType/Label set groups
// into one row here, with the average of its rating-shaped questions
// (LINEAR_SCALE/STAR_RATING) — the master prompt's "trainer-wise,
// session-wise... analytics" requirement, computed generically rather
// than through bespoke per-target tables.
export async function getFeedbackAggregates(actor: Actor): Promise<FeedbackAggregate[]> {
  requireStaff(actor);

  const forms = await prisma.form.findMany({
    where: {
      category: "FEEDBACK",
      feedbackTargetType: { not: null },
      ...(actor.role === "ADMIN" ? {} : { createdById: actor.id }),
    },
    include: {
      sections: { include: { questions: true } },
      responses: { include: { answers: true } },
    },
  });

  return forms.map((form) => {
    const ratingQuestions = form.sections
      .flatMap((s) => s.questions)
      .filter((q) => q.type === "LINEAR_SCALE" || q.type === "STAR_RATING");

    const averagesByQuestion = ratingQuestions.map((question) => {
      const values = form.responses
        .flatMap((r) => r.answers)
        .filter((a) => a.questionId === question.id && typeof a.value === "number")
        .map((a) => a.value as number);
      const average = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
      return { questionId: question.id, questionTitle: question.title, average };
    });

    return {
      targetType: form.feedbackTargetType ?? "GENERAL",
      targetLabel: form.feedbackTargetLabel ?? form.title,
      responseCount: form.responses.length,
      averagesByQuestion,
    };
  });
}
