/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormsRepository } from "./forms-repository";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const forms = [
  { id: "f1", title: "Trainer feedback", status: "PUBLISHED" as const, category: "FEEDBACK" as const, updatedAt: "2026-11-20", isTemplate: false, canEdit: true, _count: { sections: 2, responses: 5 } },
  { id: "f2", title: "Internal survey", status: "DRAFT" as const, category: "GENERIC" as const, updatedAt: "2026-11-19", isTemplate: false, canEdit: true, _count: { sections: 1, responses: 0 } },
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

  it("pins templates in their own group, out of the normal list", () => {
    const template = { ...forms[0], id: "t1", title: "Certificate feedback", isTemplate: true, canEdit: false };
    render(createElement(FormsRepository, { forms: [template, ...forms] }));
    const group = screen.getByRole("region", { name: /templates/i });
    expect(group.textContent).toContain("Certificate feedback");
    expect(screen.getAllByText("Certificate feedback")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /edit template/i })).toBeNull();
  });

  it("uses a template by copying it and opening the copy in the builder", async () => {
    push.mockReset();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { form: { id: "copy1" } } }),
    }) as unknown as typeof fetch;
    const template = { ...forms[0], id: "t1", title: "Certificate feedback", isTemplate: true, canEdit: true };
    render(createElement(FormsRepository, { forms: [template] }));

    fireEvent.click(screen.getByRole("button", { name: /use template/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/forms/copy1/edit"));
    expect(global.fetch).toHaveBeenCalledWith("/api/v1/forms/t1/duplicate", { method: "POST" });
  });

  it("deletes a form only after confirming, warning about its responses", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { responseCount: 5 } }) }) as unknown as typeof fetch;
    render(createElement(FormsRepository, { forms }));

    fireEvent.click(screen.getByRole("button", { name: "Delete Trainer feedback" }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/also deletes its 5 responses/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Trainer feedback")).toBeNull());
    expect(global.fetch).toHaveBeenCalledWith("/api/v1/forms/f1", { method: "DELETE" });
  });

  it("offers no delete on a template someone else owns", () => {
    const template = { ...forms[0], id: "t1", title: "Certificate feedback", isTemplate: true, canEdit: false };
    render(createElement(FormsRepository, { forms: [template] }));
    expect(screen.queryByRole("button", { name: /delete certificate feedback/i })).toBeNull();
  });
});
