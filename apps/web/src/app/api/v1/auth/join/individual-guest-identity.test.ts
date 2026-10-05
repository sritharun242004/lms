import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findInvite: vi.fn(), transaction: vi.fn(), findExistingMember: vi.fn(), createUser: vi.fn(), createMember: vi.fn(),
  updateInvite: vi.fn(), createAuditLog: vi.fn(), createSession: vi.fn(), countMembers: vi.fn(),
  generateAccessToken: vi.fn(), generateRefreshToken: vi.fn(), storeRefreshToken: vi.fn(), setAuthCookies: vi.fn(), broadcastToGroup: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { inviteCode: { findUnique: mocks.findInvite, update: mocks.updateInvite }, $transaction: mocks.transaction, session: { create: mocks.createSession }, groupMember: { count: mocks.countMembers }, auditLog: { create: mocks.createAuditLog } } }));
vi.mock("@/lib/auth", () => ({ generateAccessToken: mocks.generateAccessToken, generateRefreshToken: mocks.generateRefreshToken, storeRefreshToken: mocks.storeRefreshToken, setAuthCookies: mocks.setAuthCookies }));
vi.mock("@/lib/realtime/broadcast", () => ({ broadcastToGroup: mocks.broadcastToGroup }));

import { POST } from "./route";

function request(name: string) {
  return new NextRequest("http://localhost/api/v1/auth/join", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" }, body: JSON.stringify({ name, inviteCode: "TEAM-30" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findInvite.mockResolvedValue({ id: "invite-1", groupId: "group-1", isActive: true, expiresAt: null, maxUsage: null, usageCount: 1, group: { id: "group-1", name: "AI Empowerment" } });
  mocks.createUser.mockResolvedValue({ id: "guest-2", name: "Second participant", email: null, role: "MENTEE", avatarUrl: null, emailVerified: false, authVersion: 0 });
  mocks.createMember.mockResolvedValue({}); mocks.updateInvite.mockResolvedValue({}); mocks.createAuditLog.mockResolvedValue({}); mocks.createSession.mockResolvedValue({}); mocks.countMembers.mockResolvedValue(30);
  mocks.generateAccessToken.mockReturnValue("access-token"); mocks.generateRefreshToken.mockReturnValue("refresh-token"); mocks.storeRefreshToken.mockResolvedValue(undefined); mocks.setAuthCookies.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation((work) => work({ user: { create: mocks.createUser }, groupMember: { findFirst: mocks.findExistingMember, create: mocks.createMember }, inviteCode: { update: mocks.updateInvite }, auditLog: { create: mocks.createAuditLog } }));
  mocks.findExistingMember.mockResolvedValue({ user: { id: "guest-1", name: "First participant", email: null, role: "MENTEE", avatarUrl: null, emailVerified: false, authVersion: 0 } });
});

describe("guest join identity", () => {
  it("keeps a later participant's submitted name when they share a public IP with another member", async () => {
    const response = await POST(request("Second participant"));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.data.user.name).toBe("Second participant");
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: "Second participant" }) }));
  });
});
