import sharp from "sharp";
import { JOB_LIMITS } from "../limits";
import { FILE_READ_MESSAGES, FileReadError, type ImageFacts } from "./types";

/** Decoded pixels allowed per image (a 7000 x 7000 photo); a header declaring more is refused before any decode. */
const MAX_PIXELS = 50_000_000;
const FORMAT = { PNG: "png", JPEG: "jpeg" } as const;

/** Dimensions from the image header; bytes that are not a decodable image of the sniffed kind are unreadable. */
export async function extractImage(bytes: Uint8Array, kind: "PNG" | "JPEG"): Promise<ImageFacts> {
  try {
    const meta = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS }).metadata();
    if (meta.format !== FORMAT[kind] || !meta.width || !meta.height) throw new Error("not the sniffed format");
    return { kind, width: meta.width, height: meta.height };
  } catch {
    throw new FileReadError("FILE_UNREADABLE", FILE_READ_MESSAGES.unreadable);
  }
}

/**
 * The largest copy sent to Claude. The API refuses images over 5 MB, measured on the base64 text (4/3 of the
 * bytes), so 3.5 MB of bytes leaves room.
 */
export const MAX_IMAGE_BYTES_FOR_CLAUDE = 3.5 * 1024 * 1024;
/** Edges tried in turn once the full-size copy is too large; a 662 px JPEG is far under the limit. */
const FALLBACK_EDGES = [1176, 882, 662] as const;

/**
 * The copy Claude sees: rotated upright, fitted inside imageEdgePx x imageEdgePx (never enlarged), same format.
 * A copy over MAX_IMAGE_BYTES_FOR_CLAUDE (a noisy or photographic PNG can be ~10 MB at 1568 px) is re-encoded as
 * a JPEG, then made smaller, until it fits. The original bytes are what the skill bundles.
 */
export async function imageForClaude(bytes: Uint8Array, kind: "PNG" | "JPEG"): Promise<{ mediaType: "image/png" | "image/jpeg"; base64: string }> {
  let out: Buffer;
  try {
    const upright = sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS }).rotate();
    const fitted = (edge: number) => upright.clone().resize(edge, edge, { fit: "inside", withoutEnlargement: true });
    // JPEG has no transparency: transparent pixels become white, as most viewers show them.
    const asJpeg = (edge: number) => fitted(edge).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    if (kind === "PNG") {
      out = await fitted(JOB_LIMITS.imageEdgePx).png().toBuffer();
      if (out.byteLength <= MAX_IMAGE_BYTES_FOR_CLAUDE) return { mediaType: "image/png", base64: out.toString("base64") };
    }
    out = await asJpeg(JOB_LIMITS.imageEdgePx);
    for (const edge of FALLBACK_EDGES) {
      if (out.byteLength <= MAX_IMAGE_BYTES_FOR_CLAUDE) break;
      out = await asJpeg(edge);
    }
  } catch {
    throw new FileReadError("FILE_UNREADABLE", FILE_READ_MESSAGES.unreadable);
  }
  if (out.byteLength > MAX_IMAGE_BYTES_FOR_CLAUDE) throw new FileReadError("FILE_UNREADABLE", FILE_READ_MESSAGES.unreadable);
  return { mediaType: "image/jpeg", base64: out.toString("base64") };
}
