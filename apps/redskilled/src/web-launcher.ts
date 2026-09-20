import { spawnSync } from "node:child_process";
import { resolveRedskilledWebEntry } from "./web-supervision.js";

export const REDSKILLED_WEB_USAGE = `Usage: redskilled web <serve|pair|devices|revoke|ca|unit|status> [options]

Runs the separate redskilled-web companion bundle. Use \`redskilled web --help\`
for the installed companion's complete command reference.
`;

/** Execute the companion as another process; web/TLS code never enters the daemon bundle. */
export function runRedskilledWebCompanion(args: readonly string[]): number {
  const entry = resolveRedskilledWebEntry();
  if (entry == null) throw new Error("redskilled-web.bundle.min.mjs is not installed beside the daemon bundle");
  const result = spawnSync(process.execPath, [entry, ...args], { stdio: "inherit" });
  if (result.signal) process.kill(process.pid, result.signal);
  return result.status ?? 1;
}
