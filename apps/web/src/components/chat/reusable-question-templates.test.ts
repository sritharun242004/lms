/** @vitest-environment jsdom */

import { createElement, StrictMode, type ComponentType, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOpenQuestion: vi.fn(),
  createWordCloud: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/chat/group-1" }));
vi.mock("@/lib/api/services/message-service", () => ({
  messageService: {
    createOpenQuestion: mocks.createOpenQuestion,
    createWordCloud: mocks.createWordCloud,
  },
}));
vi.mock("@/components/ui/dialog", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    Dialog: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
    DialogContent: ({ children }: { children: ReactNode }) => React.createElement("section", null, children),
    DialogDescription: ({ children }: { children: ReactNode }) => React.createElement("p", null, children),
    DialogFooter: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
    DialogHeader: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
    DialogTitle: ({ children }: { children: ReactNode }) => React.createElement("h2", null, children),
    DialogTrigger: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
  };
});
vi.mock("@/components/ui/switch", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    Switch: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) =>
      React.createElement("input", {
        type: "checkbox",
        checked,
        onChange: (event: { target: { checked: boolean } }) => onCheckedChange(event.target.checked),
      }),
  };
});

import { OpenQuestionFormDialog } from "./open-question-form-dialog";
import { PollFormDialog } from "./poll-form-dialog";
import { WordCloudFormDialog } from "./word-cloud-form-dialog";

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.createOpenQuestion.mockResolvedValue({ success: true, data: { id: "open-message" } });
  mocks.createWordCloud.mockResolvedValue({ success: true, data: { id: "cloud-message" } });
});

afterEach(cleanup);

describe("reusable question publishing templates", () => {
  it("keeps an MCQ template preloaded when effects repeat in strict mode", async () => {
    sessionStorage.setItem("cms-poll-template", JSON.stringify({
      question: "Which pipeline remains unchanged?",
      options: ["Existing POLL", "New duplicate"],
      chartType: "BAR",
    }));
    const Dialog = PollFormDialog as unknown as ComponentType<Record<string, unknown>>;
    render(createElement(StrictMode, null,
      createElement(Dialog, { autoOpen: true, trigger: createElement("span"), groupId: "group-1", onCreated: vi.fn() }),
    ));

    const input = screen.getByLabelText("Question") as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Which pipeline remains unchanged?"));
    expect((screen.getByPlaceholderText("Option 1") as HTMLInputElement).value).toBe("Existing POLL");
    expect((screen.getByPlaceholderText("Option 2") as HTMLInputElement).value).toBe("New duplicate");
    expect(sessionStorage.getItem("cms-poll-template")).toBeNull();
  });

  it("preloads and submits an Open-ended template through the existing open-question service", async () => {
    sessionStorage.setItem("cms-open-question-template", JSON.stringify({ question: "What changed?" }));
    const Dialog = OpenQuestionFormDialog as unknown as ComponentType<Record<string, unknown>>;
    const user = userEvent.setup();
    render(createElement(StrictMode, null,
      createElement(Dialog, { autoOpen: true, trigger: createElement("span"), groupId: "group-1", onCreated: vi.fn() }),
    ));

    expect(screen.getByRole("link", { name: "Question repository" }).getAttribute("href"))
      .toBe("/questions?tab=questions&returnTo=%2Fchat%2Fgroup-1");
    const input = screen.getByLabelText("Question") as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("What changed?"));
    await user.click(screen.getByRole("button", { name: "Post question" }));

    await waitFor(() => expect(mocks.createOpenQuestion).toHaveBeenCalledWith("group-1", { question: "What changed?" }));
    expect(sessionStorage.getItem("cms-open-question-template")).toBeNull();
  });

  it("preloads and submits a Word Cloud template through the existing word-cloud service", async () => {
    sessionStorage.setItem("cms-word-cloud-template", JSON.stringify({ question: "One word for today?" }));
    const Dialog = WordCloudFormDialog as unknown as ComponentType<Record<string, unknown>>;
    const user = userEvent.setup();
    render(createElement(StrictMode, null,
      createElement(Dialog, { autoOpen: true, trigger: createElement("span"), groupId: "group-1", onCreated: vi.fn() }),
    ));

    expect(screen.getByRole("link", { name: "Question repository" }).getAttribute("href"))
      .toBe("/questions?tab=questions&returnTo=%2Fchat%2Fgroup-1");
    const input = screen.getByLabelText("Question") as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("One word for today?"));
    await user.click(screen.getByRole("button", { name: "Post word cloud" }));

    await waitFor(() => expect(mocks.createWordCloud).toHaveBeenCalledWith("group-1", {
      question: "One word for today?",
      maxWordsPerParticipant: 1,
      allowMultipleSubmissions: false,
      profanityFilter: true,
    }));
    expect(sessionStorage.getItem("cms-word-cloud-template")).toBeNull();
  });
});
