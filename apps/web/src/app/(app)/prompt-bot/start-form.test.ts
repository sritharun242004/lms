/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), createSession: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/prompt-bot/client", () => ({ createSession: mocks.createSession }));

import { StartForm } from "./start-form";

const KEY = "prompt-bot:start-draft:u1";
const box = () => screen.getByLabelText("What do you want AI to do?") as HTMLTextAreaElement;
const mount = async () => {
  render(createElement(StartForm, { draftKey: KEY }));
  await act(async () => {});
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("StartForm draft", () => {
  it("keeps unsubmitted text when the user leaves the page and comes back", async () => {
    await mount();
    fireEvent.change(box(), { target: { value: "Write a board update" } });
    cleanup();
    await mount();
    expect(box().value).toBe("Write a board update");
  });

  it("clears the draft once the session is created", async () => {
    mocks.createSession.mockResolvedValue({ ok: true, data: { id: "s1" } });
    await mount();
    fireEvent.change(box(), { target: { value: "Write a board update" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start/ }));
    });
    expect(mocks.push).toHaveBeenCalledWith("/prompt-bot/s1");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps the draft when creating the session fails", async () => {
    mocks.createSession.mockResolvedValue({ ok: false, code: "X", message: "Nope" });
    await mount();
    fireEvent.change(box(), { target: { value: "Write a board update" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start/ }));
    });
    expect(localStorage.getItem(KEY)).toBe("Write a board update");
  });

  it("still works when storage is unavailable", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await mount();
    fireEvent.change(box(), { target: { value: "Hello" } });
    expect(box().value).toBe("Hello");
    spy.mockRestore();
    vi.restoreAllMocks();
  });
});
