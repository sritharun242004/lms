import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getGroupAccess: vi.fn(),
  groupFindUnique: vi.fn(),
  groupUpdate: vi.fn(),
  memberFindMany: vi.fn(),
  messageFindMany: vi.fn(),
  auditCreate: vi.fn(),
  broadcast: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/groups/access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/groups/access")>("@/lib/groups/access");
  return { ...actual, getGroupAccess: mocks.getGroupAccess };
});
vi.mock("@/lib/realtime/broadcast", () => ({ broadcastToGroup: mocks.broadcast }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    group: { findUnique: mocks.groupFindUnique, update: mocks.groupUpdate },
    groupMember: { findMany: mocks.memberFindMany },
    message: { findMany: mocks.messageFindMany },
    auditLog: { create: mocks.auditCreate },
  },
}));

import { GET as getProfile } from "./profile/route";
import { GET as getMembers } from "./profile/members/route";
import { GET as getShared } from "./shared/route";
import { PATCH as patchGroup } from "./route";

const params = { params: Promise.resolve({ id: "group-1" }) };
const url = (path: string) => new NextRequest(`http://localhost/api/v1/groups/group-1/${path}`);
const asParticipant = () => {
  mocks.getCurrentUser.mockResolvedValue({ id: "user-p", role: "MENTEE" });
  mocks.getGroupAccess.mockResolvedValue({ canView: true, canManage: false });
};
const asManager = () => {
  mocks.getCurrentUser.mockResolvedValue({ id: "user-m", role: "MENTOR" });
  mocks.getGroupAccess.mockResolvedValue({ canView: true, canManage: true });
};
const asOutsider = () => {
  mocks.getCurrentUser.mockResolvedValue({ id: "user-x", role: "MENTEE" });
  mocks.getGroupAccess.mockResolvedValue({ canView: false, canManage: false });
};

const groupRow = {
  id: "group-1",
  name: "Cohort",
  description: "Weekly work",
  avatarUrl: "/api/v1/groups/group-1/photo?v=1",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  createdById: "user-creator",
  _count: { members: 7 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.groupFindUnique.mockResolvedValue(groupRow);
  mocks.groupUpdate.mockImplementation(async ({ data }) => ({ ...groupRow, ...data }));
  mocks.memberFindMany.mockResolvedValue([]);
  mocks.messageFindMany.mockResolvedValue([]);
  mocks.auditCreate.mockResolvedValue({});
});

describe("GET /groups/:id/profile", () => {
  it("returns identity, member count and no edit rights to a participant", async () => {
    asParticipant();
    const res = await getProfile(url("profile"), params);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ id: "group-1", name: "Cohort", description: "Weekly work", memberCount: 7, canEdit: false });
  });

  it("tells a group manager they can edit", async () => {
    asManager();
    const body = await (await getProfile(url("profile"), params)).json();
    expect(body.data.canEdit).toBe(true);
  });

  it("tells the group's creator they can edit even without manager access", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-creator", role: "MENTEE" });
    mocks.getGroupAccess.mockResolvedValue({ canView: true, canManage: false });
    const body = await (await getProfile(url("profile"), params)).json();
    expect(body.data.canEdit).toBe(true);
  });

  it("hides the group from non-members (404, not 403) and from signed-out callers", async () => {
    asOutsider();
    expect((await getProfile(url("profile"), params)).status).toBe(404);
    expect(mocks.groupFindUnique).not.toHaveBeenCalled();

    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await getProfile(url("profile"), params)).status).toBe(401);
  });
});

describe("GET /groups/:id/profile/members", () => {
  const row = (id: string, userId: string, name: string, role: string) => ({
    id,
    role,
    joinedAt: new Date("2026-10-01T00:00:00.000Z"),
    user: { id: userId, name, avatarUrl: null },
  });

  it("is readable by participants, labels roles, and never exposes email", async () => {
    asParticipant();
    mocks.memberFindMany.mockResolvedValue([
      row("m1", "u1", "Asha", "OWNER"),
      row("m2", "u2", "Bala", "MENTEE"),
    ]);
    const res = await getMembers(url("profile/members"), params);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.members.map((m: { role: string }) => m.role)).toEqual(["Admin", "Participant"]);
    expect(JSON.stringify(body)).not.toMatch(/email/i);
    const select = mocks.memberFindMany.mock.calls[0][0].select;
    expect(select.user.select).toEqual({ id: true, name: true, avatarUrl: true });
  });

  it("is scoped to this group and orders admins first, then by name, with a stable tie-break", async () => {
    asParticipant();
    await getMembers(url("profile/members"), params);
    const args = mocks.memberFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ groupId: "group-1" });
    expect(args.orderBy).toEqual([{ role: "asc" }, { user: { name: "asc" } }, { id: "asc" }]);
  });

  it("pages with a cursor and reports the next one", async () => {
    asParticipant();
    const rows = Array.from({ length: 4 }, (_, i) => row(`m${i}`, `u${i}`, `Person ${i}`, "MENTEE"));
    mocks.memberFindMany.mockResolvedValue(rows);
    const res = await getMembers(url("profile/members?limit=3&cursor=m-prev"), params);
    const body = await res.json();
    expect(body.data.members).toHaveLength(3);
    expect(body.data.nextCursor).toBe("m2");
    const args = mocks.memberFindMany.mock.calls[0][0];
    expect(args.take).toBe(4);
    expect(args.cursor).toEqual({ id: "m-prev" });
    expect(args.skip).toBe(1);
  });

  it("returns one entry per person even if rows repeat a user", async () => {
    asParticipant();
    mocks.memberFindMany.mockResolvedValue([row("m1", "u1", "Asha", "OWNER"), row("m1b", "u1", "Asha", "MENTOR")]);
    const body = await (await getMembers(url("profile/members"), params)).json();
    expect(body.data.members).toHaveLength(1);
  });

  it("404s for non-members", async () => {
    asOutsider();
    expect((await getMembers(url("profile/members"), params)).status).toBe(404);
    expect(mocks.memberFindMany).not.toHaveBeenCalled();
  });
});

describe("GET /groups/:id/shared", () => {
  const attachmentRow = (id: string, mimeType: string, size = 1200) => ({
    id,
    createdAt: new Date("2026-10-11T10:00:00.000Z"),
    attachmentName: `${id}.bin`,
    sender: { id: "u1", name: "Asha" },
    attachment: { fileName: `${id}.bin`, mimeType, size },
  });

  it("requires a valid kind", async () => {
    asParticipant();
    expect((await getShared(url("shared"), params)).status).toBe(400);
    expect((await getShared(url("shared?kind=videos"), params)).status).toBe(400);
  });

  it("pins media queries to the group, excludes deleted messages and never selects file bytes", async () => {
    asParticipant();
    mocks.messageFindMany.mockResolvedValue([attachmentRow("a1", "image/png")]);
    const body = await (await getShared(url("shared?kind=media"), params)).json();
    const args = mocks.messageFindMany.mock.calls[0][0];
    expect(args.where.groupId).toBe("group-1");
    expect(args.where.isDeleted).toBe(false);
    expect(JSON.stringify(args.where.attachment)).toContain("image/");
    expect(JSON.stringify(args.where.attachment)).toContain("video/");
    expect(args.select.attachment.select).toEqual({ fileName: true, mimeType: true, size: true });
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(body.data.items[0]).toMatchObject({
      messageId: "a1",
      url: "/api/v1/groups/group-1/messages/a1/attachment",
      mimeType: "image/png",
    });
  });

  it("documents are the attachments that are not images or videos", async () => {
    asParticipant();
    mocks.messageFindMany.mockResolvedValue([attachmentRow("d1", "application/pdf")]);
    await getShared(url("shared?kind=documents"), params);
    const where = mocks.messageFindMany.mock.calls[0][0].where;
    expect(where.groupId).toBe("group-1");
    expect(JSON.stringify(where.attachment)).toContain("NOT");
  });

  it("extracts links from message text, one item per link, with sender and date", async () => {
    asParticipant();
    mocks.messageFindMany.mockResolvedValue([
      { id: "t1", content: "Docs: https://example.com/guide and https://www.openai.com.", createdAt: new Date("2026-10-12T09:00:00.000Z"), sender: { id: "u1", name: "Asha" } },
      { id: "t2", content: "http://only.one/path", createdAt: new Date("2026-10-11T09:00:00.000Z"), sender: { id: "u2", name: "Bala" } },
    ]);
    const body = await (await getShared(url("shared?kind=links"), params)).json();
    expect(body.data.items.map((i: { url: string; domain: string }) => [i.url, i.domain])).toEqual([
      ["https://example.com/guide", "example.com"],
      ["https://www.openai.com/", "openai.com"],
      ["http://only.one/path", "only.one"],
    ]);
    expect(body.data.items[0].sender.name).toBe("Asha");
    const where = mocks.messageFindMany.mock.calls[0][0].where;
    expect(where.groupId).toBe("group-1");
    expect(where.isDeleted).toBe(false);
    expect(where.type.in).not.toContain("POLL");
  });

  it("returns an empty page with no cursor when there is nothing shared", async () => {
    asParticipant();
    for (const kind of ["media", "documents", "links"]) {
      const body = await (await getShared(url(`shared?kind=${kind}`), params)).json();
      expect(body.data).toEqual({ items: [], nextCursor: null });
    }
  });

  it("paginates and clamps the page size", async () => {
    asParticipant();
    const rows = Array.from({ length: 6 }, (_, i) => attachmentRow(`a${i}`, "image/jpeg"));
    mocks.messageFindMany.mockResolvedValue(rows);
    const body = await (await getShared(url("shared?kind=media&limit=5&cursor=a-prev"), params)).json();
    expect(body.data.items).toHaveLength(5);
    expect(body.data.nextCursor).toBe("a4");
    expect(mocks.messageFindMany.mock.calls[0][0].cursor).toEqual({ id: "a-prev" });

    mocks.messageFindMany.mockClear();
    await getShared(url("shared?kind=media&limit=9999"), params);
    expect(mocks.messageFindMany.mock.calls[0][0].take).toBe(51);
  });

  it("404s for non-members without querying", async () => {
    asOutsider();
    expect((await getShared(url("shared?kind=media"), params)).status).toBe(404);
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
  });
});

describe("PATCH /groups/:id (name and description)", () => {
  const patch = (body: unknown) =>
    new NextRequest("http://localhost/api/v1/groups/group-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("rejects a participant with 403 and writes nothing", async () => {
    asParticipant();
    const res = await patchGroup(patch({ name: "Hacked" }), params);
    expect(res.status).toBe(403);
    expect(mocks.groupUpdate).not.toHaveBeenCalled();
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied role: only the database decides", async () => {
    asParticipant();
    const res = await patchGroup(patch({ name: "Hacked", role: "ADMIN", canEdit: true, canManage: true }), params);
    expect(res.status).toBe(403);
    expect(mocks.groupUpdate).not.toHaveBeenCalled();
  });

  it("rejects a non-member", async () => {
    asOutsider();
    expect((await patchGroup(patch({ name: "Nope" }), params)).status).toBe(403);
    expect(mocks.groupUpdate).not.toHaveBeenCalled();
  });

  it("requires sign-in and an existing group", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await patchGroup(patch({ name: "X" }), params)).status).toBe(401);
    asManager();
    mocks.groupFindUnique.mockResolvedValue(null);
    expect((await patchGroup(patch({ name: "Cohort B" }), params)).status).toBe(404);
  });

  it("lets a manager of this group save, audits it and broadcasts to members", async () => {
    asManager();
    const res = await patchGroup(patch({ name: "Cohort B", description: "New focus" }), params);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ name: "Cohort B", description: "New focus" });
    expect(mocks.groupUpdate).toHaveBeenCalledWith({ where: { id: "group-1" }, data: { name: "Cohort B", description: "New focus" } });
    expect(mocks.auditCreate).toHaveBeenCalled();
    expect(mocks.broadcast).toHaveBeenCalledWith("group-1", "group:update", expect.objectContaining({ name: "Cohort B" }));
  });

  it("still validates input for authorized users", async () => {
    asManager();
    expect((await patchGroup(patch({ name: "x" }), params)).status).toBe(400);
    expect((await patchGroup(patch({ description: "d".repeat(1001) }), params)).status).toBe(400);
    expect(mocks.groupUpdate).not.toHaveBeenCalled();
  });
});
