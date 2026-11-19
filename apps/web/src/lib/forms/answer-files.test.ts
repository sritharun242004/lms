import { describe, expect, it, vi, beforeEach } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { formAnswerFile: { create } } }));

import { storeAnswerFile, MAX_ANSWER_FILE_SIZE_BYTES } from "./answer-files";

beforeEach(() => {
  create.mockReset();
});

describe("storeAnswerFile", () => {
  it("rejects a file over the size limit", async () => {
    await expect(
      storeAnswerFile({ mimeType: "image/png", fileName: "x.png", size: MAX_ANSWER_FILE_SIZE_BYTES + 1, data: Buffer.alloc(1) })
    ).rejects.toThrow(/too large/i);
  });

  it("stores the file and returns its id", async () => {
    create.mockResolvedValue({ id: "file1", fileName: "resume.pdf" });
    const result = await storeAnswerFile({ mimeType: "application/pdf", fileName: "resume.pdf", size: 10, data: Buffer.alloc(10) });
    expect(result).toEqual({ fileId: "file1", fileName: "resume.pdf" });
  });
});
