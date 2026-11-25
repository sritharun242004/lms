/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), createJob: vi.fn(), toastError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/lib/skills/jobs/client", () => ({ createJob: mocks.createJob }));

import { NewJobForm } from "./new-job-form";

const mount = async () => {
  render(createElement(NewJobForm, { draftKey: "skills-builder:job-draft:u1" }));
  await act(async () => {});
};
const description = () => screen.getByLabelText("Describe the job as you do it today") as HTMLTextAreaElement;
const title = () => screen.getByLabelText(/Job title/) as HTMLInputElement;
const start = () => screen.getByRole("button", { name: /Start job/ });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("NewJobForm", () => {
  it("needs a description before it can start", async () => {
    await mount();
    expect((start() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(description(), { target: { value: "   " } });
    expect((start() as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the draft across visits and clears it once the job exists", async () => {
    await mount();
    fireEvent.change(title(), { target: { value: "Board update" } });
    fireEvent.change(description(), { target: { value: "Every month I turn my notes into the board deck." } });
    cleanup();
    await mount();
    expect(title().value).toBe("Board update");
    expect(description().value).toBe("Every month I turn my notes into the board deck.");

    mocks.createJob.mockResolvedValue({ ok: true, data: { id: "j1" } });
    await act(async () => {
      fireEvent.click(start());
    });
    expect(mocks.createJob).toHaveBeenCalledWith({ title: "Board update", description: "Every month I turn my notes into the board deck." });
    expect(mocks.push).toHaveBeenCalledWith("/prompt-bot/skills/j1");
    cleanup();
    await mount();
    expect(title().value).toBe("");
    expect(description().value).toBe("");
  });

  it("leaves out a blank title, starts with Ctrl+Enter and reports failures", async () => {
    await mount();
    fireEvent.change(description(), { target: { value: "I write the weekly report." } });
    mocks.createJob.mockResolvedValue({ ok: false, code: "VALIDATION_ERROR", message: "Validation failed" });
    await act(async () => {
      fireEvent.keyDown(description(), { key: "Enter", ctrlKey: true });
    });
    expect(mocks.createJob).toHaveBeenCalledWith({ description: "I write the weekly report." });
    expect(mocks.toastError).toHaveBeenCalledWith("Validation failed");
    expect(mocks.push).not.toHaveBeenCalled();
    expect((start() as HTMLButtonElement).disabled).toBe(false);
  });
});
