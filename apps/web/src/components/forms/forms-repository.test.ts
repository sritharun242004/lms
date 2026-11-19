/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormsRepository } from "./forms-repository";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const forms = [
  { id: "f1", title: "Trainer feedback", status: "PUBLISHED" as const, category: "FEEDBACK" as const, updatedAt: "2026-11-20", _count: { sections: 2, responses: 5 } },
  { id: "f2", title: "Internal survey", status: "DRAFT" as const, category: "GENERIC" as const, updatedAt: "2026-11-19", _count: { sections: 1, responses: 0 } },
];

describe("FormsRepository", () => {
  it("lists forms and filters by status", () => {
    render(createElement(FormsRepository, { forms }));
    expect(screen.getByText("Trainer feedback")).toBeTruthy();
    expect(screen.getByText("Internal survey")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "DRAFT" }));
    expect(screen.queryByText("Trainer feedback")).toBeNull();
    expect(screen.getByText("Internal survey")).toBeTruthy();
  });

  it("duplicates a form", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { form: { id: "f3", title: "Internal survey (copy)", status: "DRAFT", category: "GENERIC" } } }),
    }) as unknown as typeof fetch;

    render(createElement(FormsRepository, { forms }));
    fireEvent.click(screen.getAllByRole("button", { name: /duplicate/i })[0]);

    await waitFor(() => expect(screen.getByText("Internal survey (copy)")).toBeTruthy());
  });
});
