<script lang="ts">
  import { onMount } from "svelte";
  import { decode, encode, type JsonValue } from "@reddb-io/toon";
  import { AlertDialog, Badge, Button, Field, Input, Logo, Select, Textarea } from "@reddb-io/design-system/base";
  import { Activity, Bot, Boxes, Brain, Check, Copy, Download, FolderGit2, Gauge, Laptop, Menu, RefreshCw, ShieldCheck, Square, WifiOff, X } from "lucide-svelte";
  import WorktreeSpace from "./WorktreeSpace.svelte";

  type View = "overview" | "projects" | "workers" | "worktrees" | "knowledge" | "devices";
  type RecordValue = Record<string, unknown>;
  type Snapshot = { version: number; generated_at: string; csrf: string; state: RecordValue; devices: RecordValue[] };
  type ConnectDetails = { ok: true; name: string; expires_at: string; connect_urls: string[]; ca_url: string; ca_fingerprint: string };

  const connectToken = (() => {
    const match = location.pathname.match(/^\/connect\/(.+)$/);
    return match == null ? "" : decodeURIComponent(match[1]);
  })();

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
  let moreOpen = $state(false);
  let streamAbort: AbortController | null = null;
  let connect = $state<ConnectDetails | null>(null);
  let connectError = $state("");
  let copied = $state(false);

  const workers = $derived((snapshot?.state.workers as RecordValue[] | undefined) ?? []);
  const registrations = $derived((snapshot?.state.registrations as RecordValue[] | undefined) ?? []);
  const ceiling = $derived((snapshot?.state.ceiling as RecordValue | undefined) ?? {});
  const budget = $derived((snapshot?.state.budget_accounting as RecordValue | undefined) ?? {});

  onMount(() => {
    if (connectToken !== "") void loadConnect();
    else void refresh().then(connectStream);
    return () => streamAbort?.abort();
  });

  async function loadConnect(): Promise<void> {
    try {
      const response = await fetch(`/api/v1/connect/${encodeURIComponent(connectToken)}`);
      const value = decode(await response.text()) as unknown as ConnectDetails & { error?: string };
      if (!response.ok) throw new Error(value.error ?? "This connection invitation is unavailable.");
      connect = value;
    } catch (cause) {
      connectError = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function copyConnectLink(): Promise<void> {
    const url = connect?.connect_urls[0];
    if (url == null) return;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => { copied = false; }, 2_000);
    } catch {
      connectError = "The browser blocked clipboard access. Select and copy the address below.";
    }
  }

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

  /** A command whose failure the caller shows itself; it neither sets the shared action nor refreshes host state. */
  async function query(operation: string, input: RecordValue): Promise<unknown> {
    if (snapshot == null) throw new Error("This browser has not loaded the Host state yet.");
    const response = await fetch("/api/v1/commands", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/toon", "x-redskilled-csrf": snapshot.csrf },
      body: encode({ version: 1, command_id: crypto.randomUUID(), operation, input } as unknown as JsonValue),
    });
    const result = decode(await response.text()) as unknown as { ok?: boolean; error?: string; value?: unknown };
    if (!response.ok || result.ok === false) throw new Error(result.error ?? `Command failed (${response.status})`);
    return result.value;
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

  function showView(next: View): void {
    view = next;
    moreOpen = false;
  }
</script>

<svelte:head><meta name="description" content="Redskilled host control plane" /></svelte:head>
<svelte:window onkeydown={(event) => { if (event.key === "Escape") moreOpen = false; }} />

{#if connectToken !== ""}
  <main class="connect-shell">
    <div class="connect-brand"><Logo layout="symbol" on="dark" size={30} /><span>redskilled</span></div>
    <section class="connect-intro">
      <p class="host-id">SECURE DEVICE CONNECTION</p>
      <h1>Connect another computer</h1>
      <p>Give one browser access to this Host. The invitation expires after ten minutes and can only be used once.</p>
    </section>

    {#if connectError}<div class="notice locked" role="alert"><WifiOff size={17} /><span>{connectError}</span></div>{/if}

    {#if connect == null && connectError === ""}
      <div class="connect-loading" aria-label="Preparing secure connection"><i></i><i></i><i></i></div>
    {:else if connect}
      <div class="connect-layout">
        <section class="connect-steps" aria-label="Connection steps">
          <article><span>1</span><div><h2>Trust this Host</h2><p>On the other computer, download and install the local CA. Your operating system will ask you to confirm.</p><a class="connect-action secondary" href={connect.ca_url} download="redskilled-local-ca.crt"><Download size={17} />Download certificate</a></div></article>
          <article><span>2</span><div><h2>Open the invitation</h2><p>Copy this private address to the other computer. Both computers must be on the same LAN.</p><button class="connect-action" type="button" onclick={() => void copyConnectLink()}>{#if copied}<Check size={17} />Copied{:else}<Copy size={17} />Copy secure link{/if}</button>{#if connect.connect_urls[0]}<code class="connect-url">{connect.connect_urls[0]}</code>{/if}</div></article>
          <article><span>3</span><div><h2>Pair that browser</h2><p>Open the link there, verify the certificate fingerprint, then choose Pair this browser.</p></div></article>
        </section>

        <aside class="connect-proof">
          <Laptop size={24} aria-hidden="true" />
          <div><span>Invitation for</span><strong>{connect.name}</strong></div>
          <div><span>Expires</span><strong>{new Date(connect.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong></div>
          <div><span>CA fingerprint</span><code>{connect.ca_fingerprint}</code></div>
          <a class="connect-action pair" href={`/pair/${encodeURIComponent(connectToken)}`}><ShieldCheck size={17} />Pair this browser</a>
          <small>Use this button only on the computer you want to connect.</small>
        </aside>
      </div>
    {/if}
  </main>
{:else}
<div class="shell">
  <aside class="rail">
    <div class="brand"><Logo layout="symbol" on="dark" size={28} /><span>redskilled</span></div>
    <nav class="desktop-nav" aria-label="Primary">
      <button class:active={view === "overview"} aria-current={view === "overview" ? "page" : undefined} onclick={() => showView("overview")}><Gauge size={18} />Overview</button>
      <button class:active={view === "projects"} aria-current={view === "projects" ? "page" : undefined} onclick={() => showView("projects")}><Boxes size={18} />Projects <span>{registrations.length}</span></button>
      <button class:active={view === "workers"} aria-current={view === "workers" ? "page" : undefined} onclick={() => showView("workers")}><Bot size={18} />Workers <span>{workers.length}</span></button>
      <button class:active={view === "worktrees"} aria-current={view === "worktrees" ? "page" : undefined} onclick={() => showView("worktrees")}><FolderGit2 size={18} />Worktrees</button>
      <button class:active={view === "knowledge"} aria-current={view === "knowledge" ? "page" : undefined} onclick={() => showView("knowledge")}><Brain size={18} />Knowledge</button>
      <button class:active={view === "devices"} aria-current={view === "devices" ? "page" : undefined} onclick={() => showView("devices")}><ShieldCheck size={18} />Devices</button>
    </nav>
    <nav class="mobile-nav" aria-label="Primary mobile">
      <button class:active={view === "overview"} aria-current={view === "overview" ? "page" : undefined} onclick={() => showView("overview")}><Gauge size={20} /><span>Overview</span></button>
      <button class:active={view === "projects"} aria-current={view === "projects" ? "page" : undefined} onclick={() => showView("projects")}><Boxes size={20} /><span>Projects</span></button>
      <button class:active={view === "workers"} aria-current={view === "workers" ? "page" : undefined} onclick={() => showView("workers")}><Bot size={20} /><span>Workers</span></button>
      <button class:active={view === "worktrees" || view === "knowledge" || view === "devices"} aria-expanded={moreOpen} aria-controls="mobile-more-menu" onclick={() => moreOpen = !moreOpen}>{#if moreOpen}<X size={20} />{:else}<Menu size={20} />{/if}<span>More</span></button>
    </nav>
    {#if moreOpen}
      <div id="mobile-more-menu" class="more-menu">
        <button class:active={view === "worktrees"} aria-current={view === "worktrees" ? "page" : undefined} onclick={() => showView("worktrees")}><FolderGit2 size={19} /><span>Worktrees</span></button>
        <button class:active={view === "knowledge"} aria-current={view === "knowledge" ? "page" : undefined} onclick={() => showView("knowledge")}><Brain size={19} /><span>Knowledge</span></button>
        <button class:active={view === "devices"} aria-current={view === "devices" ? "page" : undefined} onclick={() => showView("devices")}><ShieldCheck size={19} /><span>Devices</span></button>
      </div>
    {/if}
    <div class="rail-foot">
      <span class="live-dot" aria-hidden="true"></span>
      <div><strong>Host online</strong><small>v{text(snapshot?.state.daemon_version)}</small></div>
    </div>
  </aside>

  <main>
    <header>
      <div>
        <p class="host-id">{text(snapshot?.state.machine_id_hash, "LOCAL HOST")}</p>
        <h1>{view[0].toUpperCase() + view.slice(1)}</h1>
      </div>
      <div class="header-actions">
        {#if snapshot}<span class="updated">Updated {age(snapshot.generated_at)}</span>{/if}
        <Button variant="secondary" size="sm" onclick={() => void refresh()} disabled={loading}><RefreshCw size={15} />Refresh</Button>
      </div>
    </header>

    {#if error}<div class:locked class="notice" role="alert"><WifiOff size={17} /><span>{error}</span>{#if locked}<code>redskilled web pair</code>{/if}</div>{/if}

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
            <div class="section-head"><h2>Active work</h2><Activity size={18} aria-hidden="true" /></div>
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
            <div class="section-head"><h2>Demand</h2><button class="text-button" onclick={() => showView("projects")}>View all projects</button></div>
            {#each registrations.slice(0, 6) as project}
              <button class="project-row" onclick={() => showView("projects")}>
                <div><strong>{text(project.project_label)}</strong><p>{text((project.last_poll as RecordValue | undefined)?.detail, "Awaiting first poll")}</p></div>
                <span>{number((project.last_poll as RecordValue | undefined)?.depth)}</span>
              </button>
            {/each}
          </div>
        </section>
      {:else if view === "projects"}
        <section class="surface table-surface">
          <div class="section-head"><h2>Projects on this Host</h2><span class="section-count">{registrations.length} registered</span></div>
          <div class="data-table projects-table">
            <div class="table-head"><span>Project</span><span>Renewal</span><span>Queue</span><span>Target</span><span>Actions</span></div>
            {#each registrations as project}
              <div class="table-row">
                <div class="table-primary"><strong>{text(project.project_label)}</strong><small>{text(project.workspace_path)}</small></div>
                <div class="table-cell" data-label="Renewal"><Badge variant="outline" class={project.renewal === "renewing" ? "status-success" : "status-warning"}>{text(project.renewal, "unknown")}</Badge></div>
                <span class="table-cell numeric" data-label="Queue">{number((project.last_poll as RecordValue | undefined)?.depth)}</span>
                <span class="table-cell numeric" data-label="Target">{number(project.target)}</span>
                <div class="table-cell actions" data-label="Actions">
                  <div class="action-group">
                    <Button size="sm" variant="secondary" loading={action === `drain:${project.project_label}`} onclick={() => void command("project_drain", { project_label: project.project_label }, `drain:${project.project_label}`)}>Drain</Button>
                    <WorktreeSpace projectLabel={text(project.project_label, "")} run={query} />
                    <AlertDialog triggerLabel={`Stop ${text(project.project_label)}`} title={`Stop ${text(project.project_label)}?`} description="The daemon will stop scheduling this Project until it is started again." confirmLabel="Stop Project" onconfirm={() => void command("project_stop", { project_label: project.project_label }, `stop:${project.project_label}`)}>
                      {#snippet trigger()}Stop{/snippet}
                      <p>Running work can be interrupted. Confirm only if this Project should leave the active scheduling lane.</p>
                    </AlertDialog>
                  </div>
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
              <div class="worker-title"><div><code class="identifier">{text(worker.worker_id)}</code><h2>{text(worker.project_label)}</h2></div><Badge variant="outline" class="status-success">running</Badge></div>
              <div class="worker-grid"><div>Phase<strong>{text((worker.display as RecordValue | undefined)?.phase, "Starting")}</strong></div><div>Heartbeat<strong>{age(worker.last_heartbeat_at)}</strong></div><div>Memory<strong>{formatBytes(number((worker.vitals as RecordValue | undefined)?.memory_current_bytes))}</strong></div><div>Started<strong>{age(worker.started_at)}</strong></div></div>
              <pre>{text(worker.last_log_line, "No log line published yet.")}</pre>
              <div class="actions"><AlertDialog triggerLabel={`Stop Worker ${text(worker.worker_id)}`} title="Stop this Worker?" description="The current Worker process will be terminated." confirmLabel="Stop Worker" onconfirm={() => void command("worker_stop", { worker_id: worker.worker_id }, `worker:${worker.worker_id}`)}>{#snippet trigger()}<Square size={14} />Stop Worker{/snippet}<p>Its durable evidence remains available, but in-flight work may need to be resumed by a new Worker.</p></AlertDialog></div>
            </article>
          {/each}
        </section>
      {:else if view === "worktrees"}
        <section class="control-grid">
          <div class="surface control-panel">
            <div class="section-head"><h2>Daemon-owned worktrees</h2></div>
            <Field label="Project" class="control-field">{#snippet children(control)}<Select {...control} class="field-control" bind:value={selectedProject} onchange={() => worktreeInventory = null}>{#each registrations as project}<option value={text(project.project_label, "")}>{text(project.project_label)}</option>{/each}</Select>{/snippet}</Field>
            <div class="form-actions"><Button size="sm" variant="secondary" disabled={selectedProject === ""} loading={action === "worktree:list"} onclick={() => void listWorktrees()}>Refresh inventory</Button></div>
            <div class="inventory">
              {#each ((worktreeInventory?.worktrees as RecordValue[] | undefined) ?? []) as worktree}
                <div class="inventory-row"><Badge variant="outline">{text(worktree.kind)}</Badge><div><strong>{text(worktree.branch, "detached")}</strong><small>{text(worktree.path)}</small></div>{#if worktree.worker_id}<code>{text(worktree.worker_id).slice(0, 8)}</code>{/if}</div>
              {:else}<div class="inline-empty">Select a Project and refresh its daemon-owned inventory.</div>{/each}
            </div>
          </div>
          <form class="surface control-panel" onsubmit={(event) => { event.preventDefault(); void addWorktree(); }}>
            <div class="section-head"><h2>Add interactive worktree</h2></div>
            <Field label="Slug (required)" help="Lowercase letters, numbers, dots, underscores and hyphens." class="control-field">{#snippet children(control)}<Input {...control} class="field-control" value={worktreeSlug} required maxlength={64} pattern="[a-z0-9][a-z0-9._-]*" placeholder="ticket-4280" oninput={(event) => worktreeSlug = event.currentTarget.value} />{/snippet}</Field>
            <Field label="Branch" help="Optional. A new branch is derived from the slug when omitted." class="control-field">{#snippet children(control)}<Input {...control} class="field-control" value={worktreeBranch} maxlength={200} placeholder="feat/ticket-4280" oninput={(event) => worktreeBranch = event.currentTarget.value} />{/snippet}</Field>
            <Field label="Base" help="Optional. Defaults to the Project’s configured base." class="control-field">{#snippet children(control)}<Input {...control} class="field-control" value={worktreeBase} maxlength={200} placeholder="main" oninput={(event) => worktreeBase = event.currentTarget.value} />{/snippet}</Field>
            <div class="form-actions"><Button type="submit" disabled={selectedProject === "" || worktreeSlug.trim() === ""} loading={action === "worktree:add"}>Create worktree</Button></div>
          </form>
        </section>
      {:else if view === "knowledge"}
        <div class="knowledge-stack">
          <section class="surface knowledge-head">
            <div><h2>Brain & Memory</h2><p>Brain belongs to this Host. Memory is scoped to the selected Project.</p></div>
            <Field label="Project" class="knowledge-project">{#snippet children(control)}<Select {...control} class="field-control" bind:value={selectedProject}>{#each registrations as project}<option value={text(project.project_label, "")}>{text(project.project_label)}</option>{/each}</Select>{/snippet}</Field>
          </section>
          <section class="control-grid">
            <div class="surface control-panel">
              <div class="section-head"><h2>Host Brain</h2><Button size="sm" variant="secondary" loading={action === "brain:brain_status"} onclick={() => void callBrain("brain_status")}>Status</Button></div>
              <Field label="Search" class="control-field">{#snippet children(control)}<Input {...control} class="field-control" value={brainQuery} placeholder="architecture decisions" oninput={(event) => brainQuery = event.currentTarget.value} />{/snippet}</Field>
              <div class="form-actions"><Button size="sm" disabled={brainQuery.trim() === ""} loading={action === "brain:brain_search"} onclick={() => void callBrain("brain_search")}>Search Brain</Button></div>
              <Field label="Capture title" class="control-field">{#snippet children(control)}<Input {...control} class="field-control" value={brainTitle} placeholder="Decision or durable note" oninput={(event) => brainTitle = event.currentTarget.value} />{/snippet}</Field>
              <Field label="Content" class="control-field">{#snippet children(control)}<Textarea {...control} class="field-control" value={brainContent} rows={4} placeholder="What should this Host remember?" oninput={(event) => brainContent = event.currentTarget.value} />{/snippet}</Field>
              <div class="form-actions"><Button size="sm" variant="secondary" disabled={brainTitle.trim() === "" || brainContent.trim() === ""} loading={action === "brain:brain_capture"} onclick={() => void callBrain("brain_capture")}>Capture</Button></div>
              <pre>{pretty(brainResult)}</pre>
            </div>
            <div class="surface control-panel">
              <div class="section-head"><h2>Project Memory</h2><Button size="sm" variant="secondary" disabled={selectedProject === ""} loading={action === "memory:memory_stats"} onclick={() => void callMemory("memory_stats")}>Stats</Button></div>
              <Field label="Query" class="control-field">{#snippet children(control)}<Input {...control} class="field-control" value={memoryQuery} placeholder="how releases are validated" oninput={(event) => memoryQuery = event.currentTarget.value} />{/snippet}</Field>
              <div class="form-actions"><Button size="sm" disabled={selectedProject === "" || memoryQuery.trim() === ""} loading={action === "memory:memory_recall"} onclick={() => void callMemory("memory_recall")}>Recall</Button><Button size="sm" variant="secondary" disabled={selectedProject === "" || memoryQuery.trim() === ""} loading={action === "memory:memory_search"} onclick={() => void callMemory("memory_search")}>Search</Button></div>
              <pre>{pretty(memoryResult)}</pre>
            </div>
          </section>
        </div>
      {:else}
        <section class="surface table-surface">
          <div class="section-head"><h2>Device access</h2><code>redskilled web pair</code></div>
          <div class="data-table device-table">
            <div class="table-head"><span>Device</span><span>Paired</span><span>Last seen</span><span>Access</span></div>
            {#each snapshot.devices as device}
              <div class="table-row"><div class="table-primary"><strong>{text(device.name)}</strong><small>{text(device.id)}</small></div><span class="table-cell" data-label="Paired">{age(device.created_at)}</span><span class="table-cell" data-label="Last seen">{age(device.last_seen_at)}</span><div class="table-cell actions" data-label="Access"><div class="action-group">{#if device.current === true}<Button size="sm" variant="ghost" disabled>Current</Button>{:else}<AlertDialog triggerLabel={`Revoke ${text(device.name)}`} title={`Revoke ${text(device.name)}?`} description="This browser will immediately lose access to the daemon." confirmLabel="Revoke access" onconfirm={() => void command("device_revoke", { device_id: device.id })}>{#snippet trigger()}Revoke{/snippet}<p>Pairing is required before this device can access the control plane again.</p></AlertDialog>{/if}</div></div></div>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </main>
</div>
{/if}
