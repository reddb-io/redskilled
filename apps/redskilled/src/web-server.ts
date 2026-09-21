import { appendFile } from "node:fs/promises";
import { createServer, type Server } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { decode, encode, type JsonValue } from "@reddb-io/toon";
import { REDSKILLS_ACP_METHODS, type RedskillsAcpMethod } from "@reddb-io/protocol-acp";
import { connectRedskillsProjectAcp } from "./acp-client.js";
import { createRedskillsOperatorAcpClient } from "./acp-operator-client.js";
import { readRedskilledHostState } from "./client.js";
import { resolveRedskilledPaths, type RedskilledPaths } from "./paths.js";
import { REDSKILLED_WEB_ASSETS } from "./web-assets.generated.js";
import {
  REDSKILLED_WEB_COOKIE,
  authenticateWebSession,
  inspectWebInvitation,
  listWebDevices,
  redeemWebInvitation,
  revokeWebDevice,
  sessionCookie,
  type RedskilledWebIdentity,
} from "./web-auth.js";
import { ensureRedskilledWebTls, type RedskilledWebTls } from "./web-tls.js";
import { REDSKILLED_WEB_DEFAULT_PORT, redskilledWebPaths, type RedskilledWebPaths } from "./web-paths.js";

const MAX_BODY_BYTES = 1024 * 1024;
const COMMANDS = {
  project_budget: REDSKILLS_ACP_METHODS.projectBudget,
  host_budgets: REDSKILLS_ACP_METHODS.hostBudgets,
  github_read: REDSKILLS_ACP_METHODS.githubRead,
  github_request: REDSKILLS_ACP_METHODS.githubRequest,
  github_write: REDSKILLS_ACP_METHODS.githubWrite,
  github_update: REDSKILLS_ACP_METHODS.githubUpdate,
  github_custody_handoff: REDSKILLS_ACP_METHODS.githubCustodyHandoff,
  publish: REDSKILLS_ACP_METHODS.publish,
  land: REDSKILLS_ACP_METHODS.land,
  worker_budget_grace: REDSKILLS_ACP_METHODS.workerBudgetGrace,
  go_dispatch: REDSKILLS_ACP_METHODS.goDispatch,
  worktree_add: REDSKILLS_ACP_METHODS.worktreeAdd,
  worktree_list: REDSKILLS_ACP_METHODS.worktreeList,
  metrics: REDSKILLS_ACP_METHODS.metrics,
  brain_call: REDSKILLS_ACP_METHODS.brainCall,
  memory_call: REDSKILLS_ACP_METHODS.memoryCall,
} as const satisfies Readonly<Record<string, RedskillsAcpMethod>>;

export const REDSKILLED_WEB_OPERATIONS = [
  "ticket_dispatch", "worker_stop", "project_status", "project_drain", "project_stop",
  ...Object.keys(COMMANDS), "device_revoke",
] as const;

interface WebCommand {
  readonly version: 1;
  readonly command_id: string;
  readonly operation: string;
  readonly input: Record<string, unknown>;
}

export interface RedskilledWebServerOptions {
  readonly port?: number;
  readonly host?: string;
  readonly homeDir?: string;
  readonly daemonPaths?: RedskilledPaths;
  readonly paths?: RedskilledWebPaths;
  readonly log?: (message: string) => void;
}

export interface RedskilledWebServer {
  readonly url: string;
  readonly port: number;
  readonly tls: RedskilledWebTls;
  close(): Promise<void>;
}

export async function startRedskilledWebServer(options: RedskilledWebServerOptions = {}): Promise<RedskilledWebServer> {
  const port = options.port ?? REDSKILLED_WEB_DEFAULT_PORT;
  const host = options.host ?? "::";
  const paths = options.paths ?? redskilledWebPaths(options.homeDir);
  const daemonPaths = options.daemonPaths ?? resolveRedskilledPaths();
  const tls = await ensureRedskilledWebTls(paths);
  const commandResults = new Map<string, unknown>();
  const rate = new Map<string, { count: number; since: number }>();
  const server = createServer({ key: tls.key, cert: tls.cert, ca: tls.ca }, (request, response) => {
    void route(request, response, { paths, daemonPaths, tls, commandResults, rate }).catch((error) => {
      options.log?.(`web request failed: ${errorMessage(error)}`);
      if (!response.headersSent) writeToon(response, error instanceof WebError ? error.status : 500, {
        ok: false,
        error: error instanceof WebError ? error.message : "Redskilled could not complete this request.",
      });
      else response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ port, host, ipv6Only: false }, () => resolve());
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address != null ? address.port : port;
  return {
    url: `https://localhost:${actualPort}`,
    port: actualPort,
    tls,
    close: () => closeServer(server),
  };
}

interface RouteContext {
  readonly paths: RedskilledWebPaths;
  readonly daemonPaths: RedskilledPaths;
  readonly tls: RedskilledWebTls;
  readonly commandResults: Map<string, unknown>;
  readonly rate: Map<string, { count: number; since: number }>;
}

async function route(request: IncomingMessage, response: ServerResponse, context: RouteContext): Promise<void> {
  const url = new URL(request.url ?? "/", `https://${request.headers.host ?? "localhost"}`);
  securityHeaders(response);
  if (url.pathname === "/health") return writeToon(response, 200, { ok: true, service: "redskilled-web" });
  if (url.pathname === "/ca.crt") {
    response.writeHead(200, { "content-type": "application/x-x509-ca-cert", "content-disposition": "attachment; filename=redskilled-local-ca.crt" });
    response.end(context.tls.ca);
    return;
  }
  if (url.pathname.startsWith("/pair/")) {
    throttle(request, context.rate, "pair", 20, 60_000);
    const identity = await redeemWebInvitation(context.paths, decodeURIComponent(url.pathname.slice(6)));
    if (identity == null) return writeHtml(response, 410, pairingFailure());
    response.writeHead(303, { location: "/", "set-cookie": sessionCookie(identity.token) });
    response.end();
    return;
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/v1/connect/")) {
    throttle(request, context.rate, "connect", 60, 60_000);
    const token = decodeURIComponent(url.pathname.slice("/api/v1/connect/".length));
    const invitation = await inspectWebInvitation(context.paths, token);
    if (invitation == null) return writeToon(response, 410, { ok: false, error: "This connection invitation has expired or was already used." });
    return writeToon(response, 200, {
      ok: true,
      name: invitation.name,
      expires_at: invitation.expiresAt,
      connect_urls: connectUrls(context.tls.names, url.port || String(REDSKILLED_WEB_DEFAULT_PORT), token),
      ca_url: "/ca.crt",
      ca_fingerprint: context.tls.fingerprint,
    });
  }

  if (url.pathname.startsWith("/api/")) {
    const identity = await authenticateWebSession(context.paths, cookie(request, REDSKILLED_WEB_COOKIE));
    if (identity == null) return writeToon(response, 401, { ok: false, error: "This browser has not been paired." });
    if (request.method === "GET" && url.pathname === "/api/v1/state") {
      return writeToon(response, 200, await snapshot(context, identity));
    }
    if (request.method === "GET" && url.pathname === "/api/v1/events") {
      return streamState(request, response, context, identity);
    }
    if (request.method === "POST" && url.pathname === "/api/v1/commands") {
      requireSameOrigin(request);
      if (request.headers["x-redskilled-csrf"] !== identity.csrf) throw new WebError(403, "The CSRF token did not match this browser session.");
      throttle(request, context.rate, `command:${identity.device.id}`, 120, 60_000);
      const command = parseCommand(decode(await body(request)));
      const cached = context.commandResults.get(command.command_id);
      if (cached != null) return writeToon(response, 200, cached);
      const result = await executeCommand(context, identity, command);
      context.commandResults.set(command.command_id, result);
      while (context.commandResults.size > 1_000) context.commandResults.delete(context.commandResults.keys().next().value!);
      return writeToon(response, 200, result);
    }
    return writeToon(response, 404, { ok: false, error: "Unknown Redskilled web API route." });
  }

  return serveAsset(response, url.pathname);
}

function connectUrls(names: readonly string[], port: string, token: string): string[] {
  const usable = names.filter((name) => name !== "localhost" && name !== "127.0.0.1" && name !== "::1" && !name.toLowerCase().startsWith("fe80:"));
  const ordered = [...usable].sort((left, right) => Number(!/^\d+\.\d+\.\d+\.\d+$/.test(left)) - Number(!/^\d+\.\d+\.\d+\.\d+$/.test(right)));
  return ordered.map((name) => `https://${name.includes(":") ? `[${name}]` : name}:${port}/connect/${encodeURIComponent(token)}`);
}

async function snapshot(context: RouteContext, identity: RedskilledWebIdentity): Promise<Record<string, unknown>> {
  const [state, devices] = await Promise.all([
    readRedskilledHostState(context.daemonPaths, { requestTimeoutMs: 5_000 }),
    listWebDevices(context.paths),
  ]);
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    csrf: identity.csrf,
    state,
    devices: devices.filter((device) => device.revoked_at == null).map((device) => ({ ...device, current: device.id === identity.device.id })),
    operations: REDSKILLED_WEB_OPERATIONS,
  };
}

async function streamState(request: IncomingMessage, response: ServerResponse, context: RouteContext, identity: RedskilledWebIdentity): Promise<void> {
  response.writeHead(200, { "content-type": "application/x-toon-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
  let previous = "";
  let closed = false;
  request.once("close", () => { closed = true; });
  while (!closed) {
    try {
      // A device can be revoked while this long-lived request is open. Re-read
      // the server-side session before every snapshot so revocation closes the
      // existing stream instead of applying only to the next HTTP request.
      const current = await authenticateWebSession(context.paths, identity.token);
      if (current == null) {
        response.write(`${encode({ event: "revoked", error: "This browser session was revoked or expired." })}\n\n`);
        break;
      }
      const value = await snapshot(context, current);
      const encoded = encode(value as unknown as JsonValue);
      if (encoded !== previous) {
        previous = encoded;
        response.write(`${encode({ event: "snapshot", snapshot: value } as unknown as JsonValue)}\n\n`);
      }
    } catch (error) {
      response.write(`${encode({ event: "error", error: errorMessage(error) })}\n\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  response.end();
}

async function executeCommand(context: RouteContext, identity: RedskilledWebIdentity, command: WebCommand): Promise<Record<string, unknown>> {
  const started = new Date().toISOString();
  let target = "host";
  try {
    let value: unknown;
    if (command.operation === "ticket_dispatch") {
      value = await createRedskillsOperatorAcpClient(context.daemonPaths).dispatch(requiredString(command.input.issue_url, "issue_url"));
    } else if (command.operation === "worker_stop") {
      target = requiredString(command.input.worker_id, "worker_id");
      value = await createRedskillsOperatorAcpClient(context.daemonPaths).stop(target);
    } else if (command.operation === "device_revoke") {
      target = requiredString(command.input.device_id, "device_id");
      if (target === identity.device.id) throw new WebError(400, "The current browser cannot revoke itself.");
      value = { applied: await revokeWebDevice(context.paths, target) };
    } else {
      const state = await readRedskilledHostState(context.daemonPaths, { requestTimeoutMs: 5_000 });
      const projectLabel = requiredString(command.input.project_label, "project_label");
      target = projectLabel;
      const registration = state.registrations?.find((entry) => entry.project_label === projectLabel);
      if (registration == null) throw new WebError(404, "The selected Project is not registered on this Host.");
      const session = await connectRedskillsProjectAcp({ cwd: registration.workspace_path, paths: context.daemonPaths, name: "redskilled-web", version: "1" });
      try {
        if (command.operation === "project_status") value = await session.control("status");
        else if (command.operation === "project_drain") value = await session.control("drain", optionalControl(command.input));
        else if (command.operation === "project_stop") value = await session.control("stop");
        else {
          const method = COMMANDS[command.operation as keyof typeof COMMANDS];
          if (method == null) throw new WebError(400, "This operation is not in the Redskilled web allowlist.");
          value = await session.extension(method, record(command.input.params ?? {}, "params"));
        }
      } finally { session.close(); }
    }
    await audit(context.paths, { at: started, device_id: identity.device.id, operation: command.operation, target, outcome: "applied", command_id: command.command_id });
    return { ok: true, value };
  } catch (error) {
    await audit(context.paths, { at: started, device_id: identity.device.id, operation: command.operation, target, outcome: "refused", command_id: command.command_id, detail: errorMessage(error) });
    if (error instanceof WebError) throw error;
    throw new WebError(400, errorMessage(error));
  }
}

function optionalControl(input: Record<string, unknown>): { target?: number; runner?: string } {
  return {
    ...(typeof input.target === "number" ? { target: input.target } : {}),
    ...(typeof input.runner === "string" ? { runner: input.runner } : {}),
  };
}

async function audit(paths: RedskilledWebPaths, value: Record<string, unknown>): Promise<void> {
  await appendFile(paths.audit, `${encode(value as unknown as JsonValue)}\n\n`, { encoding: "utf8", mode: 0o600 });
}

function parseCommand(value: unknown): WebCommand {
  const command = record(value, "command");
  if (command.version !== 1) throw new WebError(400, "A web command must declare version 1.");
  const commandId = requiredString(command.command_id, "command_id");
  if (!/^[0-9a-f-]{16,64}$/i.test(commandId)) throw new WebError(400, "command_id must be a UUID-like identifier.");
  return { version: 1, command_id: commandId, operation: requiredString(command.operation, "operation"), input: record(command.input, "input") };
}

function serveAsset(response: ServerResponse, pathname: string): void {
  const path = pathname === "/" ? "/index.html" : pathname;
  const asset = REDSKILLED_WEB_ASSETS[path] ?? (!pathname.includes(".") ? REDSKILLED_WEB_ASSETS["/index.html"] : undefined);
  if (asset == null) return writeToon(response, 404, { ok: false, error: "Asset not found." });
  response.writeHead(200, { "content-type": asset.type, "cache-control": path === "/index.html" ? "no-store" : "public, max-age=31536000, immutable" });
  response.end(Buffer.from(asset.base64, "base64"));
}

function writeToon(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/toon; charset=utf-8", "cache-control": "no-store" });
  response.end(`${encode(value as JsonValue)}\n`);
}
function writeHtml(response: ServerResponse, status: number, html: string): void { response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); response.end(html); }
function pairingFailure(): string { return "<!doctype html><meta charset=utf-8><title>Pairing expired</title><style>body{font:16px system-ui;background:#07080a;color:#f4f5f7;display:grid;place-content:center;min-height:100vh}code{color:#ff6389}</style><main><h1>Pairing link expired</h1><p>Create a new invitation with <code>redskilled web pair</code>.</p></main>"; }
function securityHeaders(response: ServerResponse): void { response.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"); response.setHeader("x-content-type-options", "nosniff"); response.setHeader("referrer-policy", "no-referrer"); response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()"); }
function cookie(request: IncomingMessage, name: string): string | undefined { for (const part of (request.headers.cookie ?? "").split(";")) { const [key, ...rest] = part.trim().split("="); if (key === name) return rest.join("="); } return undefined; }
function requireSameOrigin(request: IncomingMessage): void { const origin = request.headers.origin; const expected = `https://${request.headers.host}`; if (origin !== expected) throw new WebError(403, "The request origin was not this Redskilled Host."); }
async function body(request: IncomingMessage): Promise<string> { const chunks: Buffer[] = []; let bytes = 0; for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); bytes += value.length; if (bytes > MAX_BODY_BYTES) throw new WebError(413, "The command body is too large."); chunks.push(value); } return Buffer.concat(chunks).toString("utf8"); }
function throttle(request: IncomingMessage, rates: Map<string, { count: number; since: number }>, bucket: string, limit: number, windowMs: number): void { const key = `${request.socket.remoteAddress ?? "unknown"}:${bucket}`; const now = Date.now(); const current = rates.get(key); if (current == null || now - current.since >= windowMs) { rates.set(key, { count: 1, since: now }); return; } current.count += 1; if (current.count > limit) throw new WebError(429, "Too many requests. Try again shortly."); }
function record(value: unknown, label: string): Record<string, unknown> { if (value == null || typeof value !== "object" || Array.isArray(value)) throw new WebError(400, `${label} must be an object.`); return value as Record<string, unknown>; }
function requiredString(value: unknown, label: string): string { const text = typeof value === "string" ? value.trim() : ""; if (text === "" || text.length > 2_048) throw new WebError(400, `${label} must be a bounded non-empty string.`); return text; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function closeServer(server: Server): Promise<void> { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
class WebError extends Error { constructor(readonly status: number, message: string) { super(message); } }
