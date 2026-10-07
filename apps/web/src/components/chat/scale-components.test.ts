/** @vitest-environment jsdom */

import { createElement, StrictMode, useState, type ComponentType, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createScale: vi.fn(),
  submitScale: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/chat/group-1" }));
vi.mock("@/lib/api/services/message-service", () => ({
  messageService: { createScale: mocks.createScale, submitScale: mocks.submitScale },
}));
vi.mock("@/components/ui/dialog", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const pass = (tag: string) => {
    const Passthrough = ({ children, className }: { children: ReactNode; className?: string }) =>
      React.createElement(tag, { className }, children);
    Passthrough.displayName = `Mock(${tag})`;
    return Passthrough;
  };
  return {
    Dialog: pass("div"),
    DialogContent: pass("section"),
    DialogDescription: pass("p"),
    DialogFooter: pass("div"),
    DialogHeader: pass("div"),
    DialogTitle: pass("h2"),
    DialogTrigger: pass("div"),
  };
});

import { ScaleFormDialog } from "./scale-form-dialog";
import { ScaleMessage } from "./scale-message";
import { ScaleSlider } from "./scale-slider";

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.createScale.mockResolvedValue({ success: true, data: { id: "scale-message" } });
});

afterEach(cleanup);

function Harness({ max, initial = null }: { max: number; initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  return createElement(
    "div",
    null,
    createElement(ScaleSlider, {
      id: "s",
      label: "I understand",
      min: 0,
      max,
      leftLabel: "Strongly disagree",
      rightLabel: "Strongly agree",
      value,
      onChange: setValue,
    }),
    createElement("output", { "data-testid": "reported" }, value === null ? "none" : String(value))
  );
}

describe("ScaleSlider", () => {
  it("renders an accessible 0 → N range with the endpoint labels", () => {
    render(createElement(Harness, { max: 7 }));
    const slider = screen.getByRole("slider", { name: "I understand" }) as HTMLInputElement;
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("7");
    expect(slider.step).toBe("1");
    expect(screen.getByText("Strongly disagree")).toBeTruthy();
    expect(screen.getByText("Strongly agree")).toBeTruthy();
  });

  it("starts unanswered and reports nothing until the participant interacts", () => {
    render(createElement(Harness, { max: 5 }));
    expect(screen.getByTestId("reported").textContent).toBe("none");
    expect(screen.getByText("Slide to answer")).toBeTruthy();
  });

  it.each([0, 1, 3, 5])("selects %i and shows it", (value) => {
    render(createElement(Harness, { max: 5 }));
    const slider = screen.getByRole("slider") as HTMLInputElement;
    // 3 is the resting midpoint of 0 → 5, so no change event can fire for it;
    // a tap on the thumb (pointer up) is what records that choice.
    if (slider.value === String(value)) fireEvent.pointerUp(slider);
    else fireEvent.change(slider, { target: { value: String(value) } });
    expect(screen.getByTestId("reported").textContent).toBe(String(value));
  });

  it("records a tap on the resting thumb as an answer", () => {
    render(createElement(Harness, { max: 10 }));
    fireEvent.pointerUp(screen.getByRole("slider"));
    expect(screen.getByTestId("reported").textContent).toBe("5");
  });

  it("treats 0 as a real answer rather than unanswered", () => {
    render(createElement(Harness, { max: 5, initial: 4 }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    expect(screen.getByTestId("reported").textContent).toBe("0");
    expect(screen.queryByText("Slide to answer")).toBeNull();
    expect((screen.getByRole("slider") as HTMLInputElement).getAttribute("aria-valuetext")).toBe("0 of 5");
  });

  it("snaps fractional input to an integer and clamps to the range", () => {
    render(createElement(Harness, { max: 5 }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "3.6" } });
    expect(Number(screen.getByTestId("reported").textContent)).toBeLessThanOrEqual(5);
    expect(Number.isInteger(Number(screen.getByTestId("reported").textContent))).toBe(true);
  });

  it("can pick every integer from 0 to N", () => {
    render(createElement(Harness, { max: 10 }));
    for (let value = 0; value <= 10; value += 1) {
      fireEvent.change(screen.getByRole("slider"), { target: { value: String(value) } });
      expect(screen.getByTestId("reported").textContent).toBe(String(value));
    }
  });
});

describe("ScaleFormDialog", () => {
  const Dialog = ScaleFormDialog as unknown as ComponentType<Record<string, unknown>>;
  const mount = (props: Record<string, unknown> = {}) =>
    render(createElement(StrictMode, null, createElement(Dialog, { autoOpen: true, trigger: createElement("span"), groupId: "group-1", onCreated: vi.fn(), ...props })));

  it("opens with one statement and a default maximum of 5", () => {
    mount();
    expect((screen.getByLabelText("Statement 1") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Maximum") as HTMLInputElement).value).toBe("5");
    expect(screen.getByRole("link", { name: "Question repository" }).getAttribute("href")).toBe(
      "/questions?tab=questions&returnTo=%2Fchat%2Fgroup-1"
    );
  });

  it("publishes several statements together as one scale", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    mount({ onCreated });

    await user.type(screen.getByLabelText("Statement 1"), "I understand the concepts.");
    await user.click(screen.getByRole("button", { name: "Add statement" }));
    await user.type(screen.getByLabelText("Statement 2"), "I feel confident.");
    await user.click(screen.getByRole("button", { name: "Add statement" }));
    await user.type(screen.getByLabelText("Statement 3"), "I'd recommend it.");
    const maxima = screen.getAllByLabelText("Maximum") as HTMLInputElement[];
    await user.clear(maxima[1]);
    await user.type(maxima[1], "10");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.createScale).toHaveBeenCalledTimes(1));
    expect(mocks.createScale).toHaveBeenCalledWith("group-1", {
      statements: [
        { text: "I understand the concepts.", max: 5 },
        { text: "I feel confident.", max: 10 },
        { text: "I'd recommend it.", max: 5 },
      ],
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "scale-message" }));
  });

  it("removes a statement and refuses to publish an empty one", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Add statement" }));
    expect(screen.getByLabelText("Statement 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove statement 2" }));
    expect(screen.queryByLabelText("Statement 2")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(mocks.createScale).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it("rejects an out-of-range maximum before calling the API", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByLabelText("Statement 1"), "Valid statement");
    const max = screen.getByLabelText("Maximum");
    await user.clear(max);
    await user.type(max, "11");
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(mocks.createScale).not.toHaveBeenCalled();
  });

  it("preloads a repository template (statements + maxima) and consumes it", async () => {
    sessionStorage.setItem(
      "cms-scale-template",
      JSON.stringify({ statements: [{ text: "From the repository", max: 7 }, { text: "Second", max: 10 }] })
    );
    mount();
    await waitFor(() => expect((screen.getByLabelText("Statement 1") as HTMLInputElement).value).toBe("From the repository"));
    expect((screen.getByLabelText("Statement 2") as HTMLInputElement).value).toBe("Second");
    const maxima = screen.getAllByLabelText("Maximum") as HTMLInputElement[];
    expect(maxima.map((input) => input.value)).toEqual(["7", "10"]);
    expect(sessionStorage.getItem("cms-scale-template")).toBeNull();
  });
});

describe("ScaleMessage", () => {
  const base = {
    id: "message-1",
    content: "A / B",
    type: "SCALE",
    groupId: "group-1",
    senderId: "coach-1",
    sender: { id: "coach-1", name: "Asha Coach", email: null, role: "MENTOR", avatarUrl: null, status: "ONLINE" },
    attachmentUrl: null,
    attachmentName: null,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-10-08T09:00:00.000Z",
    updatedAt: "2026-10-08T09:00:00.000Z",
  };
  const statement = (id: string, text: string, max: number, myValue: number | null = null) => ({
    id,
    text,
    order: 0,
    min: 0,
    max,
    leftLabel: "Strongly disagree",
    rightLabel: "Strongly agree",
    myValue,
  });
  const scale = {
    id: "scale-1",
    isClosed: false,
    statements: [statement("st-1", "Statement one", 5), statement("st-2", "Statement two", 10)],
  };

  const mount = (props: Record<string, unknown> = {}) => {
    const Component = ScaleMessage as unknown as ComponentType<Record<string, unknown>>;
    return render(
      createElement(Component, {
        message: base,
        scale,
        groupId: "group-1",
        isOwn: false,
        canManage: false,
        onResponded: vi.fn(),
        onDelete: vi.fn(),
        ...props,
      })
    );
  };

  it("renders every statement with its own 0 → N slider", () => {
    mount();
    const sliders = screen.getAllByRole("slider") as HTMLInputElement[];
    expect(sliders.map((s) => s.max)).toEqual(["5", "10"]);
    expect(screen.getByText(/1\. Statement one/)).toBeTruthy();
    expect(screen.getByText(/2\. Statement two/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Submit response" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits the chosen values per statement, including 0", async () => {
    const user = userEvent.setup();
    const onResponded = vi.fn();
    const returned = { ...scale, statements: [statement("st-1", "Statement one", 5, 0), statement("st-2", "Statement two", 10, 10)] };
    mocks.submitScale.mockResolvedValue({ success: true, data: { scale: returned } });
    mount({ onResponded });

    const [first, second] = screen.getAllByRole("slider");
    fireEvent.change(first, { target: { value: "0" } });
    fireEvent.change(second, { target: { value: "10" } });
    await user.click(screen.getByRole("button", { name: "Submit response" }));

    await waitFor(() =>
      expect(mocks.submitScale).toHaveBeenCalledWith("group-1", "message-1", {
        responses: [
          { statementId: "st-1", value: 0 },
          { statementId: "st-2", value: 10 },
        ],
      })
    );
    await waitFor(() => expect(onResponded).toHaveBeenCalledWith(returned));
  });

  it("shows only the viewer's saved values to participants, and results to managers", () => {
    const withStats = {
      ...scale,
      totalParticipants: 3,
      statements: [
        { ...statement("st-1", "Statement one", 5, 2), stats: { count: 3, average: 3, min: 0, max: 5, distribution: [1, 0, 1, 0, 0, 1] } },
        statement("st-2", "Statement two", 10),
      ],
    };
    const participant = mount({ scale: scale });
    expect(screen.queryByTestId("scale-results-st-1")).toBeNull();
    participant.unmount();

    mount({ scale: withStats, canManage: true });
    expect(screen.getByTestId("scale-results-st-1").textContent).toContain("3 responses");
    expect(screen.getByTestId("scale-results-st-1").textContent).toContain("Average 3");
    expect(screen.getByText("3 participants have responded")).toBeTruthy();
  });
});

describe("admin chat interaction menu", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/chat/chat-thread.tsx"), "utf8");

  it("adds Scale after the three existing items without changing them", () => {
    const menu = source.slice(source.indexOf("<DropdownMenuContent"));
    const order = ["Multiple choice poll", "Open ended question", "Word cloud", "Scale"].map((label) => menu.indexOf(label));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(source).toContain("<ScaleFormDialog");
    expect(source).toContain("message.type === MessageType.SCALE && message.scale");
  });

  it("keeps the existing live message renderers", () => {
    for (const type of ["POLL", "OPEN_QUESTION", "WORD_CLOUD"]) {
      expect(source).toContain(`MessageType.${type}`);
    }
  });
});

describe("Scale migration safety", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "prisma/migrations/20261008090000_add_scale_interaction/migration.sql"),
    "utf8"
  );

  it("is additive only: new enum values, new tables, no rewrites of existing data", () => {
    expect(sql).toContain(`ALTER TYPE "MessageType" ADD VALUE 'SCALE'`);
    expect(sql).toContain(`ALTER TYPE "QuestionLibraryType" ADD VALUE 'SCALE'`);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+"/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\s+"(messages|polls|poll_votes|open_questions|open_answers|word_clouds|word_cloud_entries|word_cloud_submissions|question_library_items|question_library_options)"\s+(DROP|ALTER|RENAME)/i);
    // Every ALTER TABLE targets a table this migration creates.
    const created = [...sql.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map((m) => m[1]);
    const altered = [...sql.matchAll(/ALTER TABLE "([a-z_]+)"/g)].map((m) => m[1]);
    expect(created.sort()).toEqual(["question_library_scale_statements", "scale_responses", "scale_statements", "scales"]);
    for (const table of altered) expect(created).toContain(table);
  });

  it("keeps the existing enum values intact in the schema", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/enum MessageType\s*{\s*TEXT\s+IMAGE\s+FILE\s+ANNOUNCEMENT\s+POLL\s+OPEN_QUESTION\s+WORD_CLOUD\s+SCALE\s*}/);
    expect(schema).toMatch(/enum QuestionLibraryType\s*{\s*MULTIPLE_CHOICE\s+WORD_CLOUD\s+OPEN_ENDED\s+SCALE\s*}/);
  });
});
