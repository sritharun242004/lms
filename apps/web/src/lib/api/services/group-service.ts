import { apiClient } from "@/lib/api/client";
import type { CreateGroupInput, UpdateGroupInput } from "@cms/shared";

export interface GroupCard {
  id: string;
  name: string;
  description: string | null;
  wallpaperUrl: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastActivityAt: string;
  mentorName: string;
  memberCount: number;
  memberIds: string[];
  inviteCode: { id: string; code: string; isActive: boolean; usageCount: number } | null;
  canManage: boolean;
}

export interface GroupMemberEntry {
  id: string;
  role: "OWNER" | "MENTOR" | "MENTEE";
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  };
}

export interface GroupProfile {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  createdAt: string;
  memberCount: number;
  /** Computed by the server for THIS caller; never trusted from the client. */
  canEdit: boolean;
}

export interface ProfileMember {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: "Admin" | "Participant";
  joinedAt: string;
}

export type SharedKind = "media" | "documents" | "links";

export interface SharedSender {
  id: string;
  name: string;
}

export interface SharedFile {
  id: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  sharedAt: string;
  sender: SharedSender | null;
}

export interface SharedLink {
  id: string;
  messageId: string;
  url: string;
  domain: string;
  sharedAt: string;
  sender: SharedSender | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const groupService = {
  list: () => apiClient.get<{ groups: GroupCard[] }>("/groups"),

  create: (input: CreateGroupInput) => apiClient.post<GroupCard>("/groups", input),

  update: (id: string, input: UpdateGroupInput) =>
    apiClient.patch<{ id: string; name: string; description: string | null }>(
      `/groups/${id}`,
      input
    ),

  remove: (id: string) => apiClient.delete<{ message: string }>(`/groups/${id}`),

  regenerateInviteCode: (groupId: string) =>
    apiClient.post<{ id: string; code: string; isActive: boolean; usageCount: number }>(
      `/groups/${groupId}/invite-code`
    ),

  disableInviteCode: (groupId: string) =>
    apiClient.patch<{ message: string }>(`/groups/${groupId}/invite-code`, undefined),

  profile: (groupId: string) => apiClient.get<GroupProfile>(`/groups/${groupId}/profile`),

  profileMembers: (groupId: string, cursor?: string | null) =>
    apiClient.get<{ members: ProfileMember[]; nextCursor: string | null }>(
      `/groups/${groupId}/profile/members`,
      cursor ? { cursor } : undefined
    ),

  shared: <K extends SharedKind>(groupId: string, kind: K, cursor?: string | null) =>
    apiClient.get<Page<K extends "links" ? SharedLink : SharedFile>>(
      `/groups/${groupId}/shared`,
      cursor ? { kind, cursor } : { kind }
    ),

  members: (groupId: string) =>
    apiClient.get<{ members: GroupMemberEntry[] }>(`/groups/${groupId}/members`),

  updatePhoto: (groupId: string, formData: FormData) =>
    apiClient.putForm<{ id: string; avatarUrl: string }>(`/groups/${groupId}/photo`, formData),

  removePhoto: (groupId: string) =>
    apiClient.delete<{ id: string; avatarUrl: null }>(`/groups/${groupId}/photo`),
};
