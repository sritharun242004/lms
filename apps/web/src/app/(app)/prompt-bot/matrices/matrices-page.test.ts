/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), redirect: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { promptMatrix: { findMany: mocks.findMany } } }));
afterEach(cleanup);

import MatricesPage from "./page";

describe("Prompt Bot matrices page", () => {
  it("sends participants back to Prompt Bot", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE" });
    await MatricesPage();
    expect(mocks.redirect).toHaveBeenCalledWith("/prompt-bot");
  });

  it("lists matrices with a built-in badge for coaches", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    mocks.findMany.mockResolvedValue([
      { id: "pbm_core", slug: "core", name: "Design Think", description: null, kind: "CORE", isBuiltIn: true, isActive: true, questions: [] },
    ]);
    render(await MatricesPage());
    expect(screen.getByRole("heading", { name: "Question matrices" })).toBeTruthy();
    expect(screen.getByText("Design Think")).toBeTruthy();
    expect(screen.getByText("Built-in")).toBeTruthy();
  });
});
