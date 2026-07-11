import { loadServerSpec } from "@mcp-foundry/spec";
import { validateSpec } from "@mcp-foundry/validator";
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./index.js";

describe("curated templates", () => {
  it.each(TEMPLATES.map((template) => [template.id, template] as const))(
    "%s template's spec is structurally valid and passes validateSpec",
    (_id, template) => {
      const raw = template.buildSpec();
      const loaded = loadServerSpec(raw);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;

      const result = validateSpec(loaded.value);
      expect(result).toEqual({ valid: true, violations: [] });
    },
  );

  it("has 3-4 templates, each with at least 3 tools", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(TEMPLATES.length).toBeLessThanOrEqual(4);
    for (const template of TEMPLATES) {
      expect(template.buildSpec().tools.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("personalizes name/slug when a name override is given, leaving tools untouched", () => {
    const template = TEMPLATES[0]!;
    const original = template.buildSpec();
    const personalized = template.buildSpec({ name: "My Custom Server!" });
    expect(personalized.name).toBe("My Custom Server!");
    expect(personalized.slug).toBe("my-custom-server");
    expect(personalized.tools).toEqual(original.tools);
  });

  it("never returns a shared mutable instance across calls", () => {
    const template = TEMPLATES[0]!;
    const first = template.buildSpec();
    first.tools[0]!.name = "mutated";
    const second = template.buildSpec();
    expect(second.tools[0]!.name).not.toBe("mutated");
  });
});
