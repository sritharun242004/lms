/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormFillView } from "./form-fill-view";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const invitation = {
  id: "inv1",
  status: "OPENED",
  groupId: "g1",
  form: {
    id: "f1",
    title: "Day 1 feedback",
    description: null,
    sections: [
      {
        id: "s1",
        title: null,
        description: null,
        questions: [{ id: "q1", type: "SHORT_ANSWER", title: "Your name", required: true, config: {} }],
      },
    ],
  },
};

describe("FormFillView", () => {
  it("loads the invitation and submits answers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { invitation } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { response: { id: "r1" } } }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(createElement(FormFillView, { invitationId: "inv1" }));

    await waitFor(() => expect(screen.getByText("Day 1 feedback")).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Asha" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(screen.getByText(/response was recorded/i)).toBeTruthy());
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/forms/f1/responses",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows the submitted state immediately for an already-submitted invitation", async () => {
    const submittedInvitation = { ...invitation, status: "SUBMITTED" };
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { invitation: submittedInvitation } }) }) as unknown as typeof fetch;

    render(createElement(FormFillView, { invitationId: "inv1" }));

    await waitFor(() => expect(screen.getByText(/response was recorded/i)).toBeTruthy());
  });
});
