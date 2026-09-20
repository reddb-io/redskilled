import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REDSKILLED_WEB_UNIT_NAME = "redskilled-web.service";

export function resolveRedskilledWebEntry(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.REDSKILLED_WEB_BIN?.trim();
  if (explicit && existsSync(explicit)) return resolve(explicit);
  const beside = process.argv[1] ? join(dirname(resolve(process.argv[1])), "redskilled-web.bundle.min.mjs") : "";
  if (beside && existsSync(beside)) return beside;
  const repository = fileURLToPath(new URL("../../../dist/redskilled-web.bundle.min.mjs", import.meta.url));
  return existsSync(repository) ? repository : null;
}

export function redskilledWebUnitPath(configHome = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config")): string {
  return join(configHome, "systemd", "user", REDSKILLED_WEB_UNIT_NAME);
}

export function renderRedskilledWebUnit(entry: string): string {
  return [
    "[Unit]",
    "Description=Redskilled HTTPS dashboard companion",
    "Documentation=https://github.com/reddb-io/redskilled",
    "After=network-online.target redskilled.service",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=${quote(process.execPath)} ${quote(entry)} serve`,
    "Restart=always",
    "RestartSec=2",
    "MemoryHigh=512M",
    "MemoryMax=1G",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

export async function installRedskilledWebUnit(entry = resolveRedskilledWebEntry()): Promise<{ installed: boolean; path: string; detail?: string }> {
  const path = redskilledWebUnitPath();
  if (entry == null) return { installed: false, path, detail: "redskilled-web.bundle.min.mjs is not available" };
  const stableDir = join(homedir(), ".red", "redskilled", "web", "bin");
  const stableEntry = join(stableDir, "redskilled-web.bundle.min.mjs");
  await mkdir(stableDir, { recursive: true, mode: 0o700 });
  if (resolve(entry) !== resolve(stableEntry)) await copyFile(entry, stableEntry);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, renderRedskilledWebUnit(stableEntry), { encoding: "utf8", mode: 0o600 });
  for (const argv of [["daemon-reload"], ["enable", REDSKILLED_WEB_UNIT_NAME], ["restart", REDSKILLED_WEB_UNIT_NAME]]) {
    const result = spawnSync("systemctl", ["--user", ...argv], { encoding: "utf8" });
    if (result.status !== 0) return { installed: false, path, detail: (result.stderr || result.stdout || `systemctl ${argv[0]} failed`).trim() };
  }
  return { installed: true, path };
}

export async function removeRedskilledWebUnit(): Promise<{ removed: boolean; path: string; detail?: string }> {
  const path = redskilledWebUnitPath();
  spawnSync("systemctl", ["--user", "disable", "--now", REDSKILLED_WEB_UNIT_NAME], { encoding: "utf8" });
  await rm(path, { force: true });
  const reload = spawnSync("systemctl", ["--user", "daemon-reload"], { encoding: "utf8" });
  return reload.status === 0 ? { removed: true, path } : { removed: false, path, detail: (reload.stderr || reload.stdout).trim() };
}

export function redskilledWebUnitStatus(): { readonly active: string | null; readonly enabled: string | null; readonly path: string } {
  const ask = (verb: string): string | null => {
    const result = spawnSync("systemctl", ["--user", verb, REDSKILLED_WEB_UNIT_NAME], { encoding: "utf8" });
    const value = (result.stdout || result.stderr || "").trim();
    return value || null;
  };
  return { active: ask("is-active"), enabled: ask("is-enabled"), path: redskilledWebUnitPath() };
}

function quote(value: string): string { return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`; }
