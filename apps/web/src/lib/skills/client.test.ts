/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPack, downloadZip } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("skills client", () => {
  it("leaves out a blank role", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { id: "p1" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await createPack("I write reports.", "   ");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ description: "I write reports." });
  });

  it("reports the server's message when a download is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: "NOTHING_TO_DOWNLOAD", message: "Generate a skill first." } }), { status: 409 })),
    );
    expect(await downloadZip("/x")).toEqual({ ok: false, message: "Generate a skill first." });
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
    expect(await downloadZip("/x")).toEqual({ ok: true });
    expect(click).toHaveBeenCalledTimes(1);
  });
});
