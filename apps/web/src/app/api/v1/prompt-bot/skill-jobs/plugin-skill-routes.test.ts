import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), addSkill: vi.fn(), updateSkill: vi.fn(), deleteSkill: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/skills", () => ({ addSkill: mocks.addSkill, updateSkill: mocks.updateSkill, deleteSkill: mocks.deleteSkill }));

import { MainRequiredError, PluginGeneratingError, TooManySkillsError } from "@/lib/skills/jobs/errors";
import * as skill from "./[id]/skills/[skillId]/route";
import * as skills from "./[id]/skills/route";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "j1" }) };
const skillCtx = { params: Promise.resolve({ id: "j1", skillId: "s1" }) };
const error = async (res: Response) => ({ status: res.status, ...(await res.json()).error });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.addSkill.mockResolvedValue({ id: "s2" });
  mocks.updateSkill.mockResolvedValue({ id: "s1" });
});

describe("plugin skill routes", () => {
  it("adds a sub-skill with label, focus and step", async () => {
    const body = { name: "deck-designer", label: "Design", purpose: "Lays out slides.", focus: "Layout only.", step: "Lay out the slides" };
    expect((await skills.POST(req("POST", body), ctx)).status).toBe(201);
    expect(mocks.addSkill).toHaveBeenCalledWith("j1", "u1", body);
  });

  it("bounds label, focus and step", async () => {
    const base = { name: "x", purpose: "p" };
    expect((await skills.POST(req("POST", { ...base, label: "x".repeat(61) }), ctx)).status).toBe(400);
    expect((await skills.POST(req("POST", { ...base, focus: "x".repeat(601) }), ctx)).status).toBe(400);
    expect((await skills.POST(req("POST", { ...base, step: "x".repeat(161) }), ctx)).status).toBe(400);
    expect((await skill.PATCH(req("PATCH", { label: "x".repeat(61) }), skillCtx)).status).toBe(400);
    expect((await skill.PATCH(req("PATCH", { role: "MAIN" }), skillCtx)).status).toBe(400);
  });

  it("says a plugin has at most 6 sub-skills", async () => {
    mocks.addSkill.mockRejectedValue(new TooManySkillsError());
    expect(await error(await skills.POST(req("POST", { name: "x", purpose: "p" }), ctx))).toMatchObject({
      status: 409,
      code: "TOO_MANY_SKILLS",
      message: "A plugin can have at most 6 sub-skills.",
    });
  });

  it("patches label, focus and step", async () => {
    await skill.PATCH(req("PATCH", { label: "Grammar", focus: "", step: "Check the wording" }), skillCtx);
    expect(mocks.updateSkill).toHaveBeenCalledWith("j1", "s1", "u1", { label: "Grammar", focus: "", step: "Check the wording" });
  });

  it("refuses to remove the main skill and anything while the plugin is written", async () => {
    mocks.deleteSkill.mockRejectedValueOnce(new MainRequiredError());
    expect(await error(await skill.DELETE(req("DELETE"), skillCtx))).toMatchObject({
      status: 409,
      code: "MAIN_REQUIRED",
      message: "The main skill can't be removed. Rename it instead.",
    });
    mocks.deleteSkill.mockRejectedValueOnce(new PluginGeneratingError());
    expect(await error(await skill.DELETE(req("DELETE"), skillCtx))).toMatchObject({ status: 409, code: "ALREADY_GENERATING" });
  });
});
