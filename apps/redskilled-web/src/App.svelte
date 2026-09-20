<script lang="ts">
  import { onMount } from "svelte";
  import { decode, encode, type JsonValue } from "@reddb-io/toon";
  import { Badge, Button, Logo } from "@reddb-io/design-system/base";
  import { Activity, Bot, Boxes, Brain, FolderGit2, Gauge, RefreshCw, ShieldCheck, Square, WifiOff } from "lucide-svelte";

  type View = "overview" | "projects" | "workers" | "worktrees" | "knowledge" | "devices";
  type RecordValue = Record<string, unknown>;
  type Snapshot = { version: number; generated_at: string; csrf: string; state: RecordValue; devices: RecordValue[] };

  let snapshot = $state<Snapshot | null>(null);
  let view = $state<View>("overview");
  let error = $state("");
  let locked = $state(false);
  let loading = $state(true);
  let action = $state("");
  let selectedProject = $state("");
  let worktreeSlug = $state("");
  let worktreeBranch = $state("");
  let worktreeBase = $state("");
  let worktreeInventory = $state<RecordValue | null>(null);
  let brainQuery = $state("");
  let brainTitle = $state("");
  let brainContent = $state("");
  let brainResult = $state<unknown>(null);
  let memoryQuery = $state("");
  let memoryResult = $state<unknown>(null);
  let streamAbort: AbortController | null = null;

  const workers = $derived((snapshot?.state.workers as RecordValue[] | undefined) ?? []);
  const registrations = $derived((snapshot?.state.registrations as RecordValue[] | undefined) ?? []);
  const ceiling = $derived((snapshot?.state.ceiling as RecordValue | undefined) ?? {});
  const budget = $derived((snapshot?.state.budget_accounting as RecordValue | undefined) ?? {});

  onMount(() => {
    void refresh().then(connectStream);
    return () => streamAbort?.abort();
  });

  async function refresh(): Promise<void> {
    loading = snapshot == null;
    error = "";
    try {
      const response = await fetch("/api/v1/state", { credentials: "same-origin" });
      locked = response.status === 401;
      if (!response.ok) throw new Error(response.status === 401 ? "This browser has not been paired." : await response.text());
      snapshot = decode(await response.text()) as unknown as Snapshot;
      if (selectedProject === "" && registrations.length > 0) selectedProject = text(registrations[0]?.project_label, "");
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
    }
  }

  async function connectStream(): Promise<void> {
    if (locked) return;
    streamAbort?.abort();
    streamAbort = new AbortController();
    try {
      const response = await fetch("/api/v1/events", { credentials: "same-origin", signal: streamAbort.signal });
      if (!response.ok || response.body == null) return;
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let held = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        held += value;
        let boundary = held.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = held.slice(0, boundary).trim();
          held = held.slice(boundary + 2);
          if (frame !== "") {
            const message = decode(frame) as unknown as { event?: string; snapshot?: Snapshot; error?: string };
            if (message.event === "snapshot" && message.snapshot != null) snapshot = message.snapshot;
            if (message.event === "revoked") {
              locked = true;
              error = message.error ?? "This browser session was revoked or expired.";
              return;
            }
          }
          boundary = held.indexOf("\n\n");
        }
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) error = "Live updates disconnected. Retrying…";
    }
    if (!streamAbort.signal.aborted) setTimeout(() => void connectStream(), 2_000);
  }

  async function command(operation: string, input: RecordValue, key = operation): Promise<unknown> {
    if (snapshot == null) return;
    action = key;
    error = "";
    try {
      const response = await fetch("/api/v1/commands", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/toon", "x-redskilled-csrf": snapshot.csrf },
        body: encode({ version: 1, command_id: crypto.randomUUID(), operation, input } as unknown as JsonValue),
      });
      const result = decode(await response.text()) as unknown as { ok?: boolean; error?: string; value?: unknown };
      if (!response.ok || result.ok === false) throw new Error(result.error ?? `Command failed (${response.status})`);
      await refresh();
      return result.value;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      action = "";
    }
  }

  async function listWorktrees(): Promise<void> {
    const value = await command("worktree_list", { project_label: selectedProject, params: {} }, "worktree:list");
    if (value != null) worktreeInventory = value as RecordValue;
  }

  async function addWorktree(): Promise<void> {
    const params = {
      slug: worktreeSlug,
      ...(worktreeBranch.trim() === "" ? {} : { branch: worktreeBranch.trim() }),
      ...(worktreeBase.trim() === "" ? {} : { base: worktreeBase.trim() }),
    };
    const value = await command("worktree_add", { project_label: selectedProject, params }, "worktree:add");
    if (value != null) {
      worktreeSlug = ""; worktreeBranch = ""; worktreeBase = "";
      await listWorktrees();
    }
  }

  async function callBrain(tool: "brain_status" | "brain_search" | "brain_capture"): Promise<void> {
    const arguments_ = tool === "brain_search" ? { query: brainQuery } : tool === "brain_capture" ? { title: brainTitle, content: brainContent } : {};
    brainResult = await command("brain_call", { project_label: selectedProject, params: { tool, arguments: arguments_ } }, `brain:${tool}`) ?? null;
    if (tool === "brain_capture" && brainResult != null) { brainTitle = ""; brainContent = ""; }
  }

  async function callMemory(tool: "memory_stats" | "memory_recall" | "memory_search"): Promise<void> {
    const arguments_ = tool === "memory_stats" ? {} : { query: memoryQuery };
    memoryResult = await command("memory_call", { project_label: selectedProject, params: { tool, arguments: arguments_ } }, `memory:${tool}`) ?? null;
  }

  const pretty = (value: unknown) => value == null ? "No result yet." : encode(value as JsonValue);

  const text = (value: unknown, fallback = "—") => typeof value === "string" && value !== "" ? value : fallback;
  const number = (value: unknown) => typeof value === "number" ? value : 0;
  const age = (iso: unknown) => {
    if (typeof iso !== "string") return "unknown";
    const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1_000));
    return seconds < 60 ? `${seconds}s ago` : seconds < 3_600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3_600)}h ago`;
  };
  function formatBytes(value: number): string {
    if (value <= 0) return "0 B";
    const units = ["B", "KiB", "MiB", "GiB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
  }
  function formatPercent(value: unknown): string {
    return typeof value === "number" ? `${Math.round(value * 100)}%` : "unbounded";
  }
</script>

<svelte:head><meta name="description" content="Redskilled host control plane" /></svelte:head>

<div class="shell">
  <aside class="rail">
    <div class="brand"><Logo layout="symbol" on="dark" size={28} /><span>redskilled</span></div>
    <nav aria-label="Primary">
      <button class:active={view === "overview"} onclick={() => view = "overview"}><Gauge size={17} />Overview</button>
      <button class:active={view === "projects"} onclick={() => view = "projects"}><Boxes size={17} />Projects <span>{registrations.length}</span></button>
      <button class:active={view === "workers"} onclick={() => view = "workers"}><Bot size={17} />Workers <span>{workers.length}</span></button>
      <button class:active={view === "worktrees"} onclick={() => view = "worktrees"}><FolderGit2 size={17} />Worktrees</button>
      <button class:active={view === "knowledge"} onclick={() => view = "knowledge"}><Brain size={17} />Knowledge</button>
      <button class:active={view === "devices"} onclick={() => view = "devices"}><ShieldCheck size={17} />Devices</button>
    </nav>
    <div class="rail-foot">
      <span class="live-dot"></span>
      <div><strong>Host online</strong><small>v{text(snapshot?.state.daemon_version)}</small></div>
    </div>
  </aside>

  <main>
    <header>
      <div>
        <p class="eyebrow">{text(snapshot?.state.machine_id_hash, "LOCAL HOST")}</p>
        <h1>{view[0].toUpperCase() + view.slice(1)}</h1>
      </div>
      <div class="header-actions">
        {#if snapshot}<span class="updated">Updated {age(snapshot.generated_at)}</span>{/if}
        <Button variant="secondary" size="sm" onclick={() => void refresh()} disabled={loading}><RefreshCw size={15} />Refresh</Button>
      </div>
    </header>

    {#if error}<div class:locked class="notice"><WifiOff size={17} /><span>{error}</span>{#if locked}<code>redskilled web pair</code>{/if}</div>{/if}

    {#if loading}
      <div class="skeletons" aria-label="Loading host state"><i></i><i></i><i></i></div>
    {:else if snapshot}
      {#if view === "overview"}
        <section class="metrics" aria-label="Host summary">
          <article><span>Workers</span><strong>{workers.length}<small> / {ceiling.workers ?? "∞"}</small></strong><p>{registrations.length} registered projects</p></article>
          <article><span>Memory held</span><strong>{formatBytes(number(budget.held_bytes))}</strong><p>{formatPercent(budget.held_fraction)} of host budget</p></article>
          <article><span>Queue depth</span><strong>{registrations.reduce((sum, item) => sum + number((item.last_poll as RecordValue | undefined)?.depth), 0)}</strong><p>{registrations.filter((item) => (item.last_poll as RecordValue | undefined)?.outcome === "counted").length} projects counted</p></article>
          <article><span>Request lane</span><strong class="word">{text((snapshot.state.request_health as RecordValue | undefined)?.status, "unknown")}</strong><p>{text((snapshot.state.request_health as RecordValue | undefined)?.detail, "No health detail")}</p></article>
        </section>
        <section class="split">
          <div class="surface">
            <div class="section-head"><div><p class="eyebrow">NOW</p><h2>Active work</h2></div><Activity size={18} /></div>
            {#if workers.length === 0}<div class="empty"><Bot size={28} /><strong>No Workers running</strong><p>The host is ready. Dispatch an Issue from a Project to begin.</p></div>{/if}
            {#each workers as worker}
              <div class="activity-row">
                <span class="worker-mark"></span>
                <div><strong>{text(worker.project_label)}</strong><p>{text((worker.display as RecordValue | undefined)?.phase, text(worker.phase, "Starting"))} · {text((worker.display as RecordValue | undefined)?.issue, "unassigned")}</p></div>
                <div class="row-tail"><Badge variant="outline" class="status-success">{age(worker.last_heartbeat_at)}</Badge><code>{text(worker.worker_id).slice(0, 8)}</code></div>
              </div>
            {/each}
          </div>
          <div class="surface project-queue">
            <div class="section-head"><div><p class="eyebrow">PROJECTS</p><h2>Demand</h2></div><button class="text-button" onclick={() => view = "projects"}>View all</button></div>
            {#each registrations.slice(0, 6) as project}
              <button class="project-row" onclick={() => view = "projects"}>
                <div><strong>{text(project.project_label)}</strong><p>{text((project.last_poll as RecordValue | undefined)?.detail, "Awaiting first poll")}</p></div>
                <span>{number((project.last_poll as RecordValue | undefined)?.depth)}</span>
              </button>
            {/each}
          </div>
        </section>
      {:else if view === "projects"}
        <section class="surface table-surface">
          <div class="section-head"><div><p class="eyebrow">{registrations.length} REGISTERED</p><h2>Projects on this Host</h2></div></div>
          <div class="data-table projects-table">
            <div class="table-head"><span>Project</span><span>Renewal</span><span>Queue</span><span>Target</span><span>Actions</span></div>
            {#each registrations as project}
              <div class="table-row">
                <div><strong>{text(project.project_label)}</strong><small>{text(project.workspace_path)}</small></div>
                <Badge variant="outline" class={project.renewal === "renewing" ? "status-success" : "status-warning"}>{text(project.renewal, "unknown")}</Badge>
                <span class="numeric">{number((project.last_poll as RecordValue | undefined)?.depth)}</span>
                <span class="numeric">{number(project.target)}</span>
                <div class="actions">
                  <Button size="sm" variant="secondary" loading={action === `drain:${project.project_label}`} onclick={() => void command("project_drain", { project_label: project.project_label }, `drain:${project.project_label}`)}>Drain</Button>
                  <Button size="sm" variant="ghost" intent="danger" loading={action === `stop:${project.project_label}`} onclick={() => confirm(`Stop ${project.project_label}?`) && void command("project_stop", { project_label: project.project_label }, `stop:${project.project_label}`)}>Stop</Button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {:else if view === "workers"}
        <section class="worker-list">
          {#if workers.length === 0}<div class="surface empty"><Bot size={32} /><strong>No Workers running</strong><p>Running agents will appear here with their lifecycle, budget and latest published line.</p></div>{/if}
          {#each workers as worker}
            <article class="surface worker-detail">
              <div class="worker-title"><div><p class="eyebrow">{text(worker.worker_id)}</p><h2>{text(worker.project_label)}</h2></div><Badge variant="outline" class="status-success">running</Badge></div>
              <div class="worker-grid"><div>Phase<strong>{text((worker.display as RecordValue | undefined)?.phase, "Starting")}</strong></div><div>Heartbeat<strong>{age(worker.last_heartbeat_at)}</strong></div><div>Memory<strong>{formatBytes(number((worker.vitals as RecordValue | undefined)?.memory_current_bytes))}</strong></div><div>Started<strong>{age(worker.started_at)}</strong></div></div>
              <pre>{text(worker.last_log_line, "No log line published yet.")}</pre>
              <div class="actions"><Button size="sm" variant="secondary" intent="danger" loading={action === `worker:${worker.worker_id}`} onclick={() => confirm(`Stop Worker ${worker.worker_id}?`) && void command("worker_stop", { worker_id: worker.worker_id }, `worker:${worker.worker_id}`)}><Square size={13} />Stop Worker</Button></div>
            </article>
          {/each}
        </section>
      {:else if view === "worktrees"}
        <section class="control-grid">
          <div class="surface control-panel">
            <div class="section-head"><div><p class="eyebrow">PROJECT INVENTORY</p><h2>Worktrees</h2></div></div>
            <label>Project<select bind:value={selectedProject} onchange={() => worktreeInventory = null}>{#each registrations as project}<option value={text(project.project_label, "")}>{text(project.project_label)}</option>{/each}</select></label>
            <div class="form-actions"><Button size="sm" variant="secondary" disabled={selectedProject === ""} loading={action === "worktree:list"} onclick={() => void listWorktrees()}>Refresh inventory</Button></div>
            <div class="inventory">
              {#each ((worktreeInventory?.worktrees as RecordValue[] | undefined) ?? []) as worktree}
                <div class="inventory-row"><Badge variant="outline">{text(worktree.kind)}</Badge><div><strong>{text(worktree.branch, "detached")}</strong><small>{text(worktree.path)}</small></div>{#if worktree.worker_id}<code>{text(worktree.worker_id).slice(0, 8)}</code>{/if}</div>
              {:else}<div class="inline-empty">Select a Project and refresh its daemon-owned inventory.</div>{/each}
            </div>
          </div>
          <form class="surface control-panel" onsubmit={(event) => { event.preventDefault(); void addWorktree(); }}>
            <div class="section-head"><div><p class="eyebrow">INTERACTIVE LANE</p><h2>Add worktree</h2></div></div>
            <label>Slug<input bind:value={worktreeSlug} required maxlength="64" pattern="[a-z0-9][a-z0-9._-]*" placeholder="ticket-4280" /></label>
            <label>Branch <small>optional</small><input bind:value={worktreeBranch} maxlength="200" placeholder="feat/ticket-4280" /></label>
            <label>Base <small>optional</small><input bind:value={worktreeBase} maxlength="200" placeholder="main" /></label>
            <div class="form-actions"><Button type="submit" disabled={selectedProject === "" || worktreeSlug.trim() === ""} loading={action === "worktree:add"}>Create worktree</Button></div>
          </form>
        </section>
      {:else if view === "knowledge"}
        <div class="knowledge-stack">
          <section class="surface knowledge-head">
            <div><p class="eyebrow">DAEMON-HELD STORES</p><h2>Brain & Memory</h2><p>Brain belongs to this Host. Memory is scoped to the selected Project.</p></div>
            <label>Project<select bind:value={selectedProject}>{#each registrations as project}<option value={text(project.project_label, "")}>{text(project.project_label)}</option>{/each}</select></label>
          </section>
          <section class="control-grid">
            <div class="surface control-panel">
              <div class="section-head"><div><p class="eyebrow">HOST</p><h2>Brain</h2></div><Button size="sm" variant="secondary" loading={action === "brain:brain_status"} onclick={() => void callBrain("brain_status")}>Status</Button></div>
              <label>Search<input bind:value={brainQuery} placeholder="architecture decisions" /></label>
              <div class="form-actions"><Button size="sm" disabled={brainQuery.trim() === ""} loading={action === "brain:brain_search"} onclick={() => void callBrain("brain_search")}>Search Brain</Button></div>
              <label>Capture title<input bind:value={brainTitle} placeholder="Decision or durable note" /></label>
              <label>Content<textarea bind:value={brainContent} rows="4" placeholder="What should this Host remember?"></textarea></label>
              <div class="form-actions"><Button size="sm" variant="secondary" disabled={brainTitle.trim() === "" || brainContent.trim() === ""} loading={action === "brain:brain_capture"} onclick={() => void callBrain("brain_capture")}>Capture</Button></div>
              <pre>{pretty(brainResult)}</pre>
            </div>
            <div class="surface control-panel">
              <div class="section-head"><div><p class="eyebrow">PROJECT</p><h2>Memory</h2></div><Button size="sm" variant="secondary" disabled={selectedProject === ""} loading={action === "memory:memory_stats"} onclick={() => void callMemory("memory_stats")}>Stats</Button></div>
              <label>Query<input bind:value={memoryQuery} placeholder="how releases are validated" /></label>
              <div class="form-actions"><Button size="sm" disabled={selectedProject === "" || memoryQuery.trim() === ""} loading={action === "memory:memory_recall"} onclick={() => void callMemory("memory_recall")}>Recall</Button><Button size="sm" variant="secondary" disabled={selectedProject === "" || memoryQuery.trim() === ""} loading={action === "memory:memory_search"} onclick={() => void callMemory("memory_search")}>Search</Button></div>
              <pre>{pretty(memoryResult)}</pre>
            </div>
          </section>
        </div>
      {:else}
        <section class="surface table-surface">
          <div class="section-head"><div><p class="eyebrow">PAIRED BROWSERS</p><h2>Device access</h2></div><code>redskilled web pair</code></div>
          <div class="data-table device-table">
            <div class="table-head"><span>Device</span><span>Paired</span><span>Last seen</span><span>Access</span></div>
            {#each snapshot.devices as device}
              <div class="table-row"><div><strong>{text(device.name)}</strong><small>{text(device.id)}</small></div><span>{age(device.created_at)}</span><span>{age(device.last_seen_at)}</span><Button size="sm" variant="ghost" intent="danger" disabled={device.current === true} onclick={() => confirm(`Revoke ${device.name}?`) && void command("device_revoke", { device_id: device.id })}>{device.current === true ? "Current" : "Revoke"}</Button></div>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </main>
</div>
