import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { decode, encode, type JsonValue } from "@reddb-io/toon";
import type { RedskilledWebPaths } from "./web-paths.js";

export const REDSKILLED_WEB_COOKIE = "redskilled_session";
const INVITATION_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

interface Invitation { readonly hash: string; readonly expires_at: string; readonly name: string; }
interface Session { readonly hash: string; readonly device_id: string; readonly csrf: string; readonly created_at: string; readonly last_seen_at: string; }
export interface RedskilledWebDevice { readonly id: string; readonly name: string; readonly created_at: string; readonly last_seen_at: string; readonly revoked_at?: string; }
interface AuthState { readonly version: 1; readonly invitations: readonly Invitation[]; readonly sessions: readonly Session[]; readonly devices: readonly RedskilledWebDevice[]; }
const EMPTY: AuthState = { version: 1, invitations: [], sessions: [], devices: [] };

export interface RedskilledWebIdentity { readonly token: string; readonly csrf: string; readonly device: RedskilledWebDevice; }

export async function createWebInvitation(paths: RedskilledWebPaths, name = "Browser"): Promise<{ token: string; expiresAt: string }> {
  const token = secret();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
  await mutate(paths, (state) => ({ ...state, invitations: [...liveInvitations(state), { hash: hash(token), expires_at: expiresAt, name: name.slice(0, 80) || "Browser" }] }));
  return { token, expiresAt };
}

export async function redeemWebInvitation(paths: RedskilledWebPaths, token: string): Promise<RedskilledWebIdentity | null> {
  let identity: RedskilledWebIdentity | null = null;
  await mutate(paths, (state) => {
    const invitation = liveInvitations(state).find((entry) => equal(entry.hash, hash(token)));
    if (invitation == null) return { ...state, invitations: liveInvitations(state) };
    const now = new Date().toISOString();
    const sessionToken = secret();
    const device: RedskilledWebDevice = { id: randomUUID(), name: invitation.name, created_at: now, last_seen_at: now };
    const session: Session = { hash: hash(sessionToken), device_id: device.id, csrf: secret(), created_at: now, last_seen_at: now };
    identity = { token: sessionToken, csrf: session.csrf, device };
    return {
      ...state,
      invitations: liveInvitations(state).filter((entry) => entry !== invitation),
      devices: [...state.devices, device],
      sessions: [...state.sessions, session],
    };
  });
  return identity;
}

export async function authenticateWebSession(paths: RedskilledWebPaths, token: string | undefined): Promise<RedskilledWebIdentity | null> {
  if (!token) return null;
  let identity: RedskilledWebIdentity | null = null;
  await mutate(paths, (state) => {
    const sessions = liveSessions(state);
    const session = sessions.find((entry) => equal(entry.hash, hash(token)));
    if (session == null) return sessions === state.sessions ? state : { ...state, sessions };
    const device = state.devices.find((entry) => entry.id === session.device_id && entry.revoked_at == null);
    if (device == null) return { ...state, sessions: state.sessions.filter((entry) => entry !== session) };
    const now = new Date().toISOString();
    const touchedDevice = { ...device, last_seen_at: now };
    identity = { token, csrf: session.csrf, device: touchedDevice };
    return {
      ...state,
      devices: state.devices.map((entry) => entry.id === device.id ? touchedDevice : entry),
      sessions: sessions.map((entry) => entry === session ? { ...entry, last_seen_at: now } : entry),
    };
  });
  return identity;
}

export async function listWebDevices(paths: RedskilledWebPaths): Promise<readonly RedskilledWebDevice[]> {
  return (await readState(paths)).devices;
}

export async function revokeWebDevice(paths: RedskilledWebPaths, id: string): Promise<boolean> {
  let applied = false;
  await mutate(paths, (state) => {
    const now = new Date().toISOString();
    const devices = state.devices.map((device) => {
      if (device.id !== id || device.revoked_at != null) return device;
      applied = true;
      return { ...device, revoked_at: now };
    });
    return { ...state, devices, sessions: state.sessions.filter((session) => session.device_id !== id) };
  });
  return applied;
}

export function sessionCookie(token: string): string {
  return `${REDSKILLED_WEB_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
}

async function readState(paths: RedskilledWebPaths): Promise<AuthState> {
  try {
    const value = decode(await readFile(paths.auth, "utf8")) as unknown;
    return isState(value) ? value : EMPTY;
  } catch { return EMPTY; }
}

async function mutate(paths: RedskilledWebPaths, change: (state: AuthState) => AuthState): Promise<void> {
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const lock = await open(paths.lock, "wx", 0o600);
      try {
        const next = change(await readState(paths));
        const temporary = `${paths.auth}.${process.pid}.${randomUUID()}.tmp`;
        await writeFile(temporary, encode(next as unknown as JsonValue), { mode: 0o600 });
        await rename(temporary, paths.auth);
      } finally {
        await lock.close();
        await rm(paths.lock, { force: true });
      }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error("redskilled web authentication store remained locked");
}

function liveInvitations(state: AuthState): Invitation[] {
  const now = Date.now();
  return state.invitations.filter((entry) => Date.parse(entry.expires_at) > now);
}
function liveSessions(state: AuthState): readonly Session[] {
  const oldest = Date.now() - SESSION_TTL_MS;
  const live = state.sessions.filter((entry) => Date.parse(entry.created_at) > oldest);
  return live.length === state.sessions.length ? state.sessions : live;
}
function secret(): string { return randomBytes(32).toString("base64url"); }
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function equal(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function isState(value: unknown): value is AuthState {
  const state = value as Partial<AuthState> | null;
  return state?.version === 1 && Array.isArray(state.invitations) && Array.isArray(state.sessions) && Array.isArray(state.devices);
}
