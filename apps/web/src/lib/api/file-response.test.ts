import { describe, expect, it } from "vitest";
import { uploadedFileHeaders } from "./file-response";

const base = { fileName: "answer", size: 10, inline: true };

describe("uploadedFileHeaders", () => {
  it.each(["image/png", "image/jpeg", "video/mp4", "audio/mpeg", "application/pdf"])(
    "lets %s display inline",
    (mimeType) => {
      const headers = uploadedFileHeaders({ ...base, mimeType });
      expect(headers["Content-Type"]).toBe(mimeType);
      expect(headers["Content-Disposition"]).toMatch(/^inline;/);
    }
  );

  it.each(["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", ""])(
    "forces %s to a neutral download so it cannot run script on this origin",
    (mimeType) => {
      const headers = uploadedFileHeaders({ ...base, mimeType });
      expect(headers["Content-Type"]).toBe("application/octet-stream");
      expect(headers["Content-Disposition"]).toMatch(/^attachment;/);
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    }
  );

  it("keeps a quote in the file name from breaking out of the header value", () => {
    const headers = uploadedFileHeaders({ ...base, mimeType: "image/png", fileName: 'a"; x=y.png' });
    expect(headers["Content-Disposition"]).toContain('filename="a; x=y.png"');
  });
});
