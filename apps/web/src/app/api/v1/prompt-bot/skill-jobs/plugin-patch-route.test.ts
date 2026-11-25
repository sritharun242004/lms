import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), updateJob: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/claude", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/skills/jobs/jobs", () => ({ updateJob: mocks.updateJob, loadJobView: vi.fn(), deleteJob: vi.fn() }));

import { PluginGeneratingError } from "@/lib/skills/jobs/errors";
import * as job from "./[id]/route";

const req = (body: unknown) => new NextRequest("http://localhost/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: "j1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "MENTEE" });
  mocks.updateJob.mockResolvedValue({ id: "j1" });
});

describe("PATCH /skill-jobs/:id plugin fields", () => {
  it("passes company and plugin names through, null meaning the default", async () => {
    const res = await job.PATCH(req({ company: "Acme", pluginName: "Acme Deck", pluginDisplayName: null }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.updateJob).toHaveBeenCalledWith("j1", "u1", { company: "Acme", pluginName: "Acme Deck", pluginDisplayName: null });
  });

  it("accepts an empty company and rejects out-of-range values", async () => {
    expect((await job.PATCH(req({ company: "" }), ctx)).status).toBe(200);
    expect((await job.PATCH(req({ company: "x".repeat(81) }), ctx)).status).toBe(400);
    expect((await job.PATCH(req({ pluginName: "" }), ctx)).status).toBe(400);
    expect((await job.PATCH(req({ pluginName: "x".repeat(121) }), ctx)).status).toBe(400);
    expect((await job.PATCH(req({ pluginDisplayName: "  " }), ctx)).status).toBe(400);
    expect((await job.PATCH(req({ pluginDisplayName: "x".repeat(121) }), ctx)).status).toBe(400);
  });

  it("answers 409 ALREADY_GENERATING while the plugin is being written", async () => {
    mocks.updateJob.mockRejectedValue(new PluginGeneratingError());
    const res = await job.PATCH(req({ pluginName: "deck" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ALREADY_GENERATING");
  });
});
