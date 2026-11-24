// Uploaded bytes are served from the app's own origin, so a file the browser
// renders runs with the viewer's session. Only types that cannot carry script
// may display inline; HTML, SVG, XML and anything unknown are forced to a
// download with a neutral type, whatever the uploader claimed.
const INLINE_SAFE_TYPE = /^(image\/(png|jpeg|gif|webp|avif)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf)$/i;

export function isInlineSafeType(mimeType: string): boolean {
  return INLINE_SAFE_TYPE.test(mimeType.trim());
}

export function uploadedFileHeaders(file: {
  fileName: string;
  mimeType: string;
  size: number;
  inline: boolean;
}): Record<string, string> {
  const inline = file.inline && isInlineSafeType(file.mimeType);
  const asciiFallback = file.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return {
    "Content-Type": isInlineSafeType(file.mimeType) ? file.mimeType : "application/octet-stream",
    "Content-Length": String(file.size),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    "X-Content-Type-Options": "nosniff",
  };
}
