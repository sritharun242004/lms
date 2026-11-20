import { prisma } from "@/lib/db/prisma";
import { FormError } from "./form-service";

export const MAX_ANSWER_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export async function storeAnswerFile(file: { mimeType: string; fileName: string; size: number; data: Buffer }) {
  if (file.size > MAX_ANSWER_FILE_SIZE_BYTES) {
    throw new FormError("File is too large. Maximum size is 20 MB.", "FILE_TOO_LARGE", 400);
  }
  const stored = await prisma.formAnswerFile.create({
    data: {
      mimeType: file.mimeType,
      fileName: file.fileName,
      size: file.size,
      data: new Uint8Array(file.data),
    },
  });
  return { fileId: stored.id, fileName: stored.fileName };
}
