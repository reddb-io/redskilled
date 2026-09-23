// worktree-space — how much disk a Project's linked worktrees hold, and the
// user-triggered removal of the ones the human picked (ADR 0172).
//
// Worktree lifecycle belongs to redcode now: it creates worktrees at
// `<repo>/.red/worktrees/<slug>` and owns listing and cleaning them. RedSkilled
// deletes nothing on its own any more. This module is the one place it removes
// a worktree, and it only runs because a human pressed "Clean worktrees space"
// and confirmed the list.
//
// Every verdict is re-derived from git at the moment of the call. The clean
// request names worktrees; it never carries an inventory the daemon trusts, so
// a stale browser tab cannot delete something that became dirty or busy since
// it last looked. `git worktree remove` without `--force` is the last guard: git
// itself refuses a worktree with modified or untracked files.
import { execFile } from "node:child_process";
import { lstat, readdir, readFile, readlink, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import type {
  WorktreeCleanAnswer,
  WorktreeCleanParams,
  WorktreeCreator,
  WorktreeSpaceAnswer,
  WorktreeSpaceEntry,
  WorktreeSpaceGroup,
} from "@reddb-io/protocol-acp";

import type { RedskilledRegisteredCheckout, RedskilledWorkerWorktree } from "./acp-worktree.js";

/** A worktree idle this long, with nothing to lose, is offered as stale. */
export const WORKTREE_STALE_AFTER_DAYS = 14;

/** Default time cap for measuring one worktree's size. */
const SIZE_CAP_PER_WORKTREE_MS = 3_000;

/** Default time cap for measuring every worktree of one Project. */
const SIZE_CAP_TOTAL_MS = 20_000;

const GIT_TIMEOUT_MS = 30_000;

/** Removing a worktree deletes its files; a large `node_modules` takes a while. */
const GIT_REMOVE_TIMEOUT_MS = 600_000;

export interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** A process and the directory it runs in. */
export interface ProcessCwd {
  readonly pid: number;
  readonly cwd: string;
}

export interface WorktreeSpaceDeps {
  readonly checkout: RedskilledRegisteredCheckout;
  /** The daemon's live Workers for this Project; their workspaces are in use. */
  readonly workerWorktrees: readonly RedskilledWorkerWorktree[];
  /** Run git, never rejecting. Injected so a test can pose a failure. */
  readonly git?: (cwd: string, args: readonly string[], timeoutMs?: number) => Promise<GitResult>;
  /** Working directories of this user's running processes. */
  readonly processCwds?: () => Promise<readonly ProcessCwd[]>;
  readonly now?: () => number;
  readonly sizeCapPerWorktreeMs?: number;
  readonly sizeCapTotalMs?: number;
  readonly staleAfterDays?: number;
}

/** The Project's linked worktrees, with their size, state and confirmation group. */
export async function inventoryWorktreeSpace(
  deps: WorktreeSpaceDeps,
  options: { readonly measure?: boolean } = {},
): Promise<WorktreeSpaceAnswer> {
  const inventory = await readInventory(deps);
  const now = deps.now ?? Date.now;
  const totalDeadline = now() + (deps.sizeCapTotalMs ?? SIZE_CAP_TOTAL_MS);
  const worktrees: WorktreeSpaceEntry[] = [];
  for (const entry of inventory.entries) {
    const size = options.measure === false || entry.missing
      ? { bytes: 0, complete: entry.missing }
      : await diskUsage(entry.path, Math.min(totalDeadline, now() + (deps.sizeCapPerWorktreeMs ?? SIZE_CAP_PER_WORKTREE_MS)), now);
    worktrees.push({ ...entry, size_bytes: size.bytes, size_complete: size.complete });
  }
  return {
    version: 1,
    project_label: deps.checkout.project_label,
    checkout_root: deps.checkout.checkout_root,
    merged_base: inventory.mergedBase,
    stale_after_days: deps.staleAfterDays ?? WORKTREE_STALE_AFTER_DAYS,
    total_bytes: worktrees.reduce((sum, entry) => sum + entry.size_bytes, 0),
    total_complete: worktrees.every((entry) => entry.size_complete),
    worktrees,
  };
}

/**
 * Remove the worktrees the human selected and confirmed.
 *
 * Never the primary checkout, never a worktree in use, and never a dirty or
 * broken one unless its path is ALSO named in `force`. Branches are kept: a
 * removed worktree's commits stay reachable from its branch.
 */
export async function cleanWorktreeSpace(
  deps: WorktreeSpaceDeps,
  params: WorktreeCleanParams,
): Promise<WorktreeCleanAnswer> {
  const git = deps.git ?? runGit;
  const now = deps.now ?? Date.now;
  const inventory = await readInventory(deps);
  const byPath = new Map(inventory.entries.map((entry) => [normalise(entry.path), entry]));
  const forced = new Set((params.force ?? []).map(normalise));
  const skipped: WorktreeCleanAnswer["skipped"][number][] = [];
  const targets: InventoryEntry[] = [];

  if (params.select === "paths") {
    const primaries = new Set([normalise(inventory.primary), normalise(deps.checkout.checkout_root)]);
    const seen = new Set<string>();
    for (const path of params.paths ?? []) {
      const key = normalise(path);
      const entry = byPath.get(key);
      if (seen.has(key)) continue;
      seen.add(key);
      if (primaries.has(key)) skipped.push({ path, reason: "primary-checkout" });
      else if (entry == null) skipped.push({ path, reason: "not-a-worktree" });
      else targets.push(entry);
    }
  } else {
    const groups: readonly WorktreeSpaceGroup[] = params.select === "merged" ? ["merged"] : ["merged", "clean", "stale"];
    targets.push(...inventory.entries.filter((entry) => groups.includes(entry.group)));
  }

  const removed: { path: string; bytes: number }[] = [];
  let freedComplete = true;
  const totalDeadline = now() + (deps.sizeCapTotalMs ?? SIZE_CAP_TOTAL_MS);
  for (const entry of targets) {
    if (entry.in_use !== undefined) {
      skipped.push({ path: entry.path, reason: "in-use", detail: entry.in_use });
      continue;
    }
    const force = entry.needs_force && forced.has(normalise(entry.path));
    if (entry.needs_force && !force) {
      skipped.push({ path: entry.path, reason: "needs-force" });
      continue;
    }
    const size = entry.missing
      ? { bytes: 0, complete: true }
      : await diskUsage(entry.path, Math.min(totalDeadline, now() + (deps.sizeCapPerWorktreeMs ?? SIZE_CAP_PER_WORKTREE_MS)), now);
    if (entry.locked === "initializing") await git(inventory.primary, ["worktree", "unlock", entry.path]);
    const result = await git(
      inventory.primary,
      ["worktree", "remove", ...(force ? ["--force"] : []), entry.path],
      GIT_REMOVE_TIMEOUT_MS,
    );
    if (result.code !== 0) {
      skipped.push({ path: entry.path, reason: "failed", detail: result.stderr.trim() || `git exited ${result.code}` });
      continue;
    }
    freedComplete &&= size.complete;
    removed.push({ path: entry.path, bytes: size.bytes });
  }

  return {
    version: 1,
    project_label: deps.checkout.project_label,
    freed_bytes: removed.reduce((sum, entry) => sum + entry.bytes, 0),
    freed_complete: freedComplete,
    removed,
    skipped,
  };
}

type InventoryEntry = Omit<WorktreeSpaceEntry, "size_bytes" | "size_complete">;

interface Inventory {
  readonly primary: string;
  readonly mergedBase: string | null;
  readonly entries: readonly InventoryEntry[];
}

/** git's own inventory of the checkout, each linked worktree judged once. */
async function readInventory(deps: WorktreeSpaceDeps): Promise<Inventory> {
  const git = deps.git ?? runGit;
  const root = deps.checkout.checkout_root;
  const listed = await git(root, ["worktree", "list", "--porcelain"]);
  if (listed.code !== 0) {
    throw new Error(`git worktree list failed in ${root}: ${listed.stderr.trim() || `exit ${listed.code}`}`);
  }
  const [primary, ...listedLinked] = parsePorcelain(listed.stdout);
  if (primary == null) throw new Error(`git reported no worktrees for ${root}`);
  // The registered checkout is never offered, even when it is itself a linked
  // worktree of some other primary.
  const rootReal = normalise(await realpath(root).catch(() => root));
  const linked = listedLinked.filter((record) => ![normalise(root), rootReal].includes(normalise(record.path)));
  const mergedBase = await resolveMergedBase(git, root, deps.checkout);
  const processes = await (deps.processCwds ?? listProcessCwds)().catch(() => []);
  const staleMs = (deps.staleAfterDays ?? WORKTREE_STALE_AFTER_DAYS) * 86_400_000;
  const now = (deps.now ?? Date.now)();

  const entries = await Promise.all(linked.filter((record) => !record.bare).map(async (record): Promise<InventoryEntry> => {
    const missing = record.prunable || !(await exists(record.path));
    const headResolves = record.head != null &&
      (await git(root, ["cat-file", "-e", `${record.head}^{commit}`])).code === 0;
    const broken = !missing && (record.locked === "initializing" || !headResolves);
    const status = missing || broken
      ? undefined
      : await git(record.path, ["status", "--porcelain", "--untracked-files=normal"]);
    const dirtyFiles = status == null || status.code !== 0 ? 0 : status.stdout.split("\n").filter((line) => line.trim() !== "").length;
    const statusBroken = status != null && status.code !== 0;
    const merged = mergedBase != null && headResolves && record.head != null &&
      (await git(root, ["merge-base", "--is-ancestor", record.head, mergedBase])).code === 0;
    const lastActivity = missing ? null : await lastActivityAt(record.path);
    const inUse = await inUseReason(record, deps.workerWorktrees, processes);
    const isBroken = broken || statusBroken;
    const dirty = dirtyFiles > 0;
    const group: WorktreeSpaceGroup = inUse !== undefined
      ? "in-use"
      : dirty || isBroken
        ? "dirty"
        : missing
          ? "stale"
          : merged
            ? "merged"
            : lastActivity != null && now - Date.parse(lastActivity) > staleMs
              ? "stale"
              : "clean";
    const origin = originOf(root, record.path);
    return {
      path: record.path,
      branch: record.branch,
      head: record.head,
      created_by: origin.creator,
      ...(origin.lane === undefined ? {} : { lane: origin.lane }),
      dirty,
      dirty_files: dirtyFiles,
      merged,
      missing,
      broken: isBroken,
      ...(inUse === undefined ? {} : { in_use: inUse }),
      last_activity_at: lastActivity,
      group,
      needs_force: group === "dirty",
      ...(record.locked === undefined ? {} : { locked: record.locked }),
    };
  }));
  return { primary: primary.path, mergedBase, entries };
}

interface PorcelainRecord {
  readonly path: string;
  readonly head: string | null;
  readonly branch: string | null;
  readonly bare: boolean;
  readonly locked?: string;
  readonly prunable: boolean;
}

/** Parse `git worktree list --porcelain`; records are separated by blank lines. */
export function parsePorcelain(output: string): readonly PorcelainRecord[] {
  return output.split(/\n\s*\n/).flatMap((block): PorcelainRecord[] => {
    const lines = block.split("\n").map((line) => line.trimEnd()).filter((line) => line !== "");
    const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    if (path == null || path === "") return [];
    const head = lines.find((line) => line.startsWith("HEAD "))?.slice("HEAD ".length).trim() ?? null;
    const branch = lines.find((line) => line.startsWith("branch "))?.slice("branch ".length).replace(/^refs\/heads\//, "") ?? null;
    const lockedLine = lines.find((line) => line === "locked" || line.startsWith("locked "));
    return [{
      path,
      head: head === "" || /^0+$/.test(head ?? "") ? null : head,
      branch,
      bare: lines.includes("bare"),
      ...(lockedLine === undefined ? {} : { locked: lockedLine.slice("locked".length).trim() }),
      prunable: lines.some((line) => line === "prunable" || line.startsWith("prunable ")),
    }];
  });
}

/** Who made this worktree, judged from where it lives. */
export function originOf(checkoutRoot: string, path: string): { creator: WorktreeCreator; lane?: string } {
  const relative = relativeTo(checkoutRoot, path);
  if (relative == null) {
    return normalise(path).includes("/red-skills-") && normalise(path).startsWith(normalise(tmpdir()))
      ? { creator: "redskilled-worker" }
      : { creator: "other" };
  }
  const parts = relative.split("/");
  if (parts[0] === ".red" && parts[1] === "worktrees" && parts[2] !== undefined) return { creator: "redcode", lane: ".red/worktrees" };
  if (parts[0] === ".red" && parts[1] === "tmp" && parts[2] === "worktrees" && parts[3] !== undefined) {
    return { creator: "redskilled", lane: parts[3] };
  }
  if (parts[0] === ".red" && parts[1] === "tmp" && ["workers", "go-workers", "scout-workers"].includes(parts[2] ?? "")) {
    return { creator: "redskilled-worker", lane: parts[2] };
  }
  const host = [".claude/worktrees", ".codex/worktrees", ".muse/worktrees"]
    .find((prefix) => relative === prefix || relative.startsWith(`${prefix}/`));
  return host === undefined ? { creator: "other" } : { creator: "other", lane: host };
}

/** The ref `merged` is judged against: the registered trunk, then the usual defaults. */
async function resolveMergedBase(
  git: NonNullable<WorktreeSpaceDeps["git"]>,
  root: string,
  checkout: RedskilledRegisteredCheckout,
): Promise<string | null> {
  const trunk = checkout.trunk;
  const candidates = [
    ...(trunk?.branch == null ? [] : [`${trunk.remote ?? "origin"}/${trunk.branch}`, trunk.branch]),
    "origin/HEAD",
    "origin/main",
    "main",
    "origin/master",
    "master",
  ];
  for (const candidate of candidates) {
    if ((await git(root, ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`])).code === 0) return candidate;
  }
  return null;
}

/** Why a worktree must not be touched, or undefined when nothing uses it. */
async function inUseReason(
  record: PorcelainRecord,
  workers: readonly RedskilledWorkerWorktree[],
  processes: readonly ProcessCwd[],
): Promise<string | undefined> {
  if (record.locked !== undefined && record.locked !== "initializing") {
    return record.locked === "" ? "locked in git" : `locked in git: ${record.locked}`;
  }
  const paths = [normalise(record.path), normalise(await realpath(record.path).catch(() => record.path))];
  const worker = workers.find((candidate) => paths.some((path) => overlaps(path, normalise(candidate.path))));
  if (worker !== undefined) return `Worker ${worker.worker_id} is running in it`;
  const process_ = processes.find((candidate) => paths.some((path) => contains(path, normalise(candidate.cwd))));
  if (process_ !== undefined) return `process ${process_.pid} is working in it`;
  return undefined;
}

/** Newest mtime among the worktree's git index, HEAD and HEAD reflog. */
async function lastActivityAt(path: string): Promise<string | null> {
  const gitDir = await readGitDir(path);
  const probes = gitDir == null ? [path] : [join(gitDir, "index"), join(gitDir, "HEAD"), join(gitDir, "logs", "HEAD"), path];
  const times = await Promise.all(probes.map((probe) => stat(probe).then((facts) => facts.mtimeMs).catch(() => 0)));
  const newest = Math.max(...times);
  return newest > 0 ? new Date(newest).toISOString() : null;
}

/** A linked worktree's `.git` is a file naming its private git directory. */
async function readGitDir(path: string): Promise<string | undefined> {
  const text = await readFile(join(path, ".git"), "utf8").catch(() => undefined);
  const named = text?.match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
  if (named == null || named === "") return undefined;
  return isAbsolute(named) ? named : resolve(path, named);
}

/**
 * Bytes on disk under `root`, stopping at `deadline`.
 *
 * Symlinks are not followed, so a link into another tree is never counted
 * against this one. When the deadline stops the walk the answer is a lower
 * bound and says so.
 */
export async function diskUsage(
  root: string,
  deadline: number,
  now: () => number = Date.now,
): Promise<{ bytes: number; complete: boolean }> {
  let bytes = 0;
  const pending = [root];
  while (pending.length > 0) {
    if (now() > deadline) return { bytes, complete: false };
    const directory = pending.pop() as string;
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const sizes = await Promise.all(entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        return 0;
      }
      if (entry.isSymbolicLink()) return 0;
      const facts = await lstat(path).catch(() => undefined);
      if (facts == null) return 0;
      return facts.blocks != null && facts.blocks > 0 ? facts.blocks * 512 : facts.size;
    }));
    bytes += sizes.reduce((sum, size) => sum + size, 0);
  }
  return { bytes, complete: true };
}

/**
 * Working directories of running processes, so a worktree a shell, an editor or
 * a redcode session is standing in reads as in use. Linux answers from `/proc`;
 * macOS asks `lsof`; elsewhere only the daemon's own Workers count.
 */
export async function listProcessCwds(): Promise<readonly ProcessCwd[]> {
  if (process.platform === "linux") {
    const entries = await readdir("/proc").catch(() => [] as string[]);
    const found = await Promise.all(entries.filter((name) => /^\d+$/.test(name)).map(async (name) => {
      const cwd = await readlink(`/proc/${name}/cwd`).catch(() => undefined);
      return cwd == null ? [] : [{ pid: Number(name), cwd }];
    }));
    return found.flat();
  }
  if (process.platform === "darwin") {
    const listed = await runCommand("lsof", ["-a", "-d", "cwd", "-F", "pn"], "/", 10_000);
    const found: ProcessCwd[] = [];
    let pid = 0;
    for (const line of listed.stdout.split("\n")) {
      if (line.startsWith("p")) pid = Number(line.slice(1));
      else if (line.startsWith("n") && pid > 0) found.push({ pid, cwd: line.slice(1) });
    }
    return found;
  }
  return [];
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then(() => true, () => false);
}

/** `inner` is `outer` or lies beneath it. */
function contains(outer: string, inner: string): boolean {
  return inner === outer || inner.startsWith(`${outer}/`);
}

function overlaps(a: string, b: string): boolean {
  return contains(a, b) || contains(b, a);
}

function relativeTo(root: string, path: string): string | null {
  const [r, p] = [normalise(root), normalise(path)];
  if (p === r) return "";
  return p.startsWith(`${r}/`) ? p.slice(r.length + 1) : null;
}

function normalise(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function runGit(cwd: string, args: readonly string[], timeoutMs = GIT_TIMEOUT_MS): Promise<GitResult> {
  return runCommand("git", args, cwd, timeoutMs);
}

function runCommand(command: string, args: readonly string[], cwd: string, timeoutMs: number): Promise<GitResult> {
  return new Promise((resolvePromise) => {
    execFile(command, [...args], {
      cwd,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      // Read-only probes must not take the index lock a human's editor or a
      // running agent may be about to need.
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    }, (error, stdout, stderr) => {
      const code = error == null ? 0 : typeof error.code === "number" ? error.code : 1;
      resolvePromise({ code, stdout, stderr: stderr || (error?.message ?? "") });
    });
  });
}
