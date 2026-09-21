import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWebInvitation, inspectWebInvitation, redeemWebInvitation } from "../src/web-auth.js";
import { redskilledWebPaths } from "../src/web-paths.js";
import { ensureRedskilledWebTls } from "../src/web-tls.js";

const homes: string[] = [];

afterEach(async () => {
  await Promise.all(homes.splice(0).map(async (home) => await rm(home, { recursive: true, force: true })));
});

async function home(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "redskilled-web-pairing-"));
  homes.push(path);
  return path;
}

describe("browser connection invitations", () => {
  it("can be inspected until the one-use invitation is redeemed", async () => {
    const paths = redskilledWebPaths(await home());
    const invitation = await createWebInvitation(paths, "Office laptop");

    await expect(inspectWebInvitation(paths, invitation.token)).resolves.toEqual({
      expiresAt: invitation.expiresAt,
      name: "Office laptop",
    });
    await expect(redeemWebInvitation(paths, invitation.token)).resolves.not.toBeNull();
    await expect(inspectWebInvitation(paths, invitation.token)).resolves.toBeNull();
  });
});

describe("browser TLS identity", () => {
  it("keeps the host certificate stable across service restarts", async () => {
    const paths = redskilledWebPaths(await home());
    const first = await ensureRedskilledWebTls(paths);
    const second = await ensureRedskilledWebTls(paths);

    expect(second.ca).toBe(first.ca);
    expect(second.cert).toBe(first.cert);
    expect(second.key).toBe(first.key);
    expect(await readFile(paths.certificate, "utf8")).toBe(first.cert);
  });

  it("replaces an unreadable host certificate without replacing the CA", async () => {
    const paths = redskilledWebPaths(await home());
    const first = await ensureRedskilledWebTls(paths);
    await writeFile(paths.certificate, "not a certificate", "utf8");

    const repaired = await ensureRedskilledWebTls(paths);

    expect(repaired.ca).toBe(first.ca);
    expect(repaired.cert).not.toBe(first.cert);
  });
});
