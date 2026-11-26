import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isAiConfigured: vi.fn(),
  loadJobView: vi.fn(),
  packFindFirst: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: mocks.isAiConfigured }));
vi.mock("@/lib/skills/jobs/jobs", () => ({ loadJobView: mocks.loadJobView }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillPack: { findFirst: mocks.packFindFirst } } }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("./job-workspace", () => ({ JobWorkspace: () => null }));

import JobPage from "./page";
import { JobWorkspace } from "./job-workspace";

const params = (jobId: string) => ({ params: Promise.resolve({ jobId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "ADMIN" });
  mocks.isAiConfigured.mockReturnValue(true);
});

describe("job page", () => {
  it("sends signed-out visitors to the login page", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(JobPage(params("j1"))).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("renders the workspace for the owner's job", async () => {
    const view = { id: "j1" };
    mocks.loadJobView.mockResolvedValue(view);
    const element = await JobPage(params("j1"));
    expect(mocks.loadJobView).toHaveBeenCalledWith("j1", "u1");
    expect(element.type).toBe(JobWorkspace);
    // No bucket in tests: the page passes the no-S3 cap (20 MB) as the effective limit.
    expect(element.props).toEqual({ initial: view, aiConfigured: true, isAdmin: true, maxFileBytes: 20 * 1024 * 1024 });
  });

  it("redirects an old pack link to the legacy page", async () => {
    mocks.loadJobView.mockResolvedValue(null);
    mocks.packFindFirst.mockResolvedValue({ id: "p1" });
    await expect(JobPage(params("p1"))).rejects.toThrow("NEXT_REDIRECT /prompt-bot/skills/legacy/p1");
    expect(mocks.packFindFirst).toHaveBeenCalledWith({ where: { id: "p1", userId: "u1" }, select: { id: true } });
  });

  it("is 404 when neither a job nor a pack of the user's has that id", async () => {
    mocks.loadJobView.mockResolvedValue(null);
    mocks.packFindFirst.mockResolvedValue(null);
    await expect(JobPage(params("x"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
