import { apiClient } from "@/lib/api/client";
import type {
  MessageType,
  UserRole,
  UserStatus,
  PollChartType,
  SendMessageInput,
  EditMessageInput,
  CreatePollInput,
  CastVoteInput,
  CreateOpenQuestionInput,
  SubmitAnswerInput,
  CreateWordCloudInput,
  SubmitWordInput,
  WordCloudControlInput,
} from "@lms/shared";

export interface PollOptionResult {
  id: string;
  text: string;
  voteCount: number;
}

export interface PollData {
  id: string;
  question: string;
  chartType: PollChartType;
  allowMultiple: boolean;
  options: PollOptionResult[];
  totalVotes: number;
  /** The option(s) the *current viewer* picked — null if they haven't voted. */
  myVote: string | null;
}

export interface OpenAnswerResult {
  id: string;
  text: string;
  createdAt: string;
}

export interface OpenQuestionData {
  id: string;
  question: string;
  /** Insertion order — the wall never reshuffles. */
  answers: OpenAnswerResult[];
  /** The current viewer's own answer id, if they've submitted one. */
  myAnswerId: string | null;
}

export interface WordCloudEntryResult {
  id: string;
  /** Normalized display text — the merged, deduplicated word. */
  text: string;
  count: number;
  /** A hue (0-359, as a string) — combine with the active theme to render. */
  color: string;
}

export interface WordCloudData {
  id: string;
  question: string;
  maxWordsPerParticipant: number;
  maxWordLength: number;
  allowMultipleSubmissions: boolean;
  isLocked: boolean;
  /** First-seen order — stable so the layout doesn't reshuffle on update. */
  entries: WordCloudEntryResult[];
  totalSubmissions: number;
  totalParticipants: number;
  /** How many words *this viewer* has submitted so far. */
  mySubmissionCount: number;
}

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
  /** Present only when the message carries an attachment. */
  attachment?: { mimeType: string; size: number } | null;
  isPinned: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present only when `type === "POLL"`. */
  poll?: PollData | null;
  /** Present only when `type === "OPEN_QUESTION"`. */
  openQuestion?: OpenQuestionData | null;
  /** Present only when `type === "WORD_CLOUD"`. */
  wordCloud?: WordCloudData | null;
}

export const messageService = {
  list: (groupId: string, before?: string) =>
    apiClient.get<{ messages: ChatMessage[]; hasMore: boolean }>(`/groups/${groupId}/messages`, {
      before,
    }),

  send: (groupId: string, input: SendMessageInput) =>
    apiClient.post<ChatMessage>(`/groups/${groupId}/messages`, input),

  sendFile: (groupId: string, file: File, content?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (content) formData.append("content", content);
    return apiClient.postForm<ChatMessage>(`/groups/${groupId}/messages/file`, formData);
  },

  edit: (groupId: string, messageId: string, input: EditMessageInput) =>
    apiClient.patch<ChatMessage>(`/groups/${groupId}/messages/${messageId}`, input),

  remove: (groupId: string, messageId: string) =>
    apiClient.delete<{ message: string }>(`/groups/${groupId}/messages/${messageId}`),

  togglePin: (groupId: string, messageId: string) =>
    apiClient.patch<{ id: string; isPinned: boolean }>(
      `/groups/${groupId}/messages/${messageId}/pin`,
      undefined
    ),

  createPoll: (groupId: string, input: CreatePollInput) =>
    apiClient.post<ChatMessage>(`/groups/${groupId}/messages/poll`, input),

  votePoll: (groupId: string, messageId: string, input: CastVoteInput) =>
    apiClient.post<{ poll: PollData }>(
      `/groups/${groupId}/messages/${messageId}/poll/vote`,
      input
    ),

  createOpenQuestion: (groupId: string, input: CreateOpenQuestionInput) =>
    apiClient.post<ChatMessage>(`/groups/${groupId}/messages/open-question`, input),

  submitAnswer: (groupId: string, messageId: string, input: SubmitAnswerInput) =>
    apiClient.post<{ openQuestion: OpenQuestionData }>(
      `/groups/${groupId}/messages/${messageId}/open-question/answer`,
      input
    ),

  createWordCloud: (groupId: string, input: CreateWordCloudInput) =>
    apiClient.post<ChatMessage>(`/groups/${groupId}/messages/word-cloud`, input),

  submitWord: (groupId: string, messageId: string, input: SubmitWordInput) =>
    apiClient.post<{ wordCloud: WordCloudData }>(
      `/groups/${groupId}/messages/${messageId}/word-cloud/submit`,
      input
    ),

  controlWordCloud: (groupId: string, messageId: string, input: WordCloudControlInput) =>
    apiClient.patch<{ wordCloud: WordCloudData }>(
      `/groups/${groupId}/messages/${messageId}/word-cloud`,
      input
    ),
};
