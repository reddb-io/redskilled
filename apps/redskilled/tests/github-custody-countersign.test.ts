// Durable custody closes the exact-head Countersign gap from reddb-io/red-skills#4138.
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCountersignLedger } from "@reddb-io/shared/countersign-ledger.js";
import { createGithubCustodian, type RedskilledGithubCustodyUpstream } from "../src/github-custody.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
const HEAD = "a".repeat(40);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "custody-countersign-"));
  const project = { projectId: "github:1", projectLabel: "acme/repo", workspacePath: root, credentialProfile: "personal" };
  let native = false;
  const arm = vi.fn(async () => { native = true; return view(); });
  const disarm = vi.fn(async () => { native = false; });
  const view = () => ({ forge_state: "open-clean" as const, native_intent: native, head_sha: HEAD });
  const upstream: RedskilledGithubCustodyUpstream = { observe: async () => view(), arm, disarm };
  const custodian = createGithubCustodian({ path: join(root, "custody.toon"), upstream, clock: () => new Date().toISOString(), tickMs: 10, inertMs: 60_000 });
  cleanups.push(async () => { custodian.close(); await rm(root, { recursive: true, force: true }); });
  await custodian.handoff(project, { secret: "fixture" }, { pull_request: 42, owner_ticket: 12, branch: "worker/12", base: "main", armed_head: HEAD });
  const ledger = createCountersignLedger(root);
  const key = { pr: 42, head_sha: HEAD, patch_id: "patch" };
  return { ledger, key, arm, disarm, status: () => custodian.status(project, { secret: "fixture" }) };
}

describe("independent merge authorization in custody", () => {
  it("retains a PR without arming its merge when nobody countersigned the commit", async () => {
    const h = await fixture();
    await vi.waitFor(async () => expect((await h.status()).records[0]?.next_action).toBe("await-countersign"));
    expect(h.arm).not.toHaveBeenCalled();
    expect((await h.status()).records[0]?.countersign_refusal).toContain("no row");
  });

  it("arms the reviewed head and revokes the intent after its countersign is voided", async () => {
    const h = await fixture();
    await h.ledger.append({ ...h.key, countersign: "test-verified", verifier_identity: "human:reviewer" });
    await vi.waitFor(() => expect(h.arm).toHaveBeenCalled());
    await h.ledger.void({ ...h.key, countersign: "test-verified", verifier_identity: "human:reviewer", reason: "review withdrawn" });
    await vi.waitFor(() => expect(h.disarm).toHaveBeenCalled());
    expect((await h.status()).records[0]?.next_action).toBe("await-countersign");
  });

  it("refuses a passing row for another commit", async () => {
    const h = await fixture();
    await h.ledger.append({ ...h.key, head_sha: "b".repeat(40), countersign: "test-verified", verifier_identity: "human:reviewer" });
    await vi.waitFor(async () => expect((await h.status()).records[0]?.countersign_refusal).toContain("no row"));
    expect(h.arm).not.toHaveBeenCalled();
  });
});
