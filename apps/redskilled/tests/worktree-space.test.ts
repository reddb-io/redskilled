// ADR 0172: the "Clean worktrees space" action. Real git repositories in a
// temporary directory — the verdicts under test ARE git's, so a stub would test
// the stub.
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { REDSKILLS_ACP_METHODS, worktreeCleanParams } from "@reddb-io/protocol-acp";

import { worktreeMethodDomain } from "../src/acp-worktree.js";
import {
  cleanWorktreeSpace,
  diskUsage,
  inventoryWorktreeSpace,
  listProcessCwds,
  originOf,
  parsePorcelain,
  type WorktreeSpaceDeps,
} from "../src/worktree-space.js";
import { REDSKILLED_WEB_OPERATIONS } from "../src/web-server.js";

const execFileAsync = promisify(execFile);
const DAY_MS = 86_400_000;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then(() => true, () => false);
}

/**
 * A checkout with one worktree per group:
 *   merged  — `.red/worktrees/merged` at main's tip (redcode's lane)
 *   clean   — `.red/tmp/worktrees/manual/ahead`, one unmerged commit
 *   dirty   — `.red/worktrees/dirty`, an untracked file
 *   busy    — `.red/worktrees/busy`, a process standing in it
 *   locked  — outside the checkout, locked by the human
 */
async function project() {
  const base = await mkdtemp(join(tmpdir(), "worktree-space-"));
  const root = join(base, "repo");
  await git(base, ["init", "--initial-branch=main", root]);
  await git(root, ["config", "user.email", "agent@example.test"]);
  await git(root, ["config", "user.name", "Agent"]);
  await writeFile(join(root, "tracked.txt"), "initial\n");
  await git(root, ["add", "tracked.txt"]);
  await git(root, ["commit", "-m", "initial"]);

  const paths = {
    merged: join(root, ".red", "worktrees", "merged"),
    ahead: join(root, ".red", "tmp", "worktrees", "manual", "ahead"),
    dirty: join(root, ".red", "worktrees", "dirty"),
    busy: join(root, ".red", "worktrees", "busy"),
    locked: join(base, "elsewhere"),
  };
  await git(root, ["worktree", "add", "-b", "merged", paths.merged]);
  await git(root, ["worktree", "add", "-b", "ahead", paths.ahead]);
  await writeFile(join(paths.ahead, "feature.txt"), "x".repeat(64 * 1024));
  await git(paths.ahead, ["add", "feature.txt"]);
  await git(paths.ahead, ["commit", "-m", "feature"]);
  await git(root, ["worktree", "add", "-b", "dirty", paths.dirty]);
  await writeFile(join(paths.dirty, "notes.txt"), "work in progress\n");
  await git(root, ["worktree", "add", "-b", "busy", paths.busy]);
  await git(root, ["worktree", "add", "-b", "locked", paths.locked]);
  await git(root, ["worktree", "lock", "--reason", "on a removable drive", paths.locked]);

  const deps = (over: Partial<WorktreeSpaceDeps> = {}): WorktreeSpaceDeps => ({
    checkout: { project_label: "reddb-io/demo", checkout_root: root, trunk: { remote: "origin", branch: "main" } },
    workerWorktrees: [],
    processCwds: async () => [{ pid: 4242, cwd: join(paths.busy, "src") }],
    ...over,
  });
  return { base, root, paths, deps };
}

function byPath(answer: Awaited<ReturnType<typeof inventoryWorktreeSpace>>) {
  return new Map(answer.worktrees.map((entry) => [entry.path, entry]));
}

describe("inventoryWorktreeSpace", () => {
  it("lists every linked worktree with its group, creator, size and state — never the primary checkout", async () => {
    const { root, paths, deps } = await project();

    const answer = await inventoryWorktreeSpace(deps());
    const entries = byPath(answer);

    expect(answer.merged_base).toBe("main");
    expect([...entries.keys()].sort()).toEqual(Object.values(paths).sort());
    expect(entries.has(root)).toBe(false);

    expect(entries.get(paths.merged)).toMatchObject({ group: "merged", merged: true, dirty: false, created_by: "redcode", branch: "merged", needs_force: false });
    expect(entries.get(paths.ahead)).toMatchObject({ group: "clean", merged: false, created_by: "redskilled", lane: "manual" });
    expect(entries.get(paths.dirty)).toMatchObject({ group: "dirty", dirty: true, dirty_files: 1, needs_force: true });
    expect(entries.get(paths.busy)).toMatchObject({ group: "in-use", in_use: "process 4242 is working in it" });
    expect(entries.get(paths.locked)).toMatchObject({ group: "in-use", in_use: "locked in git: on a removable drive", created_by: "other" });

    expect(entries.get(paths.ahead)!.size_bytes).toBeGreaterThanOrEqual(64 * 1024);
    expect(entries.get(paths.ahead)!.size_complete).toBe(true);
    expect(answer.total_bytes).toBe(answer.worktrees.reduce((sum, entry) => sum + entry.size_bytes, 0));
    expect(Date.parse(entries.get(paths.ahead)!.last_activity_at!)).toBeGreaterThan(Date.now() - DAY_MS);
  });

  it("offers a clean unmerged worktree as stale once it idles past the threshold, and a vanished one as stale too", async () => {
    const { paths, deps } = await project();
    await rm(paths.merged, { recursive: true, force: true });

    const entries = byPath(await inventoryWorktreeSpace(deps({ now: () => Date.now() + 30 * DAY_MS })));

    expect(entries.get(paths.ahead)).toMatchObject({ group: "stale" });
    expect(entries.get(paths.merged)).toMatchObject({ group: "stale", missing: true, size_bytes: 0, size_complete: true });
  });

  it("marks a worktree a live Worker runs in as in use", async () => {
    const { paths, deps } = await project();

    const entries = byPath(await inventoryWorktreeSpace(deps({ workerWorktrees: [{ worker_id: "w1", path: paths.ahead }] })));

    expect(entries.get(paths.ahead)).toMatchObject({ group: "in-use", in_use: "Worker w1 is running in it" });
  });

  it("reports a broken worktree (killed creator's lock, dangling HEAD) as needing force", async () => {
    const { root, paths, deps } = await project();
    const gitDir = await git(root, ["rev-parse", "--absolute-git-dir"]);
    const entry = join(gitDir, "worktrees", "merged");
    await writeFile(join(entry, "locked"), "initializing\n");
    await writeFile(join(entry, "HEAD"), `${"0".repeat(40)}\n`);

    const entries = byPath(await inventoryWorktreeSpace(deps()));

    expect(entries.get(paths.merged)).toMatchObject({ group: "dirty", broken: true, needs_force: true });
  });

  it("stops measuring at the time cap and says the size is a lower bound", async () => {
    const { paths, deps } = await project();
    let clock = 0;

    const answer = await inventoryWorktreeSpace(deps({ now: () => (clock += 10_000), sizeCapPerWorktreeMs: 1 }));

    expect(byPath(answer).get(paths.ahead)!.size_complete).toBe(false);
    expect(answer.total_complete).toBe(false);
  });
});

describe("cleanWorktreeSpace", () => {
  it("select clean removes merged, clean and stale worktrees and never a dirty or in-use one", async () => {
    const { root, paths, deps } = await project();
    const before = byPath(await inventoryWorktreeSpace(deps()));

    const answer = await cleanWorktreeSpace(deps(), { select: "clean" });

    expect(answer.removed.map((entry) => entry.path).sort()).toEqual([paths.ahead, paths.merged].sort());
    expect(answer.freed_bytes).toBe(before.get(paths.ahead)!.size_bytes + before.get(paths.merged)!.size_bytes);
    expect(answer.freed_complete).toBe(true);
    expect(await exists(paths.merged)).toBe(false);
    expect(await exists(paths.ahead)).toBe(false);
    for (const kept of [paths.dirty, paths.busy, paths.locked]) expect(await exists(kept)).toBe(true);
    expect(await exists(join(paths.dirty, "notes.txt"))).toBe(true);
    // The branch keeps the commits the removed worktree held.
    expect(await git(root, ["log", "-1", "--format=%s", "ahead"])).toBe("feature");
    expect(await git(root, ["worktree", "list", "--porcelain"])).not.toContain(paths.ahead);
  });

  it("select merged removes only merged worktrees", async () => {
    const { paths, deps } = await project();

    const answer = await cleanWorktreeSpace(deps(), { select: "merged" });

    expect(answer.removed.map((entry) => entry.path)).toEqual([paths.merged]);
    expect(await exists(paths.ahead)).toBe(true);
  });

  it("refuses a dirty worktree without its own force confirmation, and removes it with one", async () => {
    const { paths, deps } = await project();

    const refused = await cleanWorktreeSpace(deps(), { select: "paths", paths: [paths.dirty] });
    expect(refused.removed).toEqual([]);
    expect(refused.skipped).toEqual([{ path: paths.dirty, reason: "needs-force" }]);
    expect(await exists(join(paths.dirty, "notes.txt"))).toBe(true);

    // Forcing ANOTHER path does not force this one.
    const elsewhere = await cleanWorktreeSpace(deps(), { select: "paths", paths: [paths.dirty], force: [paths.ahead] });
    expect(elsewhere.skipped).toEqual([{ path: paths.dirty, reason: "needs-force" }]);

    const forced = await cleanWorktreeSpace(deps(), { select: "paths", paths: [paths.dirty], force: [paths.dirty] });
    expect(forced.removed.map((entry) => entry.path)).toEqual([paths.dirty]);
    expect(await exists(paths.dirty)).toBe(false);
  });

  it("never removes an in-use worktree, even when it is named and forced", async () => {
    const { paths, deps } = await project();

    const answer = await cleanWorktreeSpace(deps(), {
      select: "paths",
      paths: [paths.busy, paths.locked],
      force: [paths.busy, paths.locked],
    });

    expect(answer.removed).toEqual([]);
    expect(answer.skipped).toEqual([
      { path: paths.busy, reason: "in-use", detail: "process 4242 is working in it" },
      { path: paths.locked, reason: "in-use", detail: "locked in git: on a removable drive" },
    ]);
    expect(await exists(paths.busy)).toBe(true);
    expect(await exists(paths.locked)).toBe(true);
  });

  it("refuses the primary checkout and any path git does not list as a worktree", async () => {
    const { base, root, deps } = await project();
    const stranger = join(base, "not-a-worktree");
    await mkdir(stranger);
    await writeFile(join(stranger, "keep.txt"), "mine\n");

    const answer = await cleanWorktreeSpace(deps(), { select: "paths", paths: [root, stranger], force: [root, stranger] });

    expect(answer.removed).toEqual([]);
    expect(answer.skipped).toEqual([
      { path: root, reason: "primary-checkout" },
      { path: stranger, reason: "not-a-worktree" },
    ]);
    expect(await readdir(stranger)).toEqual(["keep.txt"]);
    expect(await exists(join(root, "tracked.txt"))).toBe(true);
  });

  it("drops the registration of a worktree whose directory is already gone", async () => {
    const { root, paths, deps } = await project();
    await rm(paths.ahead, { recursive: true, force: true });

    const answer = await cleanWorktreeSpace(deps(), { select: "paths", paths: [paths.ahead] });

    expect(answer.removed).toEqual([{ path: paths.ahead, bytes: 0 }]);
    expect(await git(root, ["worktree", "list", "--porcelain"])).not.toContain(paths.ahead);
  });

  it("re-judges the selection at clean time: a worktree that became dirty since the scan is kept", async () => {
    const { paths, deps } = await project();
    const scanned = byPath(await inventoryWorktreeSpace(deps()));
    expect(scanned.get(paths.ahead)!.group).toBe("clean");
    await writeFile(join(paths.ahead, "late.txt"), "typed after the scan\n");

    const answer = await cleanWorktreeSpace(deps(), { select: "paths", paths: [paths.ahead] });

    expect(answer.skipped).toEqual([{ path: paths.ahead, reason: "needs-force" }]);
    expect(await exists(join(paths.ahead, "late.txt"))).toBe(true);
  });
});

describe("process scan", () => {
  it.runIf(process.platform === "linux")("sees a real process standing in a worktree", async () => {
    const { paths, deps } = await project();
    const child = spawn("sleep", ["30"], { cwd: paths.ahead, stdio: "ignore" });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const cwds = await listProcessCwds();
      expect(cwds.some((entry) => entry.pid === child.pid)).toBe(true);

      const entries = byPath(await inventoryWorktreeSpace(deps({ processCwds: listProcessCwds })));
      expect(entries.get(paths.ahead)).toMatchObject({ group: "in-use", in_use: `process ${child.pid} is working in it` });
      const answer = await cleanWorktreeSpace(deps({ processCwds: listProcessCwds }), { select: "clean" });
      expect(answer.removed.map((entry) => entry.path)).not.toContain(paths.ahead);
      expect(await exists(paths.ahead)).toBe(true);
    } finally {
      child.kill();
    }
  });
});

describe("helpers", () => {
  it("names who created a worktree from where it lives", () => {
    expect(originOf("/repo", "/repo/.red/worktrees/fix-scroll")).toEqual({ creator: "redcode", lane: ".red/worktrees" });
    expect(originOf("/repo", "/repo/.red/tmp/worktrees/landing/x")).toEqual({ creator: "redskilled", lane: "landing" });
    expect(originOf("/repo", "/repo/.red/tmp/workers/wA/12/worktree")).toEqual({ creator: "redskilled-worker", lane: "workers" });
    expect(originOf("/repo", "/repo/.claude/worktrees/abc")).toEqual({ creator: "other", lane: ".claude/worktrees" });
    expect(originOf("/repo", "/somewhere/else")).toEqual({ creator: "other" });
  });

  it("parses git's porcelain, lock, prunable and bare records included", () => {
    expect(parsePorcelain([
      "worktree /repo",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree /repo/.red/worktrees/a",
      "HEAD def",
      "detached",
      "locked initializing",
      "prunable gitdir file points to non-existent location",
      "",
    ].join("\n"))).toEqual([
      { path: "/repo", head: "abc", branch: "main", bare: false, prunable: false },
      { path: "/repo/.red/worktrees/a", head: "def", branch: null, bare: false, locked: "initializing", prunable: true },
    ]);
  });

  it("measures a directory without following symlinks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "worktree-space-du-"));
    await writeFile(join(dir, "a.bin"), Buffer.alloc(32 * 1024));
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "nested", "b.bin"), Buffer.alloc(16 * 1024));

    const usage = await diskUsage(dir, Date.now() + 10_000);

    expect(usage.complete).toBe(true);
    expect(usage.bytes).toBeGreaterThanOrEqual(48 * 1024);
  });
});

describe("the worktree_space / worktree_clean wire", () => {
  it("validates the clean selection before the daemon sees it", () => {
    expect(worktreeCleanParams({ select: "clean" })).toEqual({ select: "clean" });
    expect(worktreeCleanParams({ select: "paths", paths: ["/a", "/a", " /b "], force: ["/a"] }))
      .toEqual({ select: "paths", paths: ["/a", "/b"], force: ["/a"] });
    expect(() => worktreeCleanParams({ select: "paths" })).toThrow();
    expect(() => worktreeCleanParams({ select: "everything" })).toThrow();
    expect(() => worktreeCleanParams({ select: "clean", checkout: "/elsewhere" })).toThrow();
    expect(() => worktreeCleanParams({ select: "paths", paths: [""] })).toThrow();
  });

  it("serves both methods through the worktree domain against the registered checkout", async () => {
    const { paths, deps } = await project();
    const base = deps();
    const domain = worktreeMethodDomain({
      registeredCheckout: () => base.checkout,
      workerWorktrees: () => [],
      space: { processCwds: base.processCwds! },
    });
    const binding = (method: string) => domain.bindings.find((entry) => entry.method === method)!;

    const space = await binding(REDSKILLS_ACP_METHODS.worktreeSpace).handle({ params: binding(REDSKILLS_ACP_METHODS.worktreeSpace).params({}), client: undefined }) as { worktrees: { path: string }[] };
    expect(space.worktrees.map((entry) => entry.path)).toContain(paths.merged);
    expect(() => binding(REDSKILLS_ACP_METHODS.worktreeSpace).params({ checkout: "/elsewhere" })).toThrow();

    const clean = binding(REDSKILLS_ACP_METHODS.worktreeClean);
    const answer = await clean.handle({ params: clean.params({ select: "merged" }), client: undefined }) as { removed: { path: string }[] };
    expect(answer.removed.map((entry) => entry.path)).toEqual([paths.merged]);
  });

  it("admits both operations to the paired web control plane", () => {
    expect(REDSKILLED_WEB_OPERATIONS).toContain("worktree_space");
    expect(REDSKILLED_WEB_OPERATIONS).toContain("worktree_clean");
  });
});
