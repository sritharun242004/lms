/** PDFs are read as Latin-1 text: only the header and uncompressed dictionary keys are looked at. */
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");

/** A PDF with an /Encrypt dictionary needs a password (or restricts reading); Claude can't read it. */
export function isEncryptedPdf(bytes: Uint8Array): boolean {
  return /\/Encrypt\b/.test(latin1(bytes));
}
