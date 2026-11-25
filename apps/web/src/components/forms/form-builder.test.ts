/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormBuilder } from "./form-builder";

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
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("question-templates")) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { templates: [] } }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { saved: true } }) });
  }) as unknown as typeof fetch;
});

const baseForm = {
  id: "f1",
  title: "Day 1 feedback",
  description: "",
  status: "DRAFT" as const,
  category: "FEEDBACK" as const,
  isTemplate: false,
  publicLinkEnabled: false,
};

describe("FormBuilder", () => {
  it("adds a section and a short-answer question", () => {
    render(createElement(FormBuilder, { form: baseForm, initialSections: [] }));
    fireEvent.click(screen.getByRole("button", { name: /add section/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "SHORT_ANSWER" } });
    expect(screen.getByDisplayValue("Untitled question")).toBeTruthy();
  });

  it("adds options to a multiple-choice question", () => {
    render(createElement(FormBuilder, { form: baseForm, initialSections: [] }));
    fireEvent.click(screen.getByRole("button", { name: /add section/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "MULTIPLE_CHOICE" } });
    expect(screen.getByDisplayValue("Option 1")).toBeTruthy();
    expect(screen.getByDisplayValue("Option 2")).toBeTruthy();
  });

  it("saves the draft structure via PUT", async () => {
    render(
      createElement(FormBuilder, {
        form: baseForm,
        initialSections: [{ title: "Section 1", description: null, questions: [{ type: "SHORT_ANSWER", title: "Name", description: "", required: true, config: {} }] }],
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/v1/forms/f1/structure", expect.objectContaining({ method: "PUT" }))
    );
  });

  it("disables editing once the form is published", () => {
    render(createElement(FormBuilder, { form: { ...baseForm, status: "PUBLISHED" }, initialSections: [] }));
    expect(screen.queryByRole("button", { name: /add section/i })).toBeNull();
    expect(screen.getByRole("button", { name: /archive/i })).toBeTruthy();
  });

  it("marks the form as a template", async () => {
    render(createElement(FormBuilder, { form: baseForm, initialSections: [] }));
    fireEvent.click(screen.getByRole("switch", { name: /template/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/forms/f1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isTemplate: true }) })
      )
    );
  });

  it("shows the public link once it is switched on, with the link parameters it accepts", async () => {
    render(
      createElement(FormBuilder, {
        form: { ...baseForm, status: "PUBLISHED" as const, publicLinkEnabled: true },
        initialSections: [
          { title: null, description: null, questions: [{ type: "SHORT_ANSWER", title: "Location", description: "", required: false, config: { urlParam: "location" } }] },
        ],
      })
    );
    expect(screen.getByDisplayValue("/f/f1")).toBeTruthy();
    expect(screen.getByText("?location=Chennai")).toBeTruthy();
  });
});
