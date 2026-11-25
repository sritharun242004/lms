/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DescribePanel } from "./describe-panel";

afterEach(cleanup);

describe("DescribePanel", () => {
  it("edits the description, counts characters and shows what to include", () => {
    const onDescriptionChange = vi.fn();
    render(createElement(DescribePanel, { jobId: "j1", description: "Every month", onDescriptionChange }));
    const box = screen.getByLabelText("Describe the job as you do it today") as HTMLTextAreaElement;
    expect(box.value).toBe("Every month");
    expect(box.maxLength).toBe(20_000);
    expect(screen.getByText("11 / 20,000")).toBeTruthy();
    fireEvent.change(box, { target: { value: "Every month I write the board update" } });
    expect(onDescriptionChange).toHaveBeenCalledWith("Every month I write the board update");
    expect(screen.getByText(/the steps you take, what you start from, what you hand over, who reads it, how you know it's good/)).toBeTruthy();
  });
});
