import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { resolveAcpProjectIdentity, resolveRegisteredDemandIdentity } from "../src/project-workspace.js";

describe("an unattended drain keeps its registered Project identity", () => {
  it("recovers the cached identity from Git config when Git cannot read the checkout", async () => {
    const root = await mkdtemp(join(tmpdir(), "redskilled-identity-"));
    try {
      await mkdir(join(root, ".git"));
      await mkdir(join(root, "nested"));
      await writeFile(join(root, ".git", "config"),
        '[remote "origin"]\n\turl = git@github.com:JoaoMarcosChaves/sofia-assistent.git\n');
      const read = vi.fn(async () => ({
        github_id: "1111399847",
        full_name: "JoaoMarcosChaves/sofia-assistent",
      }));

      const identity = await resolveAcpProjectIdentity(join(root, "nested"), {
        identityCache: { read, remember: vi.fn() },
      });

      expect(read).toHaveBeenCalledWith("JoaoMarcosChaves/sofia-assistent");
      expect(identity).toMatchObject({
        projectId: "github:1111399847",
        checkoutRoot: root,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses the durable GitHub identity even when the checkout cannot be inspected", async () => {
    const read = vi.fn(async () => ({
      github_id: "1111399847",
      full_name: "JoaoMarcosChaves/sofia-assistent",
    }));

    const identity = await resolveRegisteredDemandIdentity(
      "/checkout/that/is/not/available",
      "JoaoMarcosChaves/sofia-assistent",
      { identityCache: { read, remember: vi.fn() } },
    );

    expect(read).toHaveBeenCalledWith("JoaoMarcosChaves/sofia-assistent");
    expect(identity).toMatchObject({
      projectId: "github:1111399847",
      projectLabel: "JoaoMarcosChaves/sofia-assistent",
      checkoutRoot: "/checkout/that/is/not/available",
    });
  });

  it("refuses a local fallback for a registered GitHub queue", async () => {
    await expect(resolveRegisteredDemandIdentity(
      "/checkout/that/is/not/available",
      "JoaoMarcosChaves/sofia-assistent",
      { identityCache: { read: async () => undefined, remember: vi.fn() } },
    )).rejects.toThrow(/canonical GitHub identity/);
  });
});
