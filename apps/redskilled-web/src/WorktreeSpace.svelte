<!-- "Clean worktrees space" for one Project (ADR 0172): show what its linked
     worktrees hold on disk, let the human pick, remove only on confirm. -->
<script module lang="ts">
  // Measuring walks the disk, so Projects are scanned one at a time.
  let scanQueue: Promise<unknown> = Promise.resolve();
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { Badge, Button, Dialog } from "@reddb-io/design-system/base";
  import { HardDrive, RefreshCw } from "lucide-svelte";

  type Group = "merged" | "clean" | "stale" | "dirty" | "in-use";
  type Entry = {
    path: string;
    branch: string | null;
    created_by: string;
    lane?: string;
    size_bytes: number;
    size_complete: boolean;
    dirty_files: number;
    merged: boolean;
    missing: boolean;
    broken: boolean;
    in_use?: string;
    last_activity_at: string | null;
    group: Group;
    needs_force: boolean;
  };
  type Space = { total_bytes: number; total_complete: boolean; stale_after_days: number; merged_base: string | null; worktrees: Entry[] };
  type Skipped = { path: string; reason: string; detail?: string };
  type CleanAnswer = { freed_bytes: number; freed_complete: boolean; removed: { path: string; bytes: number }[]; skipped: Skipped[] };

  let { projectLabel, run }: {
    projectLabel: string;
    run: (operation: string, input: Record<string, unknown>) => Promise<unknown>;
  } = $props();

  let space = $state<Space | null>(null);
  let scanning = $state(false);
  let cleaning = $state(false);
  let failure = $state("");
  let selected = $state<Record<string, boolean>>({});
  let forced = $state<Record<string, boolean>>({});
  let result = $state<CleanAnswer | null>(null);

  const worktrees = $derived(space?.worktrees ?? []);
  const sections = $derived([
    { id: "removable", title: "Merged or clean", help: "No uncommitted work. Selected by default.", entries: worktrees.filter((entry) => entry.group === "merged" || entry.group === "clean") },
    { id: "stale", title: "Stale", help: `Clean and idle for more than ${space?.stale_after_days ?? 14} days, or already gone from disk. Selected by default.`, entries: worktrees.filter((entry) => entry.group === "stale") },
    { id: "dirty", title: "Dirty", help: "Uncommitted changes or a broken checkout. Not selected; each one needs its own confirmation.", entries: worktrees.filter((entry) => entry.group === "dirty") },
    { id: "in-use", title: "In use", help: "A Worker, a running process or a git lock is using it. It cannot be removed here.", entries: worktrees.filter((entry) => entry.group === "in-use") },
  ].filter((section) => section.entries.length > 0));
  const chosen = $derived(worktrees.filter((entry) => entry.group !== "in-use" && selected[entry.path] === true && (!entry.needs_force || forced[entry.path] === true)));
  const chosenBytes = $derived(chosen.reduce((sum, entry) => sum + entry.size_bytes, 0));
  const awaitingConfirmation = $derived(worktrees.filter((entry) => entry.needs_force && selected[entry.path] === true && forced[entry.path] !== true).length);

  onMount(() => { void scan(); });

  function scan(): Promise<void> {
    const next = scanQueue.then(async () => {
      scanning = true;
      failure = "";
      try {
        const value = await run("worktree_space", { project_label: projectLabel, params: {} }) as Space;
        space = value;
        selected = Object.fromEntries(value.worktrees.map((entry) => [entry.path, entry.group === "merged" || entry.group === "clean" || entry.group === "stale"]));
        forced = {};
      } catch (cause) {
        failure = cause instanceof Error ? cause.message : String(cause);
      } finally {
        scanning = false;
      }
    });
    scanQueue = next.catch(() => undefined);
    return next;
  }

  async function clean(): Promise<void> {
    if (chosen.length === 0) return;
    cleaning = true;
    failure = "";
    result = null;
    try {
      result = await run("worktree_clean", {
        project_label: projectLabel,
        params: {
          select: "paths",
          paths: chosen.map((entry) => entry.path),
          force: chosen.filter((entry) => entry.needs_force).map((entry) => entry.path),
        },
      }) as CleanAnswer;
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : String(cause);
    } finally {
      cleaning = false;
    }
    await scan();
  }

  function bytes(value: number, complete = true): string {
    const prefix = complete ? "" : "≥ ";
    if (value <= 0) return `${prefix}0 B`;
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    return `${prefix}${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
  }

  function idle(iso: string | null): string {
    if (iso == null) return "activity unknown";
    const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
    return days <= 0 ? "active today" : days === 1 ? "idle 1 day" : `idle ${days} days`;
  }

  const creator: Record<string, string> = { redcode: "redcode", redskilled: "redskilled", "redskilled-worker": "worker", other: "other" };
  const skipReason: Record<string, string> = {
    "in-use": "in use",
    "needs-force": "needs confirmation",
    "not-a-worktree": "no longer a worktree",
    "primary-checkout": "primary checkout",
    failed: "git refused",
  };

  const triggerText = $derived(space == null ? (scanning ? "Measuring worktrees…" : "Clean worktrees space") : `Clean worktrees space · ${bytes(space.total_bytes, space.total_complete)}`);
</script>

<span class="space-action">
  <Dialog triggerLabel={`Clean worktrees space for ${projectLabel}`} title="Clean worktrees space" description={`${projectLabel} · worktrees are listed from git; nothing is removed until you confirm.`} class="space-dialog">
    {#snippet trigger()}<HardDrive size={14} />{triggerText}{/snippet}
    {#if failure}<p class="space-failure" role="alert">{failure}</p>{/if}
    {#if result}
      <div class="space-result" role="status">
        <strong>Freed {bytes(result.freed_bytes, result.freed_complete)} from {result.removed.length} worktree{result.removed.length === 1 ? "" : "s"}.</strong>
        {#each result.skipped as skipped (skipped.path)}<small>Kept {skipped.path}: {skipReason[skipped.reason] ?? skipped.reason}{skipped.detail ? ` — ${skipped.detail}` : ""}</small>{/each}
      </div>
    {/if}
    <div class="space-summary">
      <span>{worktrees.length} linked worktree{worktrees.length === 1 ? "" : "s"}{space ? ` · ${bytes(space.total_bytes, space.total_complete)} on disk` : ""}</span>
      <Button size="sm" variant="ghost" loading={scanning} onclick={() => void scan()}><RefreshCw size={14} />Rescan</Button>
    </div>
    {#if space != null && worktrees.length === 0}<p class="inline-empty">This Project has no linked worktrees.</p>{/if}
    {#each sections as section (section.id)}
      <section class="space-group" aria-label={section.title}>
        <header><h3>{section.title}</h3><small>{section.help}</small></header>
        {#each section.entries as entry (entry.path)}
          <div class="space-row" class:muted={entry.group === "in-use"}>
            <input type="checkbox" aria-label={`Remove ${entry.branch ?? entry.path}`} disabled={entry.group === "in-use" || cleaning} bind:checked={selected[entry.path]} />
            <div class="space-detail">
              <strong>{entry.branch ?? "detached HEAD"}</strong>
              <small>{entry.path}</small>
              <span class="space-tags">
                <Badge variant="outline">{creator[entry.created_by] ?? entry.created_by}</Badge>
                {#if entry.merged}<Badge variant="outline" class="status-success">merged</Badge>{/if}
                {#if entry.missing}<Badge variant="outline">missing on disk</Badge>{/if}
                {#if entry.broken}<Badge variant="outline" class="status-warning">broken</Badge>{/if}
                {#if entry.dirty_files > 0}<Badge variant="outline" class="status-warning">{entry.dirty_files} uncommitted</Badge>{/if}
                <small>{idle(entry.last_activity_at)}</small>
              </span>
              {#if entry.in_use}<small class="space-reason">{entry.in_use}</small>{/if}
              {#if entry.needs_force && selected[entry.path]}
                <label class="space-force">
                  <input type="checkbox" disabled={cleaning} bind:checked={forced[entry.path]} />
                  <span>Discard {entry.broken && entry.dirty_files === 0 ? "whatever this broken worktree holds" : `${entry.dirty_files} uncommitted file${entry.dirty_files === 1 ? "" : "s"}`} and remove it</span>
                </label>
              {/if}
            </div>
            <span class="space-size numeric">{entry.missing ? "—" : bytes(entry.size_bytes, entry.size_complete)}</span>
          </div>
        {/each}
      </section>
    {/each}
    {#snippet actions({ close })}
      <p class="space-note">Branches are kept. Removing a worktree deletes its directory, including ignored files such as <code>node_modules</code> or local <code>.env</code> files, and its git registration.{#if awaitingConfirmation > 0} {awaitingConfirmation} dirty worktree{awaitingConfirmation === 1 ? " is" : "s are"} waiting for its discard confirmation.{/if}</p>
      <div class="form-actions">
        <Button size="sm" variant="ghost" onclick={close}>Close</Button>
        <Button size="sm" intent="danger" disabled={chosen.length === 0 || scanning} loading={cleaning} onclick={() => void clean()}>
          Remove {chosen.length} worktree{chosen.length === 1 ? "" : "s"} · {bytes(chosenBytes, chosen.every((entry) => entry.size_complete || entry.missing))}
        </Button>
      </div>
    {/snippet}
  </Dialog>
</span>
