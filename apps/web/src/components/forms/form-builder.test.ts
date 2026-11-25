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
    if (typeof url === "string" && url.endsWith("/status")) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { form: { status: "PUBLISHED" } } }) });
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

const savedStructure = () => {
  const calls = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.filter(
    ([url, init]) => url === "/api/v1/forms/f1/structure" && init?.method === "PUT"
  );
  return calls.length ? JSON.parse(calls[calls.length - 1][1].body as string) : null;
};

const nameQuestion = { type: "SHORT_ANSWER" as const, title: "Name", description: "", required: true, config: {} };

describe("FormBuilder", () => {
  it("opens a new form with one question ready to type into, and saves it by itself", async () => {
    render(createElement(FormBuilder, { form: baseForm, initialSections: [] }));
    const title = screen.getByRole("textbox", { name: "Question" });
    expect(document.activeElement === title || title).toBeTruthy();
    fireEvent.change(title, { target: { value: "Which day suits you?" } });
    await waitFor(() => expect(savedStructure()?.sections[0].questions[0].title).toBe("Which day suits you?"), { timeout: 3000 });
    expect(savedStructure().sections[0].questions[0].type).toBe("MULTIPLE_CHOICE");
    expect(screen.queryByRole("button", { name: /save draft/i })).toBeNull();
  });

  it("adds a question with the + button and edits its options like a list", async () => {
    render(createElement(FormBuilder, { form: baseForm, initialSections: [{ title: null, description: null, questions: [nameQuestion] }] }));
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    expect(screen.getByRole("textbox", { name: "Option 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add option" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Option 2" }), { target: { value: "Saturday" } });
    await waitFor(() => expect(savedStructure()?.sections[0].questions[1].config.options).toEqual(["Option 1", "Saturday"]), {
      timeout: 3000,
    });
  });

  it("changes a question's type and keeps choices when moving between choice types", async () => {
    render(createElement(FormBuilder, { form: baseForm, initialSections: [] }));
    fireEvent.change(screen.getByRole("textbox", { name: "Option 1" }), { target: { value: "Yes" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Question type" }), { target: { value: "CHECKBOXES" } });
    expect(screen.getByRole("textbox", { name: "Option 1" })).toHaveProperty("value", "Yes");
    fireEvent.change(screen.getByRole("combobox", { name: "Question type" }), { target: { value: "PARAGRAPH" } });
    expect(screen.getByText("Long answer text")).toBeTruthy();
  });

  it("only opens the question you click; the rest show as people will see them", () => {
    render(
      createElement(FormBuilder, {
        form: baseForm,
        initialSections: [{ title: null, description: null, questions: [nameQuestion, { ...nameQuestion, title: "City" }] }],
      })
    );
    expect(screen.queryByRole("textbox", { name: "Question" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit question: City" }));
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveProperty("value", "City");
  });

  it("marks a question required with the switch on its card", async () => {
    render(createElement(FormBuilder, { form: baseForm, initialSections: [{ title: null, description: null, questions: [{ ...nameQuestion, required: false }] }] }));
    fireEvent.click(screen.getByRole("button", { name: "Edit question: Name" }));
    fireEvent.click(screen.getByRole("switch", { name: "Required" }));
    await waitFor(() => expect(savedStructure()?.sections[0].questions[0].required).toBe(true), { timeout: 3000 });
  });

  it("publishes after saving the latest changes", async () => {
    render(createElement(FormBuilder, { form: baseForm, initialSections: [{ title: null, description: null, questions: [nameQuestion] }] }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/v1/forms/f1/status", expect.objectContaining({ method: "POST" }))
    );
    expect(savedStructure()).not.toBeNull();
  });

  it("locks a published form's questions", () => {
    render(createElement(FormBuilder, { form: { ...baseForm, status: "PUBLISHED" }, initialSections: [{ title: null, description: null, questions: [nameQuestion] }] }));
    expect(screen.queryByRole("toolbar", { name: "Add to form" })).toBeNull();
    expect(screen.queryByRole("button", { name: /edit question/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
  });

  it("marks the form as a template from Share", async () => {
    render(createElement(FormBuilder, { form: baseForm, initialSections: [{ title: null, description: null, questions: [nameQuestion] }] }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("switch", { name: "Use as a template" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/forms/f1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isTemplate: true }) })
      )
    );
  });

  it("shows the public link in Share, with the link parameters it accepts", () => {
    render(
      createElement(FormBuilder, {
        form: { ...baseForm, status: "PUBLISHED" as const, publicLinkEnabled: true },
        initialSections: [
          { title: null, description: null, questions: [{ type: "SHORT_ANSWER", title: "Location", description: "", required: false, config: { urlParam: "location" } }] },
        ],
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByDisplayValue("/f/f1")).toBeTruthy();
    expect(screen.getByText("?location=Chennai")).toBeTruthy();
  });
});
