/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.params,
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import QuestionRepositoryPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = new URLSearchParams();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { items: [] } }),
  }));
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Question repository page", () => {
  it("defaults compatible /questions visits to the active Quizzes tab and existing editor", async () => {
    render(createElement(QuestionRepositoryPage));

    expect(screen.getByRole("heading", { name: "Question repository" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Quizzes" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Questions" }).getAttribute("href")).toContain("tab=questions");
    expect(screen.getByRole("button", { name: /create quiz/i })).toBeTruthy();
    expect(screen.getByText("Bulk upload quizzes")).toBeTruthy();

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/v1/questions"));
  });

  it("deep-links to the Questions tab and shows an adaptive standalone editor without choices", async () => {
    mocks.params = new URLSearchParams("tab=questions");
    const user = userEvent.setup();
    render(createElement(QuestionRepositoryPage));

    expect(screen.getByRole("link", { name: "Questions" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: /create question/i })).toBeTruthy();
    expect(screen.queryByText("Bulk upload quizzes")).toBeNull();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/v1/questions?tab=questions"));

    await user.click(screen.getByRole("button", { name: /create question/i }));
    expect(screen.getByLabelText("Question name")).toBeTruthy();
    expect(screen.getByLabelText("Question")).toBeTruthy();
    expect(screen.getByLabelText("Question type")).toBeTruthy();
    expect(screen.queryByLabelText("Choices")).toBeNull();
    expect(screen.getByRole("button", { name: "Save question" })).toBeTruthy();
  });

  it.each([
    ["WORD_CLOUD", "cms-word-cloud-template", "openWordCloud=1"],
    ["OPEN_ENDED", "cms-open-question-template", "openQuestion=1"],
  ] as const)("hands a reusable %s prompt to its existing live publishing flow", async (type, storageKey, query) => {
    mocks.params = new URLSearchParams("tab=questions&returnTo=%2Fchat%2Fgroup-1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          items: [{
            id: "question-1",
            name: "Reflection",
            question: "What changed?",
            type,
            chartType: "BAR",
            options: [],
            createdBy: { name: "Coach" },
          }],
        },
      }),
    }));
    const user = userEvent.setup();
    render(createElement(QuestionRepositoryPage));

    await user.click(await screen.findByRole("button", { name: "Use question" }));

    expect(JSON.parse(sessionStorage.getItem(storageKey) ?? "null")).toEqual({ question: "What changed?" });
    expect(mocks.push).toHaveBeenCalledWith(`/chat/group-1?${query}`);
    expect(sessionStorage.getItem("cms-poll-template")).toBeNull();
  });

  it("creates an Open-ended template without sending quiz choices", async () => {
    mocks.params = new URLSearchParams("tab=questions");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { items: [], item: { id: "created-1" } } }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(createElement(QuestionRepositoryPage));

    await user.click(screen.getByRole("button", { name: /create question/i }));
    await user.type(screen.getByLabelText("Question name"), "Session reflection");
    await user.type(screen.getByLabelText("Question"), "What changed?");
    await user.selectOptions(screen.getByLabelText("Question type"), "OPEN_ENDED");
    await user.click(screen.getByRole("button", { name: "Save question" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(post).toBeTruthy();
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        name: "Session reflection",
        question: "What changed?",
        type: "OPEN_ENDED",
      });
    });
  });

  it("edits and safely deletes a persisted standalone template", async () => {
    mocks.params = new URLSearchParams("tab=questions");
    const item = {
      id: "question-1",
      name: "Reflection",
      question: "What changed?",
      type: "WORD_CLOUD",
      chartType: "BAR",
      options: [],
      createdBy: { name: "Coach" },
      createdAt: "2026-10-06T12:00:00.000Z",
      updatedAt: "2026-10-07T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { items: [item], item } }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(createElement(QuestionRepositoryPage));

    const card = (await screen.findByText("Reflection")).closest('[data-slot="card"]');
    expect(card?.textContent).toContain(`Created ${new Date(item.createdAt).toLocaleDateString()}`);
    expect(card?.textContent).toContain(`Updated ${new Date(item.updatedAt).toLocaleDateString()}`);

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Question"));
    await user.type(screen.getByLabelText("Question"), "Updated prompt");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
      url === "/api/v1/questions/question-1" && init?.method === "PATCH" &&
      JSON.parse(String(init.body)).question === "Updated prompt"
    )).toBe(true));

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/questions/question-1",
      { method: "DELETE" }
    ));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("published sessions stay intact"));
  });
});
