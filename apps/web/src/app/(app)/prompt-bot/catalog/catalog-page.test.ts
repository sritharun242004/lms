/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), redirect: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { skillCatalogEntry: { findMany: mocks.findMany } } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
); // Radix Switch measures itself when it sits inside a form
afterEach(cleanup);

import SkillCatalogPage from "./page";

const row = (over: Record<string, unknown>) => ({
  id: "scat_x",
  slug: "x",
  name: "X",
  description: "Does x things very well.",
  sourceUrl: "https://github.com/a/b",
  license: "MIT",
  bundlable: false,
  installNotes: "",
  tags: [],
  isActive: true,
  createdById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe("Skill catalog page", () => {
  it("sends participants back to the Skills Builder", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "p1", role: "MENTEE" });
    await SkillCatalogPage();
    expect(mocks.redirect).toHaveBeenCalledWith("/prompt-bot/skills");
  });

  it("lists entries and allows bundlable only for a permissive license", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "MENTOR" });
    mocks.findMany.mockResolvedValue([
      row({ id: "scat_impeccable", slug: "impeccable", name: "Impeccable", license: "Apache-2.0", bundlable: true }),
      row({ id: "scat_old", slug: "old-skill", name: "Old skill", isActive: false }),
      row({ id: "scat_pptx", slug: "pptx", name: "PowerPoint", license: "source-available" }),
    ]);
    render(await SkillCatalogPage());
    expect(screen.getByRole("heading", { name: "Skill catalog" })).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();
    const bundlable = () => screen.getByRole("switch", { name: "Bundlable" }) as HTMLButtonElement;
    expect(bundlable().disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /PowerPoint/ }));
    expect((screen.getByLabelText("License") as HTMLInputElement).value).toBe("source-available");
    expect(bundlable().disabled).toBe(true);
  });
});
