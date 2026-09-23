// worktree-space — the wire shape of `_redskills/worktree_space` and
// `_redskills/worktree_clean` (ADR 0172).
//
// Worktree lifecycle moved to redcode, which creates worktrees at
// `<repo>/.red/worktrees/<slug>`. RedSkilled no longer deletes, quarantines or
// prunes a Project's worktrees on its own. What it keeps is a user action: show
// how much disk a Project's linked worktrees hold, and remove the ones the human
// picked — only after the human confirmed, and never one that is in use.
//
// What lives here is the WIRE and only the wire: what a caller may name, what it
// reads back and the refusal vocabulary. WHICH worktrees exist, WHICH are in use
// and WHAT counts as merged are daemon verdicts, re-derived from git at every
// call; a caller never hands the daemon an inventory to trust.
import { RequestError } from "@agentclientprotocol/sdk";

/** Who created a worktree, judged from where it lives. */
export type WorktreeCreator =
  /** `<checkout>/.red/worktrees/<slug>` — redcode's lane. */
  | "redcode"
  /** A registered RedSkilled lane under `<checkout>/.red/tmp/worktrees/`. */
  | "redskilled"
  /** A RedSkilled Worker attempt worktree hanging off this checkout. */
  | "redskilled-worker"
  /** Anything else: a host CLI's `--worktree`, a hand-typed `git worktree add`. */
  | "other";

/**
 * The confirmation group a worktree belongs to.
 *
 * `merged` and `clean` hold no uncommitted work, so removing them loses nothing
 * the branch does not keep. `stale` is clean but idle past the threshold, or a
 * registration whose directory is already gone. `dirty` holds uncommitted work
 * or is broken, and is removed only with an explicit per-path force. `in-use`
 * is never removed.
 */
export type WorktreeSpaceGroup = "merged" | "clean" | "stale" | "dirty" | "in-use";

export interface WorktreeSpaceEntry {
  /** Absolute path, as git reports it. */
  readonly path: string;
  /** Checked-out branch; `null` when detached. */
  readonly branch: string | null;
  readonly head: string | null;
  readonly created_by: WorktreeCreator;
  /** The lane directory the worktree sits in, when it sits in one. */
  readonly lane?: string;
  /** Bytes on disk; a lower bound when `size_complete` is false. */
  readonly size_bytes: number;
  /** False when the time cap stopped the walk before it finished. */
  readonly size_complete: boolean;
  /** Tracked changes or untracked files that `git worktree remove` would refuse. */
  readonly dirty: boolean;
  readonly dirty_files: number;
  /** The worktree's HEAD is already contained in the Project's trunk. */
  readonly merged: boolean;
  /** Git still registers the worktree, but its directory is gone. */
  readonly missing: boolean;
  /** An `initializing` lock left by a killed creator, or a HEAD git cannot resolve. */
  readonly broken: boolean;
  /** git's lock reason when the worktree is locked (`""` for a bare lock). */
  readonly locked?: string;
  /** Why something is using the worktree; present only for `in-use`. */
  readonly in_use?: string;
  /** Most recent git activity in the worktree, ISO-8601; `null` when unknown. */
  readonly last_activity_at: string | null;
  readonly group: WorktreeSpaceGroup;
  /** Removal needs the path named in `force` as well as selected. */
  readonly needs_force: boolean;
}

/** Every linked worktree of the Project, the primary checkout excluded. */
export interface WorktreeSpaceAnswer {
  readonly version: 1;
  readonly project_label: string;
  readonly checkout_root: string;
  /** The ref `merged` was judged against; `null` when no trunk ref resolved. */
  readonly merged_base: string | null;
  readonly stale_after_days: number;
  readonly total_bytes: number;
  readonly total_complete: boolean;
  readonly worktrees: readonly WorktreeSpaceEntry[];
}

/** Which worktrees a clean request selects. */
export type WorktreeCleanSelection =
  /** Every worktree in `merged`, `clean` or `stale`. Never `dirty` or `in-use`. */
  | "clean"
  /** Every worktree in `merged`. */
  | "merged"
  /** Exactly the named paths, each re-checked against a fresh inventory. */
  | "paths";

export interface WorktreeCleanParams {
  readonly select: WorktreeCleanSelection;
  /** The paths to remove; required, and only read, for `select: "paths"`. */
  readonly paths?: readonly string[];
  /** Paths the human confirmed one by one to remove despite uncommitted work. */
  readonly force?: readonly string[];
}

/** Why a selected path was left in place. */
export type WorktreeCleanSkipReason =
  | "in-use"
  | "needs-force"
  | "not-a-worktree"
  | "primary-checkout"
  | "failed";

export interface WorktreeCleanAnswer {
  readonly version: 1;
  readonly project_label: string;
  readonly freed_bytes: number;
  /** False when a time-capped measurement made `freed_bytes` a lower bound. */
  readonly freed_complete: boolean;
  readonly removed: readonly { readonly path: string; readonly bytes: number }[];
  readonly skipped: readonly {
    readonly path: string;
    readonly reason: WorktreeCleanSkipReason;
    readonly detail?: string;
  }[];
}

/** Most paths one clean request may name. */
export const WORKTREE_CLEAN_MAX_PATHS = 500;

const SELECTIONS: readonly WorktreeCleanSelection[] = ["clean", "merged", "paths"];

/**
 * Validate `worktree_clean` params.
 *
 * Paths are accepted only as NAMES of worktrees: the daemon matches each one
 * against git's own inventory of this checkout and refuses everything else, so
 * a caller cannot aim a removal at an arbitrary directory.
 */
export function worktreeCleanParams(value: unknown): WorktreeCleanParams {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw RequestError.invalidParams({}, "worktree_clean requires an object naming a selection");
  }
  const unknownFields = Object.keys(value).filter((key) => !["select", "paths", "force"].includes(key));
  if (unknownFields.length > 0) {
    throw RequestError.invalidParams(
      { unknown_fields: unknownFields },
      "worktree_clean accepts only select, paths and force; the checkout is the connection's registration",
    );
  }
  const named = value as { readonly select?: unknown; readonly paths?: unknown; readonly force?: unknown };
  if (typeof named.select !== "string" || !(SELECTIONS as readonly string[]).includes(named.select)) {
    throw RequestError.invalidParams({}, `worktree_clean select must be one of ${SELECTIONS.join(", ")}`);
  }
  const select = named.select as WorktreeCleanSelection;
  const paths = pathList("paths", named.paths);
  const force = pathList("force", named.force);
  if (select === "paths" && (paths === undefined || paths.length === 0)) {
    throw RequestError.invalidParams({}, "worktree_clean select \"paths\" needs at least one path");
  }
  return {
    select,
    ...(paths === undefined ? {} : { paths }),
    ...(force === undefined ? {} : { force }),
  };
}

function pathList(field: "paths" | "force", value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > WORKTREE_CLEAN_MAX_PATHS ||
    value.some((entry) => typeof entry !== "string" || entry.trim() === "" || entry.length > 4_096)
  ) {
    throw RequestError.invalidParams(
      {},
      `worktree_clean ${field} must be a list of at most ${WORKTREE_CLEAN_MAX_PATHS} non-empty paths`,
    );
  }
  return [...new Set((value as string[]).map((entry) => entry.trim()))];
}
