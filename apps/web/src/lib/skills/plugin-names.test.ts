import { describe, expect, it } from "vitest";
import { isValidSkillName } from "./names";
import { defaultPluginDisplayName, defaultPluginName, effectivePlugin } from "./plugin-names";

describe("default plugin names", () => {
  it("joins company and title", () => {
    expect(defaultPluginName("Acme", "Quarterly deck")).toBe("acme-quarterly-deck");
    expect(defaultPluginDisplayName("Acme", "Quarterly deck")).toBe("Acme · Quarterly deck");
  });

  it("uses the title alone without a company", () => {
    expect(defaultPluginName("", "Quarterly deck")).toBe("quarterly-deck");
    expect(defaultPluginDisplayName("  ", "Quarterly deck")).toBe("Quarterly deck");
  });

  it("folds unicode and keeps a valid id", () => {
    const id = defaultPluginName("Café Müller", "Menü — weekly");
    expect(id).toBe("cafe-muller-menu-weekly");
    expect(isValidSkillName(id)).toBe(true);
  });

  it("falls back when nothing usable is left", () => {
    expect(defaultPluginName("", "")).toBe("my-plugin");
    expect(defaultPluginName("!!!", "日本")).toBe("my-plugin");
    expect(defaultPluginDisplayName("", "  ")).toBe("My plugin");
    expect(defaultPluginDisplayName("Acme", "")).toBe("Acme");
  });

  it("keeps the display name on one line within 120 characters", () => {
    const name = defaultPluginDisplayName("Acme\nCorp", `${"x".repeat(200)}`);
    expect(name.length).toBe(120);
    expect(name).not.toContain("\n");
    expect(name.startsWith("Acme Corp · ")).toBe(true);
  });
});

describe("effectivePlugin", () => {
  const job = { company: "Acme", title: "Quarterly deck", pluginName: null, pluginDisplayName: null };

  it("follows company and title while unset", () => {
    expect(effectivePlugin(job)).toEqual({
      name: "acme-quarterly-deck",
      nameIsDefault: true,
      displayName: "Acme · Quarterly deck",
      displayNameIsDefault: true,
    });
  });

  it("uses the set values", () => {
    expect(effectivePlugin({ ...job, pluginName: "deck-kit", pluginDisplayName: "Deck kit" })).toEqual({
      name: "deck-kit",
      nameIsDefault: false,
      displayName: "Deck kit",
      displayNameIsDefault: false,
    });
  });
});
