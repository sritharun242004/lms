import { apiClient } from "@/lib/api/client";
import type { MessageType, UserRole, UserStatus, SendMessageInput, EditMessageInput } from "@lms/shared";

// Mirrors the API's MESSAGE_SELECT exactly — deliberately omits the
// full editHistory array (never fetched in list views, only the
// `isEdited` flag is), unlike the broader shared `Message` type.
export interface ChatMessage {
  id: string;
  content: string;
  type: MessageType;
  groupId: string;
  senderId: string;
  sender: {
    id: string;
    name: string;
    email: string | null;
    role: UserRole;
    avatarUrl: string | null;
    status: UserStatus;
  };
  attachmentUrl: string | null;
  attachmentName: string | null;
  isPinned: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export const messageService = {
  list: (groupId: string, before?: string) =>
    apiClient.get<{ messages: ChatMessage[]; hasMore: boolean }>(`/groups/${groupId}/messages`, {
      before,
    }),

  send: (groupId: string, input: SendMessageInput) =>
    apiClient.post<ChatMessage>(`/groups/${groupId}/messages`, input),

  edit: (groupId: string, messageId: string, input: EditMessageInput) =>
    apiClient.patch<ChatMessage>(`/groups/${groupId}/messages/${messageId}`, input),

  remove: (groupId: string, messageId: string) =>
    apiClient.delete<{ message: string }>(`/groups/${groupId}/messages/${messageId}`),

  togglePin: (groupId: string, messageId: string) =>
    apiClient.patch<{ id: string; isPinned: boolean }>(
      `/groups/${groupId}/messages/${messageId}/pin`,
      undefined
    ),
};
