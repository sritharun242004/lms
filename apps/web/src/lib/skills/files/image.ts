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
 * The copy Claude sees: rotated upright, fitted inside imageEdgePx x imageEdgePx (never enlarged), same format.
 * Always far under the API's per-image size limit; the original bytes are what the skill bundles.
 */
export async function imageForClaude(bytes: Uint8Array, kind: "PNG" | "JPEG"): Promise<{ mediaType: "image/png" | "image/jpeg"; base64: string }> {
  const edge = JOB_LIMITS.imageEdgePx;
  try {
    const resized = sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS }).rotate().resize(edge, edge, { fit: "inside", withoutEnlargement: true });
    const out = kind === "PNG" ? await resized.png().toBuffer() : await resized.jpeg({ quality: 85 }).toBuffer();
    return { mediaType: kind === "PNG" ? "image/png" : "image/jpeg", base64: out.toString("base64") };
  } catch {
    throw new FileReadError("FILE_UNREADABLE", FILE_READ_MESSAGES.unreadable);
  }
}
