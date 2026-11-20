/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FormInvitationMessage } from "./form-invitation-message";
import type { ChatMessage, FormInvitationData } from "@/lib/api/services/message-service";

afterEach(cleanup);

const message = {
  sender: { name: "Mehul Coach" },
} as unknown as ChatMessage;

describe("FormInvitationMessage", () => {
  it("shows a fill link when not yet submitted", () => {
    const invitation: FormInvitationData = {
      id: "inv1",
      status: "SENT",
      formTitle: "Day 1 feedback",
      formDescription: "Tell us how it went",
    };
    render(createElement(FormInvitationMessage, { message, formInvitation: invitation }));
    const link = screen.getByRole("link", { name: /click to fill the form/i });
    expect(link.getAttribute("href")).toBe("/forms/fill/inv1");
    expect(screen.getByText("Sent by Mehul Coach")).toBeTruthy();
  });

  it("shows Submitted instead of the link once the invitation is SUBMITTED", () => {
    const invitation: FormInvitationData = {
      id: "inv1",
      status: "SUBMITTED",
      formTitle: "Day 1 feedback",
      formDescription: null,
    };
    render(createElement(FormInvitationMessage, { message, formInvitation: invitation }));
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
