import { apiClient } from "@/lib/api/client";
import type { CreateGroupInput, UpdateGroupInput } from "@lms/shared";

export interface GroupCard {
  id: string;
  name: string;
  description: string | null;
  wallpaperUrl: string | null;
  createdAt: string;
  mentorName: string;
  memberCount: number;
  inviteCode: { id: string; code: string; isActive: boolean; usageCount: number } | null;
  canManage: boolean;
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
};
