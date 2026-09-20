import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { encode, type JsonValue } from "@reddb-io/toon";
import { parse } from "yaml";
import { createWebInvitation, listWebDevices, revokeWebDevice } from "./web-auth.js";
import { startRedskilledWebServer } from "./web-server.js";
import { ensureRedskilledWebTls } from "./web-tls.js";
import { REDSKILLED_WEB_DEFAULT_PORT, redskilledWebPaths } from "./web-paths.js";
import { installRedskilledWebUnit, redskilledWebUnitStatus, removeRedskilledWebUnit } from "./web-supervision.js";

const WEB_COMMAND_USAGE = `Usage: redskilled web <serve|pair|devices|revoke|ca|unit|status> [options]

  serve [--host ADDR] [--port N]  run the HTTPS companion
  pair [--name NAME]               create a one-use browser invitation
  devices                          list paired browsers
  revoke <device-id>               revoke one browser and its sessions
  ca export [PATH]                 copy the Host CA for another device
  ca install                       trust the Host CA in this user's NSS store
  unit install|remove|status       supervise the companion with systemd
  status                           report unit, CA and local URL
`;

export async function runRedskilledWebCommand(args: readonly string[], write = (text: string) => process.stdout.write(text)): Promise<number> {
  const [command = "status", ...rest] = args;
  const paths = redskilledWebPaths();
  if (command === "--help" || command === "help") { write(WEB_COMMAND_USAGE); return 0; }
  if (command === "serve") {
    const configured = await readWebConfig();
    const port = Number(value(rest, "--port") ?? configured.port ?? REDSKILLED_WEB_DEFAULT_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("--port must be an integer from 1 to 65535");
    const server = await startRedskilledWebServer({ port, host: value(rest, "--host") ?? configured.host ?? "::", log: (line) => process.stderr.write(`redskilled web: ${line}\n`) });
    write(`${encode({ service: "redskilled-web", url: server.url, port: server.port, ca_fingerprint: server.tls.fingerprint, names: server.tls.names } as unknown as JsonValue)}\n`);
    await new Promise<void>((resolve) => {
      const stop = (): void => { void server.close().finally(resolve); };
      process.once("SIGINT", stop); process.once("SIGTERM", stop);
    });
    return 0;
  }
  if (command === "pair") {
    const configured = await readWebConfig();
    const port = configured.port ?? REDSKILLED_WEB_DEFAULT_PORT;
    const tls = await ensureRedskilledWebTls(paths);
    const invitation = await createWebInvitation(paths, value(rest, "--name") ?? "Browser");
    const urls = tls.names.filter((name) => !name.includes(":")).map((name) => `https://${name}:${port}/pair/${invitation.token}`);
    write(`${encode({ url: urls[0], urls, expires_at: invitation.expiresAt, ca: `https://localhost:${port}/ca.crt`, ca_fingerprint: tls.fingerprint } as unknown as JsonValue)}\n`);
    return 0;
  }
  if (command === "devices") { write(`${encode((await listWebDevices(paths)) as unknown as JsonValue)}\n`); return 0; }
  if (command === "revoke") { const id = rest[0]?.trim(); if (!id) throw new Error("revoke requires a device id"); write(`${encode({ device_id: id, applied: await revokeWebDevice(paths, id) })}\n`); return 0; }
  if (command === "ca") {
    const tls = await ensureRedskilledWebTls(paths);
    const operation = rest[0] ?? "export";
    if (operation === "export") {
      const destination = rest[1] ?? join(process.cwd(), "redskilled-local-ca.crt");
      await copyFile(paths.caCertificate, destination);
      write(`${encode({ certificate: destination, fingerprint: tls.fingerprint })}\n`);
      return 0;
    }
    if (operation === "install") {
      const database = join(homedir(), ".pki", "nssdb");
      await mkdir(database, { recursive: true, mode: 0o700 });
      try { execFileSync("certutil", ["-A", "-d", `sql:${database}`, "-n", "Redskilled Local CA", "-t", "C,,", "-i", paths.caCertificate], { stdio: "pipe" }); }
      catch { throw new Error(`could not run certutil; import ${paths.caCertificate} into the browser and verify ${tls.fingerprint}`); }
      write(`${encode({ installed: true, database, fingerprint: tls.fingerprint })}\n`);
      return 0;
    }
    throw new Error("ca accepts install or export");
  }
  if (command === "unit") {
    const operation = rest[0] ?? "status";
    const result = operation === "install" ? await installRedskilledWebUnit() : operation === "remove" ? await removeRedskilledWebUnit() : redskilledWebUnitStatus();
    write(`${encode(result as unknown as JsonValue)}\n`);
    return "installed" in result && result.installed === false ? 1 : 0;
  }
  if (command === "status") {
    const configured = await readWebConfig();
    const tls = await ensureRedskilledWebTls(paths);
    write(`${encode({ url: `https://localhost:${configured.port ?? REDSKILLED_WEB_DEFAULT_PORT}`, bind: configured.host ?? "::", ca: paths.caCertificate, ca_fingerprint: tls.fingerprint, unit: redskilledWebUnitStatus() } as unknown as JsonValue)}\n`);
    return 0;
  }
  throw new Error(`unknown web command ${JSON.stringify(command)}`);
}

function value(args: readonly string[], name: string): string | undefined { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; }

async function readWebConfig(): Promise<{ readonly port?: number; readonly host?: string }> {
  try {
    const document = parse(await readFile(join(homedir(), ".red", "config.yaml"), "utf8")) as Record<string, unknown>;
    const plugins = object(document.plugins);
    const dev = object(plugins?.dev);
    const redskilled = object(dev?.redskilled);
    const web = object(redskilled?.web);
    if (web == null) return {};
    const port = Number(web.port);
    const bind = typeof web.bind === "string" ? web.bind.trim() : "";
    return {
      ...(Number.isInteger(port) && port > 0 && port <= 65_535 ? { port } : {}),
      ...(bind !== "" ? { host: bind } : web.lan === false ? { host: "127.0.0.1" } : {}),
    };
  } catch { return {}; }
}

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
