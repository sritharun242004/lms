/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackDashboard } from "./feedback-dashboard";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

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
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/v1/feedback/word-cloud")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: { entries: [{ word: "great", count: 3, responseIds: ["r1"] }] } }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          aggregates: [
            { targetType: "TRAINER", targetLabel: "Mehul Nanavati", responseCount: 4, averagesByQuestion: [{ questionId: "q1", questionTitle: "Overall", average: 4.5 }] },
          ],
        },
      }),
    });
  }) as unknown as typeof fetch;
});

describe("FeedbackDashboard", () => {
  it("shows trainer-wise aggregates and the word cloud section", async () => {
    render(createElement(FeedbackDashboard));
    await waitFor(() => expect(screen.getByText("Mehul Nanavati")).toBeTruthy());
    expect(screen.getByText(/4\.5/)).toBeTruthy();
    expect(screen.getByText(/word frequency only/i)).toBeTruthy();
  });
});
