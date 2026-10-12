/** @vitest-environment jsdom */

import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupService } from "@/lib/api/services/group-service";
import { GroupMembersDialog } from "./group-members-dialog";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/api/services/group-service", () => ({
  groupService: {
    profile: vi.fn(),
    profileMembers: vi.fn(),
    shared: vi.fn(),
    update: vi.fn(),
    updatePhoto: vi.fn(),
    removePhoto: vi.fn(),
  },
}));
// The real control pulls in the crop dialog; the profile only needs to know
// whether it is allowed to manage.
vi.mock("@/components/groups/group-photo-control", () => ({
  GroupPhotoControl: ({ canManage, groupName }: { canManage: boolean; groupName: string }) =>
    createElement("div", { "data-testid": "photo-control", "data-can-manage": String(canManage) }, `photo:${groupName}`),
}));

const svc = vi.mocked(groupService);

const iso = (daysAgo: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

function profile(overrides: Partial<{ canEdit: boolean; name: string; description: string | null; memberCount: number }> = {}) {
  return {
    id: "g1",
    name: "AI Empowerment Cohort",
    description: "Weekly sessions on practical AI.",
    avatarUrl: null,
    createdAt: iso(40),
    memberCount: 3,
    canEdit: false,
    ...overrides,
  };
}

const members = [
  { id: "m1", userId: "u1", name: "Asha Coach", avatarUrl: null, role: "Admin" as const, joinedAt: iso(30) },
  { id: "m2", userId: "u2", name: "Bala Participant", avatarUrl: null, role: "Participant" as const, joinedAt: iso(5) },
  { id: "m3", userId: "u3", name: "Chitra Participant", avatarUrl: null, role: "Participant" as const, joinedAt: iso(2) },
];

function mountProfile(onUpdated = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(GroupMembersDialog, {
        groupId: "g1",
        groupName: "AI Empowerment Cohort",
        onUpdated,
        trigger: createElement("button", null, "Open profile") as ReactNode,
      })
    )
  );
  return { ...view, client, onUpdated };
}

async function openProfile() {
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole("button", { name: "Open profile" }));
  await screen.findByTestId("group-profile-name");
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.profile.mockResolvedValue({ success: true, data: profile() } as never);
  svc.profileMembers.mockResolvedValue({ success: true, data: { members, nextCursor: null } } as never);
  svc.shared.mockResolvedValue({ success: true, data: { items: [], nextCursor: null } } as never);
});
afterEach(() => cleanup());

describe("group profile - identity and members", () => {
  it("shows the real name, description, member count and members with role labels", async () => {
    mountProfile();
    await openProfile();

    expect(screen.getByTestId("group-profile-name").textContent).toBe("AI Empowerment Cohort");
    expect(screen.getByTestId("group-profile-description").textContent).toBe("Weekly sessions on practical AI.");
    expect(screen.getByTestId("group-member-count").textContent).toBe("3 members");
    const list = await screen.findByRole("list", { name: "Group members" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Asha Coach")).toBeTruthy();
    expect(within(rows[0]).getByText("Admin")).toBeTruthy();
    expect(within(rows[1]).getByText("Participant")).toBeTruthy();
  });

  it("never shows email addresses in the roster", async () => {
    mountProfile();
    await openProfile();
    await screen.findByRole("list", { name: "Group members" });
    expect(document.body.textContent).not.toMatch(/@/);
  });

  it("handles a group with no description and a single member", async () => {
    svc.profile.mockResolvedValue({ success: true, data: profile({ description: null, memberCount: 1 }) } as never);
    mountProfile();
    await openProfile();
    expect(screen.getByText("No description.")).toBeTruthy();
    expect(screen.getByTestId("group-member-count").textContent).toBe("1 member");
  });

  it("wraps very long names and descriptions instead of overflowing", async () => {
    const longName = "N".repeat(95);
    const longDescription = "word ".repeat(150).trim() + " " + "x".repeat(300);
    svc.profile.mockResolvedValue({ success: true, data: profile({ name: longName, description: longDescription }) } as never);
    mountProfile();
    await openProfile();
    expect(screen.getByTestId("group-profile-name").className).toContain("[overflow-wrap:anywhere]");
    expect(screen.getByTestId("group-profile-description").className).toContain("[overflow-wrap:anywhere]");
    expect(screen.getByTestId("group-profile-name").textContent).toBe(longName);
  });

  it("pages the roster with Load more, without repeating people", async () => {
    svc.profileMembers
      .mockResolvedValueOnce({ success: true, data: { members: members.slice(0, 2), nextCursor: "m2" } } as never)
      .mockResolvedValueOnce({ success: true, data: { members: [members[1], members[2]], nextCursor: null } } as never);
    mountProfile();
    const user = await openProfile();
    await screen.findByText("Bala Participant");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Chitra Participant");
    expect(svc.profileMembers).toHaveBeenLastCalledWith("g1", "m2");
    expect(screen.getAllByText("Bala Participant")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});

describe("group profile - permissions", () => {
  it("gives a participant a read-only profile", async () => {
    svc.profile.mockResolvedValue({ success: true, data: profile({ canEdit: false }) } as never);
    mountProfile();
    await openProfile();
    expect(screen.queryByRole("button", { name: /edit name/i })).toBeNull();
    expect(screen.getByTestId("photo-control").getAttribute("data-can-manage")).toBe("false");
  });

  it("gives an admin edit controls and the photo control", async () => {
    svc.profile.mockResolvedValue({ success: true, data: profile({ canEdit: true }) } as never);
    mountProfile();
    await openProfile();
    expect(screen.getByRole("button", { name: /edit name/i })).toBeTruthy();
    expect(screen.getByTestId("photo-control").getAttribute("data-can-manage")).toBe("true");
  });

  it("takes the edit controls away when the server says the admin lost access", async () => {
    svc.profile.mockResolvedValue({ success: true, data: profile({ canEdit: true }) } as never);
    const { client } = mountProfile();
    await openProfile();
    expect(screen.getByRole("button", { name: /edit name/i })).toBeTruthy();

    svc.profile.mockResolvedValue({ success: true, data: profile({ canEdit: false }) } as never);
    await act(async () => { await client.invalidateQueries({ queryKey: ["group-profile", "g1"] }); });
    await waitFor(() => expect(screen.queryByRole("button", { name: /edit name/i })).toBeNull());
    expect(screen.getByTestId("photo-control").getAttribute("data-can-manage")).toBe("false");
  });
});

describe("group profile - admin editing", () => {
  beforeEach(() => {
    svc.profile.mockResolvedValue({ success: true, data: profile({ canEdit: true }) } as never);
  });

  async function startEditing() {
    const handlers = mountProfile();
    const user = await openProfile();
    await user.click(screen.getByRole("button", { name: /edit name/i }));
    const name = screen.getByLabelText("Group name") as HTMLInputElement;
    const description = screen.getByLabelText("Description") as HTMLTextAreaElement;
    return { user, name, description, ...handlers };
  }

  it("saves trimmed values once, confirms, and reports the change to the chat header", async () => {
    svc.update.mockResolvedValue({ success: true, data: { id: "g1", name: "Cohort B", description: "New focus" } } as never);
    const { user, name, description, onUpdated } = await startEditing();

    await user.clear(name);
    await user.type(name, "  Cohort B  ");
    await user.clear(description);
    await user.type(description, "New focus");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(svc.update).toHaveBeenCalledTimes(1));
    expect(svc.update).toHaveBeenCalledWith("g1", { name: "Cohort B", description: "New focus" });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Group updated"));
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ name: "Cohort B", description: "New focus" }));
    await waitFor(() => expect(screen.queryByLabelText("Group name")).toBeNull());
  });

  it("cannot be saved while unchanged or invalid", async () => {
    const { user, name } = await startEditing();
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // unchanged
    await user.clear(name);
    await user.type(name, "x");
    expect(screen.getByText(/at least 2 characters/i)).toBeTruthy();
    expect(save.disabled).toBe(true);
    await user.type(name, "y");
    expect(save.disabled).toBe(false);
  });

  it("cancel discards edits without calling the API", async () => {
    const { user, name } = await startEditing();
    await user.clear(name);
    await user.type(name, "Something else");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(svc.update).not.toHaveBeenCalled();
    expect(screen.getByTestId("group-profile-name").textContent).toBe("AI Empowerment Cohort");
  });

  it("sends one request even if Save is activated repeatedly", async () => {
    let finish!: (value: unknown) => void;
    svc.update.mockReturnValue(new Promise((resolve) => { finish = resolve; }) as never);
    const { user, name } = await startEditing();
    await user.clear(name);
    await user.type(name, "Cohort C");
    const save = screen.getByRole("button", { name: "Save" });
    await user.click(save);
    await user.click(screen.getByRole("button", { name: /saving/i }));
    await user.keyboard("{Enter}");
    expect(svc.update).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ success: true, data: { id: "g1", name: "Cohort C", description: "" } }); });
  });

  it("keeps the form open and shows the error when saving fails", async () => {
    svc.update.mockResolvedValue({ success: false, error: { code: "GROUP_UPDATE_ERROR", message: "Failed to update group" } } as never);
    const { user, name } = await startEditing();
    await user.clear(name);
    await user.type(name, "Cohort D");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to update group"));
    expect(screen.getByLabelText("Group name")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("closes the form and refreshes permissions when the server answers 403", async () => {
    svc.update.mockResolvedValue({ success: false, error: { code: "FORBIDDEN", message: "no" } } as never);
    const { user, name } = await startEditing();
    const before = svc.profile.mock.calls.length;
    await user.clear(name);
    await user.type(name, "Cohort E");
    svc.profile.mockResolvedValue({ success: true, data: profile({ canEdit: false }) } as never);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You no longer have permission to edit this group."));
    await waitFor(() => expect(svc.profile.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole("button", { name: /edit name/i })).toBeNull());
    expect(screen.queryByLabelText("Group name")).toBeNull();
  });
});

describe("group profile - shared content tabs", () => {
  const file = (id: string, mimeType: string, daysAgo: number, extra: Record<string, unknown> = {}) => ({
    id,
    messageId: id,
    fileName: `${id}.bin`,
    mimeType,
    size: 2048,
    url: `/api/v1/groups/g1/messages/${id}/attachment`,
    sharedAt: iso(daysAgo),
    sender: { id: "u1", name: "Asha Coach" },
    ...extra,
  });

  async function openTab(name: string) {
    mountProfile();
    const user = await openProfile();
    await user.click(screen.getByRole("tab", { name }));
    return user;
  }

  it("loads each kind from the group's shared endpoint", async () => {
    const user = await openTab("Media");
    await waitFor(() => expect(svc.shared).toHaveBeenCalledWith("g1", "media", null));
    await user.click(screen.getByRole("tab", { name: "Docs" }));
    await waitFor(() => expect(svc.shared).toHaveBeenCalledWith("g1", "documents", null));
    await user.click(screen.getByRole("tab", { name: "Links" }));
    await waitFor(() => expect(svc.shared).toHaveBeenCalledWith("g1", "links", null));
  });

  it("media: thumbnail grid grouped under Today / Yesterday / month headings", async () => {
    svc.shared.mockResolvedValue({
      success: true,
      data: {
        items: [
          file("img-today", "image/png", 0),
          file("vid-today", "video/mp4", 0),
          file("img-yesterday", "image/jpeg", 1),
          file("img-old", "image/webp", 40),
        ],
        nextCursor: null,
      },
    } as never);
    await openTab("Media");
    await screen.findByRole("region", { name: "Today" });
    expect(within(screen.getByRole("region", { name: "Today" })).getAllByRole("button")).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Yesterday" })).getAllByRole("button")).toHaveLength(1);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings[0]).toBe("Today");
    expect(headings[1]).toBe("Yesterday");
    expect(headings[2]).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    const thumbs = document.querySelectorAll("img[src*='attachment?inline=1']");
    expect(thumbs.length).toBe(3);
    expect(thumbs[0].getAttribute("loading")).toBe("lazy");
  });

  it("media: opens an item in a preview with a download link", async () => {
    svc.shared.mockResolvedValue({ success: true, data: { items: [file("photo-1", "image/png", 0, { fileName: "team.png" })], nextCursor: null } } as never);
    const user = await openTab("Media");
    await user.click(await screen.findByRole("button", { name: /open image team\.png/i }));
    const dialog = await screen.findByRole("dialog", { name: "team.png" });
    expect(within(dialog).getByRole("link", { name: /download/i }).getAttribute("href")).toBe(
      "/api/v1/groups/g1/messages/photo-1/attachment"
    );
  });

  it("media: shows an empty state", async () => {
    await openTab("Media");
    expect(await screen.findByText("No media yet")).toBeTruthy();
  });

  it("documents: newest first with name, type, size, sender and date; copes with long names and no size", async () => {
    const longName = "Quarterly-AI-Adoption-Programme-Review-" + "very-long-segment-".repeat(8) + "final.pdf";
    svc.shared.mockResolvedValue({
      success: true,
      data: {
        items: [
          file("doc-a", "application/pdf", 0, { fileName: longName, size: 5_242_880 }),
          file("doc-b", "application/octet-stream", 3, { fileName: "notes", size: 0 }),
        ],
        nextCursor: null,
      },
    } as never);
    await openTab("Docs");
    const links = await screen.findAllByRole("link");
    const first = links.find((l) => l.getAttribute("href")?.includes("doc-a"))!;
    expect(first.textContent).toContain(longName);
    expect(first.textContent).toContain("PDF");
    expect(first.textContent).toContain("5.0 MB");
    expect(first.textContent).toContain("Asha Coach");
    expect(first.getAttribute("download")).toBe(longName);
    const second = links.find((l) => l.getAttribute("href")?.includes("doc-b"))!;
    expect(second.textContent).not.toMatch(/\bB\b|KB|MB/); // no size shown when unknown
    expect(second.textContent).toContain("FILE"); // not "STREAM" from application/octet-stream
    expect(first.querySelector(".\\[overflow-wrap\\:anywhere\\]")).not.toBeNull();
    // order: today before three days ago
    expect(links.indexOf(first)).toBeLessThan(links.indexOf(second));
  });

  it("documents: empty state", async () => {
    await openTab("Docs");
    expect(await screen.findByText("No documents yet")).toBeTruthy();
  });

  it("links: shows domain, url, sender and date, and opens safely in a new tab", async () => {
    svc.shared.mockResolvedValue({
      success: true,
      data: {
        items: [
          { id: "t1:https://example.com/a", messageId: "t1", url: "https://example.com/a?x=1", domain: "example.com", sharedAt: iso(0), sender: { id: "u1", name: "Asha Coach" } },
          { id: "t2:http://" + "a".repeat(120) + ".io/p", messageId: "t2", url: "http://" + "a".repeat(120) + ".io/p", domain: "a".repeat(120) + ".io", sharedAt: iso(2), sender: null },
        ],
        nextCursor: null,
      },
    } as never);
    await openTab("Links");
    const anchors = (await screen.findAllByRole("link")) as HTMLAnchorElement[];
    expect(anchors[0].getAttribute("href")).toBe("https://example.com/a?x=1");
    expect(anchors[0].getAttribute("target")).toBe("_blank");
    expect(anchors[0].getAttribute("rel")).toContain("noopener");
    expect(anchors[0].getAttribute("rel")).toContain("noreferrer");
    expect(anchors[0].textContent).toContain("example.com");
    expect(anchors[0].textContent).toContain("Asha Coach");
    expect(anchors[1].textContent).toContain("a".repeat(120));
  });

  it("links: empty state", async () => {
    await openTab("Links");
    expect(await screen.findByText("No links yet")).toBeTruthy();
  });

  it("shows an error with retry when a tab fails to load, then recovers", async () => {
    svc.shared.mockResolvedValueOnce({ success: false, error: { code: "X", message: "Network down" } } as never);
    const user = await openTab("Docs");
    expect(await screen.findByText("Network down")).toBeTruthy();
    svc.shared.mockResolvedValue({ success: true, data: { items: [file("doc-z", "application/pdf", 0)], nextCursor: null } } as never);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect((await screen.findAllByText(/doc-z\.bin/)).length).toBeGreaterThan(0);
  });

  it("pages shared files with Load more using the cursor", async () => {
    svc.shared
      .mockResolvedValueOnce({ success: true, data: { items: [file("d1", "application/pdf", 0)], nextCursor: "d1" } } as never)
      .mockResolvedValueOnce({ success: true, data: { items: [file("d2", "application/pdf", 1)], nextCursor: null } } as never);
    const user = await openTab("Docs");
    await screen.findAllByText(/d1\.bin/);
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findAllByText(/d2\.bin/);
    expect(svc.shared).toHaveBeenLastCalledWith("g1", "documents", "d1");
  });
});

describe("group profile - loading and failures", () => {
  it("shows an error with retry if the profile itself cannot load", async () => {
    svc.profile.mockResolvedValueOnce({ success: false, error: { code: "GROUP_NOT_FOUND", message: "Group not found" } } as never);
    mountProfile();
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Open profile" }));
    expect(await screen.findByText("Group not found")).toBeTruthy();
    svc.profile.mockResolvedValue({ success: true, data: profile() } as never);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("group-profile-name")).toBeTruthy();
  });

  it("does not fetch anything until the profile is opened", async () => {
    mountProfile();
    expect(svc.profile).not.toHaveBeenCalled();
    expect(svc.profileMembers).not.toHaveBeenCalled();
    expect(svc.shared).not.toHaveBeenCalled();
  });

  it("only loads a tab's content when that tab is opened", async () => {
    mountProfile();
    await openProfile();
    await screen.findByRole("list", { name: "Group members" });
    expect(svc.shared).not.toHaveBeenCalled();
  });
});
