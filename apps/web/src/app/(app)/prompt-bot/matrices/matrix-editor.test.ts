/** @vitest-environment jsdom */
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { MatrixEditor } from "./matrix-editor";

const q = (id: string, text: string) => ({ id, text, guidance: `${text} guidance`, element: null, isActive: true });
const core = { id: "m_core", slug: "core", name: "Design Think", description: "Always on", kind: "CORE" as const, isBuiltIn: true, isActive: true, questions: [q("q1", "Who is it for?"), q("q2", "What is the goal?")] };
const sales = { id: "m_sales", slug: "sales", name: "Sales email", description: null, kind: "TASK" as const, isBuiltIn: false, isActive: true, questions: [q("s1", "Who is the buyer?")] };

const fetchMock = vi.fn();
function respond(ok: boolean, payload: unknown) {
  fetchMock.mockResolvedValueOnce({ ok, json: async () => payload });
}
const lastBody = () => JSON.parse(fetchMock.mock.calls.at(-1)![1].body);

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  vi.unstubAllGlobals();
});

const mount = (list = [core, sales]) => render(React.createElement(MatrixEditor, { initial: list as never }));

describe("MatrixEditor", () => {
  it("saves name, description, element and the moved order in one PATCH", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Matrix name"), { target: { value: "Design Think v2" } });
    fireEvent.change(screen.getByLabelText("Matrix description"), { target: { value: "Edited" } });
    fireEvent.change(screen.getByLabelText("Element for question 2"), { target: { value: "goal" } });
    fireEvent.click(screen.getByRole("button", { name: "Move question 2 up" }));
    expect((screen.getByLabelText("Question 1") as HTMLInputElement).value).toBe("What is the goal?");
    expect((screen.getByRole("button", { name: "Move question 1 up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move question 2 down" }) as HTMLButtonElement).disabled).toBe(true);

    respond(true, { data: { ...core, name: "Design Think v2" } });
    fireEvent.click(screen.getByRole("button", { name: /Save questions/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/prompt-bot/matrices/m_core");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    const body = lastBody();
    expect(body.name).toBe("Design Think v2");
    expect(body.description).toBe("Edited");
    expect(body.questions.map((x: { id: string }) => x.id)).toEqual(["q2", "q1"]);
    expect(body.questions[0].element).toBe("goal");
  });

  it("creates a matrix and selects it", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /New task matrix/ }));
    fireEvent.change(screen.getByLabelText("New matrix name"), { target: { value: "Press release" } });
    respond(true, { data: { ...sales, id: "m_new", slug: "press", name: "Press release", questions: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect((screen.getByLabelText("Matrix name") as HTMLInputElement).value).toBe("Press release"));
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(lastBody()).toEqual({ name: "Press release", questions: [] });
  });

  it("deletes a custom matrix only after the confirm dialog", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Sales email" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Sales email" }));
    expect(fetchMock).not.toHaveBeenCalled();
    respond(true, { data: { id: "m_sales" } });
    fireEvent.click(await screen.findByRole("button", { name: "Delete matrix" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Sales email" })).toBeNull());
  });

  it("shows server validation errors inline", async () => {
    mount();
    respond(false, { success: false, error: { code: "VALIDATION", message: "Question 1 needs guidance" } });
    fireEvent.change(screen.getByLabelText("Question 1"), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: /Save questions/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Question 1 needs guidance");
  });

  it("has no Active switch on the Core matrix but one on task matrices", () => {
    mount();
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sales email" }));
    expect(screen.getByRole("switch")).toBeTruthy();
  });
});
