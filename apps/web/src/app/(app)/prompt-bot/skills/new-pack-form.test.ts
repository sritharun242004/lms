/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), createPack: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/skills/client", () => ({ createPack: mocks.createPack }));

import { NewPackForm } from "./new-pack-form";

const mount = async () => {
  render(createElement(NewPackForm, { draftKey: "skills-builder:draft:u1" }));
  await act(async () => {});
};
const description = () => screen.getByLabelText("Describe a task or your day-to-day work") as HTMLTextAreaElement;
const role = () => screen.getByLabelText(/Your role/) as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("NewPackForm draft", () => {
  it("keeps the description and role when the user leaves and comes back, and clears them once the pack exists", async () => {
    await mount();
    fireEvent.change(description(), { target: { value: "I write the board update" } });
    fireEvent.change(role(), { target: { value: "CTO" } });
    cleanup();
    await mount();
    expect(description().value).toBe("I write the board update");
    expect(role().value).toBe("CTO");

    mocks.createPack.mockResolvedValue({ ok: true, data: { id: "p1" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Build skill list/ }));
    });
    expect(mocks.push).toHaveBeenCalledWith("/prompt-bot/skills/p1");
    cleanup();
    await mount();
    expect(description().value).toBe("");
    expect(role().value).toBe("");
  });
});
