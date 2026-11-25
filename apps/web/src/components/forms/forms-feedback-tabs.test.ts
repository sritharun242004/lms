/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormsFeedbackTabs } from "./forms-feedback-tabs";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { aggregates: [], entries: [], submissions: [] } }),
  }) as unknown as typeof fetch;
});

const FORM = {
  id: "f1",
  title: "Day 1 feedback",
  description: null,
  category: "FEEDBACK" as const,
  status: "PUBLISHED" as const,
  updatedAt: "2026-11-20T00:00:00Z",
  isTemplate: false,
  canEdit: true,
  _count: { sections: 1, responses: 2 },
};

describe("FormsFeedbackTabs", () => {
  it("shows the Forms tab by default, with both tabs present", () => {
    render(createElement(FormsFeedbackTabs, { forms: [FORM] }));
    expect(screen.getByRole("tab", { name: /forms/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /feedback/i })).toBeTruthy();
    expect(screen.getByText(/day 1 feedback/i)).toBeTruthy();
  });

  it("opens directly on the Feedback tab when initialTab is feedback", async () => {
    render(createElement(FormsFeedbackTabs, { forms: [FORM], initialTab: "feedback" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /feedback/i }).getAttribute("data-state")).toBe("active"));
  });

  it("switches to the Feedback tab on click", async () => {
    const user = userEvent.setup({ delay: null });
    render(createElement(FormsFeedbackTabs, { forms: [FORM] }));
    await user.click(screen.getByRole("tab", { name: /feedback/i }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /feedback/i }).getAttribute("data-state")).toBe("active"));
  });
});
