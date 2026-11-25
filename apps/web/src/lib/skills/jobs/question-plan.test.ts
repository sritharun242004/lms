import { describe, expect, it } from "vitest";
import { planQuestionChanges, type ExistingRow, type NextRow } from "./task-questions";

const ex = (id: string, text: string, over: Partial<ExistingRow> = {}): ExistingRow => ({ id, text, kind: "FIXED", source: "AI", ...over });
const nx = (text: string, over: Partial<NextRow> = {}): NextRow => ({
  kind: "FIXED", text, guidance: `g:${text}`, required: true, wantsFiles: false, fileHint: null, fileNote: "", ...over,
});

describe("planQuestionChanges", () => {
  it("writes every question new on the first run", () => {
    const plan = planQuestionChanges([], [nx("A?"), nx("Client name", { kind: "PER_USE" })]);
    expect(plan.keep).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.create.map((c) => [c.text, c.kind, c.order])).toEqual([["A?", "FIXED", 0], ["Client name", "PER_USE", 1]]);
  });

  it("keeps a row whose wording comes back, refreshing an AI row of the same kind", () => {
    const plan = planQuestionChanges(
      [ex("q1", "Which template?"), ex("q2", "Old question?")],
      [nx("New first?"), nx("which   TEMPLATE", { wantsFiles: true, fileHint: "TEMPLATE", fileNote: "Upload it." })],
    );
    expect(plan.keep).toEqual([{ id: "q1", data: { order: 1, guidance: "g:which   TEMPLATE", wantsFiles: true, fileHint: "TEMPLATE", fileNote: "Upload it." } }]);
    expect(plan.create.map((c) => [c.text, c.order])).toEqual([["New first?", 0]]);
    expect(plan.remove).toEqual(["q2"]);
  });

  it("matches across kinds but keeps the row's kind and only reorders it", () => {
    const plan = planQuestionChanges([ex("p1", "Client name", { kind: "PER_USE" })], [nx("Client name?")]);
    expect(plan.keep).toEqual([{ id: "p1", data: { order: 0 } }]);
    expect(plan.create).toEqual([]);
  });

  it("refreshes only the hint of a per-use AI row", () => {
    const plan = planQuestionChanges([ex("p1", "Client name", { kind: "PER_USE" })], [nx("Client name", { kind: "PER_USE", guidance: "e.g. Acme" })]);
    expect(plan.keep).toEqual([{ id: "p1", data: { order: 0, guidance: "e.g. Acme" } }]);
  });

  it("always keeps the person's own questions, after the new set, and never refreshes them", () => {
    const plan = planQuestionChanges(
      [ex("u1", "My own question?", { source: "USER" }), ex("u2", "Shared wording?", { source: "USER" }), ex("a1", "Dropped?")],
      [nx("Shared wording?"), nx("Fresh?")],
    );
    expect(plan.keep).toEqual([{ id: "u2", data: { order: 0 } }, { id: "u1", data: { order: 2 } }]);
    expect(plan.create.map((c) => [c.text, c.order])).toEqual([["Fresh?", 1]]);
    expect(plan.remove).toEqual(["a1"]);
  });

  it("reuses one existing row once, even when two rows share a wording", () => {
    const plan = planQuestionChanges([ex("q1", "Same?"), ex("q2", "same")], [nx("Same?")]);
    expect(plan.keep.map((k) => k.id)).toEqual(["q1"]);
    expect(plan.remove).toEqual(["q2"]);
  });
});
