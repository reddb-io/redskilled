import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const appRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

describe("Redskilled Mobile screen architecture", () => {
  it("locks the shared Hallmark system to the RedDB application theme", () => {
    const design = readFileSync(join(appRoot, "design.md"), "utf8");

    expect(design).toContain("Modern-minimal, with a technical and austere tone.");
    expect(design).toContain("**Workbench**");
    expect(design).toContain("Use the vendored RedDB Application Theme");
    expect(design).toContain("Dispatch → Workers → Hosts");
  });

  it("keeps Dispatch, Workers, and Hosts as stable destinations", () => {
    const app = readFileSync(join(appRoot, "App.tsx"), "utf8");
    const components = readFileSync(join(appRoot, "src", "design-system", "components.tsx"), "utf8");
    const screens = readFileSync(join(appRoot, "src", "ui", "screens.tsx"), "utf8");

    expect(app).toContain('useState<AppDestination>("dispatch")');
    expect(app).toContain("<DispatchScreen");
    expect(app).toContain("<WorkersScreen");
    expect(app).toContain("<HostsScreen");
    expect(components).toMatch(
      /id: "dispatch"[\s\S]*id: "workers"[\s\S]*id: "hosts"/,
    );
    expect(screens).not.toContain("SectionHeading");
    expect(screens).not.toContain("eyebrow");
  });

  it("keeps touch navigation and primary controls at accessible sizes", () => {
    const components = readFileSync(join(appRoot, "src", "design-system", "components.tsx"), "utf8");

    expect(components).toMatch(/button: \{[\s\S]*minHeight: 48/);
    expect(components).toMatch(/navigationItem: \{[\s\S]*minHeight: 58/);
    expect(components).toContain('accessibilityRole="tab"');
    expect(components).toContain("accessibilityState={{ selected }}");
  });
});
