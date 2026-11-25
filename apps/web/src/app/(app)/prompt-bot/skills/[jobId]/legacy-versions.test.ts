/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./version-preview", async () => {
  const { createElement: h } = await import("react");
  return { VersionPreview: ({ skill }: { skill: { name: string; versions: unknown[] } }) => h("p", null, `preview:${skill.name}:${skill.versions.length}`) };
});

import { hasLegacyVersions, LegacyVersions } from "./legacy-versions";
import { FIXTURES } from "./plugin-fixtures";

afterEach(cleanup);

describe("LegacyVersions", () => {
  it("is offered only for tasks whose skills have single-skill versions", () => {
    expect(hasLegacyVersions(FIXTURES.migrated.skills)).toBe(true);
    expect(hasLegacyVersions(FIXTURES.readyV2.skills)).toBe(false);
  });

  it("lists each skill's earlier versions, read-only, with their downloads", () => {
    render(createElement(LegacyVersions, { jobId: "j1", skills: FIXTURES.migrated.skills }));
    const section = screen.getByRole("region", { name: "Earlier single-skill versions" });
    expect(within(section).getByText(/From before this task became a plugin/)).toBeTruthy();
    expect(within(section).getByText("preview:board-update:2")).toBeTruthy();
    expect(within(section).queryByText(/preview:board-checker/)).toBeNull();
    expect(within(section).getByRole("heading", { name: "board-update" })).toBeTruthy();
  });
});
