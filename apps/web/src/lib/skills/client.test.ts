/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("legacy skills client", () => {
  it("offers reads and downloads only", () => {
    expect(Object.keys(client).sort()).toEqual(["downloadZip", "getItem", "getPack", "skillPackUrl"]);
  });

  it("reports the server's message when a download is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: "NOTHING_TO_DOWNLOAD", message: "Generate a skill first." } }), { status: 409 })),
    );
    expect(await client.downloadZip("/x")).toEqual({ ok: false, message: "Generate a skill first." });
  });

  it("saves a zip under the server's filename", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([80, 75]), { headers: { "content-disposition": 'attachment; filename="my-week.zip"' } })),
    );
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("my-week.zip");
    });
    expect(await client.downloadZip("/x")).toEqual({ ok: true });
    expect(click).toHaveBeenCalledTimes(1);
  });
});
