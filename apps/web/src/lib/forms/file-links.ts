// Kept apart from analytics.ts (which loads Prisma) so browser code can use it.

/** Staff download link for an uploaded answer file. */
export function answerFilePath(fileId: string): string {
  return `/api/v1/forms/answer-files/${fileId}`;
}
