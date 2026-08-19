export interface PhotoResponsePhoto {
  data: Uint8Array;
  mimeType: string;
  size: number;
  updatedAt: Date;
}

const PHOTO_CACHE_CONTROL = "private, max-age=31536000, immutable";

function photoEtag(photo: Pick<PhotoResponsePhoto, "updatedAt" | "size">): string {
  return `"${photo.updatedAt.getTime()}-${photo.size}"`;
}

function responseHeaders(photo: PhotoResponsePhoto, etag: string): Headers {
  return new Headers({
    "Cache-Control": PHOTO_CACHE_CONTROL,
    "Content-Length": String(photo.data.byteLength),
    "Content-Type": photo.mimeType,
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  });
}

export function photoResponse(photo: PhotoResponsePhoto, request?: Request): Response {
  const etag = photoEtag(photo);
  const headers = responseHeaders(photo, etag);

  if (request?.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(photo.data as BodyInit, { status: 200, headers });
}
