/**
 * system-tray — the daemon's small, optional desktop control surface.
 *
 * The daemon remains the authority. The tray is only a helper process that
 * projects state already owned by the daemon and calls its existing dashboard
 * and stop paths. Failure to install or start this helper never costs the host
 * control plane.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { redskilledHomeDir } from "@reddb-io/shared/redskilled-home.js";
import redDbIconDataUrl from "./reddb-icon.generated.js";

const SYSTRAY_PACKAGE = "systray2";
const STATUS_ITEM = 0;
const DASHBOARD_ITEM = 1;
const PAIR_ITEM = 2;
const QUIT_ITEM = 3;

interface TrayMenuItem {
  readonly title: string;
  readonly tooltip: string;
  readonly enabled: boolean;
}

interface TrayAction {
  readonly seq_id: number;
}

interface TrayProcess {
  readonly pid?: number;
  once(event: "exit", listener: () => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
}

interface SystrayInstance {
  onClick(listener: (action: TrayAction) => void): void;
  sendAction(action: {
    readonly type: "update-item";
    readonly item: TrayMenuItem;
    readonly seq_id: number;
  }): unknown;
  ready?(): Promise<unknown>;
  kill(exit?: boolean): void;
  readonly _process?: TrayProcess;
  readonly process?: TrayProcess | (() => TrayProcess | undefined);
}

type SystrayConstructor = new (options: {
  readonly menu: {
    readonly icon: string;
    readonly isTemplateIcon: false;
    readonly title: "";
    readonly tooltip: string;
    readonly items: readonly TrayMenuItem[];
  };
  readonly debug: false;
  readonly copyDir: true;
}) => SystrayInstance;

export interface RedskilledTrayState {
  readonly workers: readonly unknown[];
  readonly registrations?: readonly unknown[];
}

export interface RedskilledSystemTrayOptions {
  readonly version: string;
  readonly state: () => RedskilledTrayState;
  readonly quit: () => void | Promise<void>;
  readonly openDashboard?: () => void;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly loadSystray?: () => Promise<SystrayConstructor | null>;
  readonly log?: (message: string) => void;
  readonly refreshMs?: number;
}

export interface RedskilledSystemTray {
  readonly ready: Promise<boolean>;
  stop(): Promise<void>;
}

/** Desktop availability is a capability probe, independent of daemon health. */
function supportsRedskilledSystemTray(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.REDSKILLED_TRAY === "0") return false;
  if (platform === "darwin" || platform === "win32") return true;
  return platform === "linux" && Boolean(env.DISPLAY);
}

/** Start the tray in the background; the daemon is already serving at this point. */
export function startRedskilledSystemTray(options: RedskilledSystemTrayOptions): RedskilledSystemTray {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  let tray: SystrayInstance | null = null;
  let stopped = false;
  let refresh: NodeJS.Timeout | undefined;
  const bootAbort = new AbortController();

  const ready = (async (): Promise<boolean> => {
    if (!supportsRedskilledSystemTray(platform, env)) return false;
    const SysTray = await (options.loadSystray ?? (() => loadSystrayRuntime({
      env,
      homeDir: options.homeDir,
      log: options.log,
      signal: bootAbort.signal,
    })))();
    if (SysTray == null || stopped) return false;
    const tooltip = `Redskilled ${options.version}`;
    tray = new SysTray({
      menu: {
        icon: redDbIconDataUrl.replace(/^data:image\/png;base64,/, ""),
        isTemplateIcon: false,
        title: "",
        tooltip,
        items: menuItems(options.version, readState(options)),
      },
      debug: false,
      copyDir: true,
    });
    tray.onClick((action) => handleTrayClick(action, options, platform, env));
    await tray.ready?.();
    if (stopped) {
      await stopSystray(tray);
      tray = null;
      return false;
    }
    refresh = setInterval(() => refreshTray(tray, options), options.refreshMs ?? 5_000);
    refresh.unref();
    return true;
  })().catch((error: unknown) => {
    if (!stopped) options.log?.(`system tray unavailable: ${errorMessage(error)}`);
    return false;
  });

  return {
    ready,
    async stop(): Promise<void> {
      stopped = true;
      bootAbort.abort();
      if (refresh != null) clearInterval(refresh);
      await ready;
      const current = tray;
      tray = null;
      if (current != null) await stopSystray(current);
    },
  };
}

function handleTrayClick(
  action: TrayAction,
  options: RedskilledSystemTrayOptions,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): void {
  if (action.seq_id === DASHBOARD_ITEM) {
    try {
      (options.openDashboard ?? (() => openDashboardBrowser(platform, env)))();
    } catch (error) {
      options.log?.(`could not open dashboard: ${errorMessage(error)}`);
    }
    return;
  }
  if (action.seq_id === PAIR_ITEM) {
    try { openPairTerminal(platform, env); }
    catch (error) { options.log?.(`could not open browser pairing: ${errorMessage(error)}`); }
    return;
  }
  if (action.seq_id !== QUIT_ITEM) return;
  try {
    void Promise.resolve(options.quit()).catch((error: unknown) => {
      options.log?.(`could not stop from system tray: ${errorMessage(error)}`);
    });
  } catch (error) {
    options.log?.(`could not stop from system tray: ${errorMessage(error)}`);
  }
}

function refreshTray(tray: SystrayInstance | null, options: RedskilledSystemTrayOptions): void {
  if (tray == null) return;
  try {
    const update = tray.sendAction({
      type: "update-item",
      item: statusItem(options.version, readState(options)),
      seq_id: STATUS_ITEM,
    });
    void Promise.resolve(update).catch((error: unknown) => {
      options.log?.(`could not refresh system tray: ${errorMessage(error)}`);
    });
  } catch (error) {
    options.log?.(`could not refresh system tray: ${errorMessage(error)}`);
  }
}

function menuItems(version: string, state: RedskilledTrayState): readonly TrayMenuItem[] {
  return [
    statusItem(version, state),
    { title: "Open Dashboard", tooltip: "Open the Redskilled host dashboard", enabled: true },
    { title: "Pair Browser", tooltip: "Create a one-use HTTPS browser invitation", enabled: true },
    { title: "Quit Redskilled", tooltip: "Stop the host daemon; Workers survive", enabled: true },
  ];
}

function statusItem(version: string, state: RedskilledTrayState): TrayMenuItem {
  const workers = state.workers.length;
  const projects = state.registrations?.length ?? 0;
  return {
    title: `Redskilled v${version} · ${workers} Worker${workers === 1 ? "" : "s"} · ${projects} Project${projects === 1 ? "" : "s"}`,
    tooltip: "Host daemon is running",
    enabled: false,
  };
}

function readState(options: RedskilledSystemTrayOptions): RedskilledTrayState {
  try {
    return options.state();
  } catch (error) {
    options.log?.(`could not read system tray state: ${errorMessage(error)}`);
    return { workers: [] };
  }
}

async function loadSystrayRuntime(options: {
  readonly env: NodeJS.ProcessEnv;
  readonly homeDir?: string;
  readonly log?: (message: string) => void;
  readonly signal: AbortSignal;
}): Promise<SystrayConstructor | null> {
  const root = join(redskilledHomeDir(options.homeDir ?? homedir()), "runtime", "tray");
  const packageRoot = resolveSystrayPackageRoot(root);
  if (packageRoot == null) {
    options.log?.("system tray runtime is not installed; run the Redskilled installer again");
    return null;
  }
  const binary = join(
    packageRoot,
    "traybin",
    process.platform === "darwin"
      ? "tray_darwin_release"
      : process.platform === "win32"
        ? "tray_windows_release.exe"
        : "tray_linux_release",
  );
  await chmod(binary, 0o755).catch(() => undefined);
  const runtimeRequire = createRequire(join(packageRoot, "package.json"));
  const loaded = runtimeRequire(packageRoot) as { readonly default?: SystrayConstructor } | SystrayConstructor;
  return typeof loaded === "function" ? loaded : loaded.default ?? null;
}

function resolveSystrayPackageRoot(runtimeRoot: string): string | null {
  const installed = join(runtimeRoot, "node_modules", SYSTRAY_PACKAGE);
  if (existsSync(join(installed, "package.json"))) return installed;
  try {
    const runtimeRequire = createRequire(process.argv[1] ?? import.meta.url);
    return dirname(runtimeRequire.resolve(`${SYSTRAY_PACKAGE}/package.json`));
  } catch {
    return null;
  }
}

function openDashboardBrowser(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): void {
  const url = "https://localhost:25051";
  if (platform === "darwin") { detach("open", [url], env); return; }
  if (platform === "win32") { detach("cmd.exe", ["/d", "/s", "/c", "start", "", url], env); return; }
  detach("xdg-open", [url], env);
}

function openPairTerminal(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): void {
  const entry = process.argv[1];
  if (entry == null) return;
  const command = [process.execPath, ...process.execArgv, entry, "web", "pair"];
  if (platform === "darwin") {
    const shellCommand = command.map(shellQuote).join(" ");
    detach("osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(shellCommand)}`], env);
    return;
  }
  if (platform === "win32") {
    const child = spawn(process.execPath, [...process.execArgv, entry, "web", "pair"], {
      detached: true,
      env,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();
    return;
  }
  const terminals: readonly [string, readonly string[]][] = [
    ["xdg-terminal-exec", command],
    ["kgx", ["--", ...command]],
    ["gnome-terminal", ["--", ...command]],
    ["konsole", ["-e", ...command]],
    ["x-terminal-emulator", ["-e", ...command]],
  ];
  tryTerminal(terminals, env, 0);
}

function tryTerminal(
  candidates: readonly (readonly [string, readonly string[]])[],
  env: NodeJS.ProcessEnv,
  index: number,
): void {
  const candidate = candidates[index];
  if (candidate == null) return;
  const child = detach(candidate[0], candidate[1], env);
  child.once("error", () => tryTerminal(candidates, env, index + 1));
}

function detach(command: string, args: readonly string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, { detached: true, env, stdio: "ignore", windowsHide: true });
  child.unref();
  return child;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function stopSystray(instance: SystrayInstance): Promise<void> {
  const exposed = instance.process;
  const child = instance._process ?? (typeof exposed === "function" ? exposed.call(instance) : exposed);
  if (child?.pid == null) {
    try { instance.kill(false); } catch { /* already gone */ }
    return;
  }
  await new Promise<void>((resolve) => {
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      resolve();
    };
    child.once("exit", finish);
    try { instance.kill(false); } catch { finish(); }
    const terminate = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch { finish(); }
    }, 800);
    const kill = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { finish(); }
      finish();
    }, 1_600);
    terminate.unref();
    kill.unref();
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
