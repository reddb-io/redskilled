// ADR 0172: boot deletes no git worktree on its own. A dead attempt dir that
// holds one is kept and reported; the human removes it from the Project's
// "Clean worktrees space" action. Only `afk.worktrees.auto_clean: true` restores
// the unattended removal.
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG_DEFAULTS } from "../src/core/config.js";
import { holdsWorktree } from "../src/runtime/fs.js";
import { DAY, NOW, makeDeps, options, runBoot } from "./boot.helpers.js";

const HOLDS = "/p/.red/tmp/workers/wAAA/101";
const PLAIN = "/p/.red/tmp/workers/wBBB/102";

function closedOrphans() {
  return options({
    orphans: [
      { path: HOLDS, issue: 101, ageS: 99 * DAY },
      { path: PLAIN, issue: 102, ageS: 99 * DAY },
    ],
    legacyWorkDirs: ["/p/.red/tmp/work-legacy"],
    attemptCap: {
      byIssue: new Map([[7, [{ path: "/p/.red/tmp/workers/wAAA/7-a1", mtimeS: NOW - 99 * DAY, live: false }]]]),
    },
  });
}

describe("boot keeps worktree-holding dirs (ADR 0172)", () => {
  it("defaults afk.worktrees.auto_clean to off", () => {
    expect(CONFIG_DEFAULTS["afk.worktrees.auto_clean"]).toBe("false");
  });

  it("removes a plain dead attempt dir but keeps and reports one that holds a worktree", async () => {
    const log: string[] = [];
    const harness = makeDeps({
      orphanState: async () => ({ ghOk: true, state: "CLOSED", label: null, envelopePosted: false }),
      log: (line) => log.push(line),
    });
    const deps = {
      ...harness.deps,
      fs: { ...harness.deps.fs, holdsWorktree: async (path: string) => path.includes("/wAAA/") || path.endsWith("work-legacy") },
    };

    const result = await runBoot(deps, closedOrphans());

    expect(harness.fsCalls.removeDir).toEqual([PLAIN]);
    expect(result.orphanCleanup).toMatchObject({
      removed: [PLAIN],
      legacyWiped: [],
      worktreesKept: ["/p/.red/tmp/work-legacy", HOLDS],
    });
    expect(result.attemptCap).toEqual({ reclaimed: [], worktreesKept: ["/p/.red/tmp/workers/wAAA/7-a1"] });
    expect(log).toContain(`boot kept ${HOLDS}: it holds a git worktree; remove it from Clean worktrees space`);
  });

  it("keeps the dir when the worktree probe cannot answer", async () => {
    const harness = makeDeps({
      orphanState: async () => ({ ghOk: true, state: "CLOSED", label: null, envelopePosted: false }),
    });
    const deps = {
      ...harness.deps,
      fs: { ...harness.deps.fs, holdsWorktree: async () => { throw new Error("EACCES"); } },
    };

    const result = await runBoot(deps, closedOrphans());

    expect(harness.fsCalls.removeDir).toEqual([]);
    expect(result.orphanCleanup?.worktreesKept).toHaveLength(3);
  });

  it("removes worktree-holding dirs only when the repository opted in", async () => {
    const harness = makeDeps({
      orphanState: async () => ({ ghOk: true, state: "CLOSED", label: null, envelopePosted: false }),
      config: { "afk.worktrees.auto_clean": "true" },
    });
    const deps = { ...harness.deps, fs: { ...harness.deps.fs, holdsWorktree: async () => true } };

    const result = await runBoot(deps, closedOrphans());

    expect(harness.fsCalls.removeDir).toEqual([
      "/p/.red/tmp/work-legacy",
      HOLDS,
      PLAIN,
      "/p/.red/tmp/workers/wAAA/7-a1",
    ]);
    expect(result.orphanCleanup?.worktreesKept).toBeUndefined();
  });

  it("never prunes or removes a worktree registration through boot's git port", async () => {
    const harness = makeDeps();
    expect(Object.keys(harness.deps.git).sort()).toEqual(["deleteLocalBranch", "deleteRemoteBranch"]);
  });
});

describe("holdsWorktree", () => {
  it("recognises a linked worktree's .git FILE at the dir, its worktree/ child, or one attempt down", async () => {
    const root = await mkdtemp(join(tmpdir(), "boot-holds-worktree-"));
    const direct = join(root, "direct");
    const attempt = join(root, "attempt");
    const worker = join(root, "worker");
    const clone = join(root, "clone");
    const empty = join(root, "empty");
    await mkdir(direct, { recursive: true });
    await writeFile(join(direct, ".git"), "gitdir: /repo/.git/worktrees/direct\n");
    await mkdir(join(attempt, "worktree"), { recursive: true });
    await writeFile(join(attempt, "worktree", ".git"), "gitdir: /repo/.git/worktrees/attempt\n");
    await mkdir(join(worker, "101", "worktree"), { recursive: true });
    await writeFile(join(worker, "101", "worktree", ".git"), "gitdir: /repo/.git/worktrees/w\n");
    await mkdir(join(clone, ".git"), { recursive: true });
    await mkdir(empty, { recursive: true });

    await expect(holdsWorktree(direct)).resolves.toBe(true);
    await expect(holdsWorktree(attempt)).resolves.toBe(true);
    await expect(holdsWorktree(worker)).resolves.toBe(true);
    // A clone owns its repository; only a linked worktree's `.git` is a file.
    await expect(holdsWorktree(clone)).resolves.toBe(false);
    await expect(holdsWorktree(empty)).resolves.toBe(false);
    await expect(holdsWorktree(join(root, "absent"))).resolves.toBe(false);
  });
});
