import { describe, expect, it, vi } from "vitest";
import { cn, getInitials, truncateText, formatFileSize, debounce } from "./utils";

describe("cn", () => {
  it("merges class names and resolves Tailwind conflicts", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});

describe("getInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("uppercases a single-word name", () => {
    expect(getInitials("alice")).toBe("A");
  });

  it("respects maxInitials", () => {
    expect(getInitials("Mary Jane Watson", 3)).toBe("MJW");
  });

  it("returns an empty string for blank input", () => {
    expect(getInitials("   ")).toBe("");
  });
});

describe("truncateText", () => {
  it("returns the original string when under the limit", () => {
    expect(truncateText("short", 10)).toBe("short");
  });

  it("truncates at the last word boundary and appends the suffix", () => {
    expect(truncateText("The quick brown fox jumps", 12)).toBe("The quick…");
  });

  it("uses a custom suffix", () => {
    expect(truncateText("The quick brown fox jumps", 12, "...")).toBe("The quick...");
  });
});

describe("formatFileSize", () => {
  it("formats bytes under 1KB as B", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats kilobytes with one decimal", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats whole megabytes without a decimal", () => {
    expect(formatFileSize(4 * 1024 * 1024)).toBe("4 MB");
  });
});

describe("debounce", () => {
  it("only invokes the function once after the delay, with the latest args", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("first");
    debounced("second");
    debounced("third");
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("third");
    vi.useRealTimers();
  });

  it("cancel() prevents the pending call", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("value");
    debounced.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("flush() invokes immediately with the pending args", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("value");
    debounced.flush();
    expect(fn).toHaveBeenCalledWith("value");
    vi.useRealTimers();
  });
});
