import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getGroupAccess: vi.fn(),
  broadcastToGroup: vi.fn(),
  transaction: vi.fn(),
  messageCreate: vi.fn(),
  scaleCreate: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  findFirst: vi.fn(),
  upsertResponse: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/groups/access", () => ({ getGroupAccess: mocks.getGroupAccess }));
vi.mock("@/lib/realtime/broadcast", () => ({ broadcastToGroup: mocks.broadcastToGroup }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    message: { findUniqueOrThrow: mocks.findUniqueOrThrow, findFirst: mocks.findFirst },
    scaleResponse: { upsert: mocks.upsertResponse },
    auditLog: { create: mocks.auditCreate },
  },
}));

import { POST as createScale } from "./scale/route";
import { POST as respond } from "./[messageId]/scale/respond/route";

const sender = {
  id: "coach-1",
  name: "Asha Coach",
  email: "asha@example.com",
  role: "MENTOR",
  avatarUrl: null,
  status: "ONLINE",
};

function rawScaleMessage(responses: { userId: string; value: number }[] = []) {
  return {
    id: "message-1",
    content: "A / B",
    type: "SCALE",
    groupId: "group-1",
    senderId: "coach-1",
    sender,
    attachmentUrl: null,
    attachmentName: null,
    attachment: null,
    isPinned: false,
    isEdited: false,
    isDeleted: false,
    createdAt: new Date("2026-10-08T09:00:00.000Z"),
    updatedAt: new Date("2026-10-08T09:00:00.000Z"),
    poll: null,
    openQuestion: null,
    wordCloud: null,
    scale: {
      id: "scale-1",
      isClosed: false,
      statements: [
        { id: "st-1", text: "A", order: 0, min: 0, max: 5, leftLabel: "Strongly disagree", rightLabel: "Strongly agree", responses },
        { id: "st-2", text: "B", order: 1, min: 0, max: 10, leftLabel: "Strongly disagree", rightLabel: "Strongly agree", responses: [] },
      ],
    },
  };
}

function req(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const groupParams = { params: Promise.resolve({ id: "group-1" }) };
const respondParams = { params: Promise.resolve({ id: "group-1", messageId: "message-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "coach-1", role: "MENTOR" });
  mocks.getGroupAccess.mockResolvedValue({ canView: true, canManage: true });
  mocks.transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => unknown)({
        message: { create: mocks.messageCreate },
        scale: { create: mocks.scaleCreate },
      });
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  mocks.messageCreate.mockResolvedValue({ id: "message-1" });
  mocks.scaleCreate.mockResolvedValue({ id: "scale-1" });
  mocks.findUniqueOrThrow.mockResolvedValue(rawScaleMessage());
  mocks.upsertResponse.mockImplementation(async (args) => args);
  mocks.auditCreate.mockResolvedValue({});
});

describe("POST /groups/:id/messages/scale", () => {
  it("publishes ONE SCALE message with every statement snapshotted in order", async () => {
    const response = await createScale(
      req("http://localhost/api/v1/groups/group-1/messages/scale", {
        statements: [{ text: "A" }, { text: "B", max: 10 }],
      }),
      groupParams
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.messageCreate).toHaveBeenCalledTimes(1);
    expect(mocks.messageCreate.mock.calls[0][0].data).toMatchObject({ type: "SCALE", groupId: "group-1", senderId: "coach-1" });
    expect(mocks.scaleCreate).toHaveBeenCalledTimes(1);
    expect(mocks.scaleCreate.mock.calls[0][0].data.statements.create).toEqual([
      { text: "A", order: 0, min: 0, max: 5, leftLabel: "Strongly disagree", rightLabel: "Strongly agree" },
      { text: "B", order: 1, min: 0, max: 10, leftLabel: "Strongly disagree", rightLabel: "Strongly agree" },
    ]);
    expect(body.data.type).toBe("SCALE");
    expect(body.data.scale.statements.map((s: { text: string }) => s.text)).toEqual(["A", "B"]);
    expect(mocks.broadcastToGroup).toHaveBeenCalledWith("group-1", "message:new", expect.objectContaining({ id: "message-1" }));
  });

  it("does not read the repository, so later template edits cannot change a live scale", async () => {
    await createScale(
      req("http://localhost/api/v1/groups/group-1/messages/scale", { statements: [{ text: "A", max: 5 }] }),
      groupParams
    );
    // The route only receives the snapshot values in the request body; it has
    // no prisma.questionLibraryItem handle at all (see the mock above).
    expect(mocks.scaleCreate.mock.calls[0][0].data.statements.create[0].max).toBe(5);
  });

  it("rejects invalid input and non-managers without writing", async () => {
    const bad = await createScale(
      req("http://localhost/api/v1/groups/group-1/messages/scale", { statements: [{ text: "A", max: 11 }] }),
      groupParams
    );
    expect(bad.status).toBe(400);

    mocks.getGroupAccess.mockResolvedValue({ canView: true, canManage: false });
    const forbidden = await createScale(
      req("http://localhost/api/v1/groups/group-1/messages/scale", { statements: [{ text: "A" }] }),
      groupParams
    );
    expect(forbidden.status).toBe(403);
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });
});

describe("POST /groups/:id/messages/:messageId/scale/respond", () => {
  const scaleRow = {
    scale: {
      id: "scale-1",
      isClosed: false,
      statements: [{ id: "st-1", min: 0, max: 5 }, { id: "st-2", min: 0, max: 10 }],
    },
  };

  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue({ id: "participant-1", role: "MENTEE" });
    mocks.getGroupAccess.mockResolvedValue({ canView: true, canManage: false });
    mocks.findFirst.mockResolvedValue(scaleRow);
  });

  const post = (responses: unknown) =>
    respond(req("http://localhost/api/v1/groups/group-1/messages/message-1/scale/respond", { responses }), respondParams);

  it("stores a per-statement value, including 0 and the maximum", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue(rawScaleMessage([{ userId: "participant-1", value: 0 }]));
    const response = await post([{ statementId: "st-1", value: 0 }, { statementId: "st-2", value: 10 }]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.upsertResponse).toHaveBeenCalledTimes(2);
    expect(mocks.upsertResponse.mock.calls[0][0]).toMatchObject({
      where: { statementId_userId: { statementId: "st-1", userId: "participant-1" } },
      create: { statementId: "st-1", userId: "participant-1", value: 0 },
    });
    expect(mocks.upsertResponse.mock.calls[1][0].create).toMatchObject({ statementId: "st-2", value: 10 });
    // 0 comes back as an answered value, not as "unanswered".
    expect(body.data.scale.statements[0].myValue).toBe(0);
    expect(body.data.scale.statements[1].myValue).toBeNull();
    // Participants never receive aggregate results.
    expect(body.data.scale.statements[0].stats).toBeUndefined();
  });

  it("rejects values outside the statement's own snapshot range", async () => {
    for (const responses of [
      [{ statementId: "st-1", value: 6 }],
      [{ statementId: "st-1", value: -1 }],
      [{ statementId: "st-2", value: 11 }],
      [{ statementId: "st-1", value: 2.5 }],
    ]) {
      expect((await post(responses)).status).toBe(400);
    }
    expect(mocks.upsertResponse).not.toHaveBeenCalled();
  });

  it("rejects statement ids that do not belong to this scale", async () => {
    const response = await post([{ statementId: "someone-elses-statement", value: 1 }]);
    expect(response.status).toBe(400);
    expect(mocks.upsertResponse).not.toHaveBeenCalled();
  });

  it("rejects duplicate statements in one submission", async () => {
    const response = await post([{ statementId: "st-1", value: 1 }, { statementId: "st-1", value: 2 }]);
    expect(response.status).toBe(400);
    expect(mocks.upsertResponse).not.toHaveBeenCalled();
  });

  it("returns 403 for users outside the group and 404 for a non-scale message", async () => {
    mocks.getGroupAccess.mockResolvedValue({ canView: false, canManage: false });
    expect((await post([{ statementId: "st-1", value: 1 }])).status).toBe(403);

    mocks.getGroupAccess.mockResolvedValue({ canView: true, canManage: false });
    mocks.findFirst.mockResolvedValue({ scale: null });
    expect((await post([{ statementId: "st-1", value: 1 }])).status).toBe(404);
    expect(mocks.upsertResponse).not.toHaveBeenCalled();
  });

  it("refuses responses once a scale is closed", async () => {
    mocks.findFirst.mockResolvedValue({ scale: { ...scaleRow.scale, isClosed: true } });
    expect((await post([{ statementId: "st-1", value: 1 }])).status).toBe(400);
  });

  it("gives managers the aggregate results", async () => {
    mocks.getGroupAccess.mockResolvedValue({ canView: true, canManage: true });
    mocks.getCurrentUser.mockResolvedValue({ id: "coach-1", role: "MENTOR" });
    mocks.findUniqueOrThrow.mockResolvedValue(
      rawScaleMessage([{ userId: "a", value: 0 }, { userId: "b", value: 4 }, { userId: "c", value: 5 }])
    );
    const body = await (await post([{ statementId: "st-1", value: 4 }])).json();
    expect(body.data.scale.statements[0].stats).toEqual({
      count: 3,
      average: 3,
      min: 0,
      max: 5,
      distribution: [1, 0, 0, 0, 1, 1],
    });
    expect(body.data.scale.totalParticipants).toBe(3);
  });
});
