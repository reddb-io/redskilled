# 0172 — Worktree cleanup is a user action; redcode owns worktree lifecycle

- **Status**: accepted
- **Date**: 2026-09-23
- **Related**: ADR 0098 (`.red/` taxonomy — amended), ADR 0149 rule 4 (nothing auto-deletes inside a client checkout — reinforced), ADR 0150 §4 (`worktree_add` / `worktree_list`), ADR 0171 (web operation allowlist — extended)

## Context

redcode now creates a Project's worktrees at `<repo>/.red/worktrees/<slug>` and
is getting its own list and clean tooling. Two owners removing worktrees from
one checkout is how a live worktree gets deleted, and RedSkilled still carried
unattended removal paths:

- boot quarantined "broken" worktrees (an `initializing` lock with a dangling
  HEAD) with `git worktree remove --force`, then pruned the registry;
- boot wired `git worktree prune --expire=1.hour.ago` into its git port;
- the boot orphan sweep and attempt cap `rm -rf` dead attempt dirs that can
  hold a git worktree of the Project;
- the pre-4.x castle MCP (`@reddb-io/red-skills@2.x`, still resolved by stale
  synced plugins) ran that boot suite every five minutes as its periodic sweep
  with no switch. Current source has no such resident, cron or sweep.

Worktrees still use disk, and a human needs to see how much and reclaim it.

## Decision

1. **RedSkilled removes no Project worktree on its own.** Boot reports a broken
   worktree and leaves it in place, keeps any dead attempt dir that holds a
   linked worktree (a `.git` file at the dir, in `worktree/`, or one attempt
   down) and reports it, and its git port has no prune or remove operation.
2. **One opt-in, default off.** `.red/config.yaml` key
   `plugins.dev.afk.worktrees.auto_clean` (`afk.worktrees.auto_clean`, default
   `false`) restores the old unattended quarantine and attempt-dir removal for a
   repository that explicitly wants it. Nothing else re-enables automatic
   removal, and no periodic sweep exists to schedule it.
3. **Cleanup is a user action.** The web project view offers **Clean worktrees
   space**: it shows the total size of the Project's linked worktrees and opens
   a confirmation list grouped as *merged or clean* and *stale* (selected by
   default), *dirty* (unselected; each needs its own discard confirmation) and
   *in use* (never selectable). Removal happens only on the human's confirm, and
   the result states the space freed and what was kept and why.
4. **Two daemon methods carry it.** `_redskills/worktree_space` (strict empty
   params) inventories `git worktree list --porcelain` of the registered
   checkout: path, branch, size on disk under a time cap (a lower bound is
   flagged), dirty count, merged-into-trunk, missing, broken, git lock, last
   activity, creator (`redcode` for `.red/worktrees/`, `redskilled` for
   `.red/tmp/worktrees/<lane>/`, `redskilled-worker`, `other`). A worktree is
   *in use* when a live daemon Worker runs in it, a process's working directory
   is inside it (`/proc` on Linux, `lsof` on macOS), or git holds a lock other
   than `initializing`. `_redskills/worktree_clean` takes
   `{ select: clean | merged | paths, paths?, force? }`, re-derives the whole
   inventory at call time, and removes each target with `git worktree remove`
   (`--force` only for a path the human named in `force` and that needs it).
   It never removes the primary or registered checkout, an in-use worktree, or a
   path git does not list. Branches are kept. The web allowlist admits both as
   `worktree_space` and `worktree_clean`; paths are names matched against git's
   inventory, never filesystem targets, so ADR 0171's no-arbitrary-path rule
   holds.
5. **RedSkilled's own workspaces are not Project worktrees.** A daemon Worker's
   workspace is a clone under `os.tmpdir()/red-skills-<uid>/workers/<id>` (ADR
   0149) and is still released when the Worker dies; the Worker sandbox's
   `git worktree prune` runs in that clone, not in the Project. Operations that
   create a scratch worktree and remove it in the same operation (docs landing,
   PR medic, feedback) keep doing so. A Worker attempt worktree that does hang
   off the Project checkout is listed as `redskilled-worker` and cleaned like
   any other.
6. The worktree lane doctor and the `.red` taxonomy doctor register
   `.red/worktrees/` as redcode's lane, so it is neither an unregistered lane
   nor an undocumented `.red` root.

## Consequences

A broken worktree can keep failing fetch-backed boot probes until a human
removes it; the boot line names the path and the repair. Disk is reclaimed
only when a human asks, so the Projects view measures worktrees on load (one
Project at a time, time-capped). Squash-merged branches are not detected as
merged and appear as *clean* or *stale*. Removing a worktree deletes its ignored
files too (`node_modules`, local `.env`), which the confirmation list states.
Machines still running the 2.x castle MCP keep its five-minute sweep until the
synced dev plugin is updated.
