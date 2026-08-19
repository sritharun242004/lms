import { beforeEach, describe, expect, it, vi } from "vitest";

import { photoResponse, type PhotoResponsePhoto } from "./response";

const updatedAt = new Date(1_724_050_000_000);
const photo: PhotoResponsePhoto = {
  data: Uint8Array.from([1, 2, 3, 4]),
  mimeType: "image/webp",
  size: 4,
  updatedAt,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("photoResponse", () => {
  it("streams bytes with secure, long-lived cache headers", async () => {
    const response = photoResponse(photo);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(response.headers.get("etag")).toBe('"1724050000000-4"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(photo.data);
  });

  it("returns 304 without a body when If-None-Match matches", async () => {
    const request = new Request("http://localhost/photo", {
      headers: { "if-none-match": '"1724050000000-4"' },
    });

    const response = photoResponse(photo, request);

    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe('"1724050000000-4"');
    expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(await response.text()).toBe("");
  });

  it("streams the current bytes when If-None-Match does not match", async () => {
    const request = new Request("http://localhost/photo", {
      headers: { "if-none-match": '"old-version"' },
    });

    const response = photoResponse(photo, request);

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(photo.data);
  });
});
