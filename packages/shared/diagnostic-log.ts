/** Human diagnostics only. Never use this rotation for replay/state/Worker lanes. */
import { spawn } from "node:child_process";
import {
  chmodSync, closeSync, constants, fstatSync, ftruncateSync, lstatSync,
  mkdirSync, openSync, readFileSync, readSync, renameSync, rmdirSync,
  unlinkSync, writeFileSync, writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, posix, win32 } from "node:path";
import { StringDecoder } from "node:string_decoder";

export const DIAGNOSTIC_MAX_BYTES = 10 * 1024 * 1024;
export const DIAGNOSTIC_FILE_COUNT = 5;
export const DIAGNOSTIC_MAX_LINE_BYTES = 16 * 1024;
export type DiagnosticLevel = "INFO" | "WARN" | "ERROR" | "FATAL";

/** Explicit serving routes only: pairing output and other CLI results are never captured. */
export function diagnosticStreamForCommand(surface: "web" | "link", argv: readonly string[]): string | undefined {
  if (argv.some((argument) => argument === "--help" || argument === "-h")) return undefined;
  if (surface === "web") return argv[0] === "serve" ? "web" : undefined;
  return argv[0] === "host" ? "link" : argv[0] === "relay" ? "relay" : undefined;
}

export interface DiagnosticPathOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
}

/** New diagnostics have an OS-standard home; existing ~/.red state never moves. */
export function diagnosticLogDirectory(options: DiagnosticPathOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? (platform === "win32" ? env.USERPROFILE : env.HOME) ?? homedir();
  if (platform === "win32") {
    const local = env.LOCALAPPDATA;
    return win32.join(local && win32.isAbsolute(local) ? local : win32.join(home, "AppData", "Local"), "redskilled", "logs");
  }
  if (platform === "darwin") return posix.join(home, "Library", "Logs", "redskilled");
  const state = env.XDG_STATE_HOME;
  return posix.join(state && posix.isAbsolute(state) ? state : posix.join(home, ".local", "state"), "redskilled", "logs");
}

export function diagnosticLogPath(stream = "daemon", options: DiagnosticPathOptions = {}): string {
  if (!/^[a-z][a-z0-9-]*$/.test(stream)) throw new Error("invalid diagnostic stream name");
  const path = (options.platform ?? process.platform) === "win32" ? win32 : posix;
  return path.join(diagnosticLogDirectory(options), `${stream}.log`);
}

/** Defense in depth for error messages: we never intentionally log request bodies. */
export function redactDiagnosticLine(line: string): string {
  return line
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\b(?:request[_ -]?body|response[_ -]?body|prompt|messages|authorization|proxy-authorization|cookie|set-cookie)\b["']?\s*[:=][\s\S]*/gi, "[sensitive diagnostic omitted]")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.~-]+/gi, "[REDACTED authorization]")
    .replace(/\b(?:access[_-]?token|refresh[_-]?token|api[_-]?key|secret|password|token)\b(["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi, "[REDACTED credential]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{8,})\b/g, "[REDACTED token]")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@");
}

interface DiagnosticWriterOptions {
  readonly path: string;
  readonly maxBytes?: number;
  readonly fileCount?: number;
  readonly now?: () => string;
  readonly onError?: (error: unknown) => void;
}

function absent(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === "ENOENT"; }

/** One append owns the lock and opens the current pathname; no stale file handles. */
export function createDiagnosticWriter(options: DiagnosticWriterOptions): { write(line: string, level?: DiagnosticLevel): boolean } {
  const maxBytes = options.maxBytes ?? DIAGNOSTIC_MAX_BYTES;
  const fileCount = options.fileCount ?? DIAGNOSTIC_FILE_COUNT;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 128 || !Number.isSafeInteger(fileCount) || fileCount < 1) {
    throw new Error("invalid diagnostic retention policy");
  }
  let warned = false;
  let normalized = false;
  return {
    write(line, level = "INFO"): boolean {
      let unlock: (() => void) | undefined;
      try {
        mkdirSync(dirname(options.path), { recursive: true, mode: 0o700 });
        if (!lstatSync(dirname(options.path)).isDirectory()) throw new Error("diagnostic directory must not be a symlink");
        chmodSync(dirname(options.path), 0o700);
        unlock = lockLog(options.path);
        if (!normalized) {
          for (let index = 0; index < fileCount; index++) boundExisting(index === 0 ? options.path : `${options.path}.${index}`, maxBytes);
          normalized = true;
        }
        const prefix = `${(options.now ?? (() => new Date().toISOString()))()} ${level} `;
        let record = `${prefix}${redactDiagnosticLine(line).replace(/[\r\n]/g, " ")}\n`;
        if (Buffer.byteLength(record) > maxBytes) record = `${prefix}[oversized diagnostic line omitted]\n`;
        if (Buffer.byteLength(record) > maxBytes) throw new Error("diagnostic prefix exceeds the file limit");
        let bytes = 0;
        try { bytes = lstatSync(options.path).size; } catch (error) { if (!absent(error)) throw error; }
        if (bytes + Buffer.byteLength(record) > maxBytes) rotate(options.path, fileCount);
        const fd = openSync(options.path, constants.O_CREAT | constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0), 0o600);
        try {
          if (!fstatSync(fd).isFile()) throw new Error("diagnostic path is not a regular file");
          chmodSync(options.path, 0o600);
          writeSync(fd, record);
        } finally { closeSync(fd); }
        warned = false;
        return true;
      } catch (error) {
        if (!warned) { warned = true; try { options.onError?.(error); } catch { /* diagnostics never kill the service */ } }
        return false;
      } finally { unlock?.(); }
    },
  };
}

function regularOrAbsent(path: string): boolean {
  try {
    if (!lstatSync(path).isFile()) throw new Error("diagnostic path is not a regular file");
    return true;
  } catch (error) { if (absent(error)) return false; throw error; }
}

function rotate(path: string, files: number): void {
  for (let index = 0; index < files; index++) regularOrAbsent(index === 0 ? path : `${path}.${index}`);
  const oldest = files === 1 ? path : `${path}.${files - 1}`;
  try { unlinkSync(oldest); } catch (error) { if (!absent(error)) throw error; }
  for (let index = files - 2; index >= 0; index--) {
    const from = index === 0 ? path : `${path}.${index}`;
    try { renameSync(from, `${path}.${index + 1}`); } catch (error) { if (!absent(error)) throw error; }
  }
}

/** Recover a pre-existing oversized diagnostic file with a bounded tail read. */
function boundExisting(path: string, limit: number): void {
  if (!regularOrAbsent(path)) return;
  const fd = openSync(path, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
  try {
    const size = fstatSync(fd).size;
    if (size > limit) {
      const tail = Buffer.alloc(limit);
      const read = readSync(fd, tail, 0, limit, size - limit);
      // Discard the first partial record rather than publishing a partial token/UTF-8 sequence.
      const newline = tail.subarray(0, read).indexOf(10);
      const retained = newline < 0 ? Buffer.alloc(0) : tail.subarray(newline + 1, read);
      ftruncateSync(fd, 0);
      if (retained.length > 0) writeSync(fd, retained, 0, retained.length, 0);
    }
    chmodSync(path, 0o600);
  } finally { closeSync(fd); }
}

/** Bounded contention; a dead writer's lock is reclaimable, a live writer's is not. */
function lockLog(path: string): () => void {
  const lock = `${path}.lock`;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      writeFileSync(join(lock, "owner"), String(process.pid), { mode: 0o600 });
      return () => {
        try { unlinkSync(join(lock, "owner")); rmdirSync(lock); } catch { /* another attempt reports failures */ }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let observed;
      try { observed = lstatSync(lock); } catch (probe) { if (absent(probe)) continue; throw probe; }
      if (!observed.isDirectory()) throw new Error("diagnostic lock is not a directory");
      let stale = false;
      try {
        const pid = Number(readFileSync(join(lock, "owner"), "utf8"));
        if (Number.isSafeInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); } catch (probe) { stale = (probe as NodeJS.ErrnoException).code === "ESRCH"; }
        }
      } catch (probe) {
        // The owner file and then its directory disappear during ordinary
        // unlock. Do not stat the directory again here: it may already be gone,
        // and that race is contention to retry, not a lost diagnostic record.
        stale = absent(probe) && Date.now() - observed.mtimeMs > 30_000;
      }
      if (stale) {
        // Only one reaper may clear the stale owner. The fixed marker avoids
        // two reapers removing a successor's lock after the first released it.
        let reaper: number;
        try { reaper = openSync(`${lock}.reaper`, "wx", 0o600); }
        catch {
          // A crash while recovering another crash must not strand the sink.
          reapDeadRecoveryMarker(`${lock}.reaper`);
          continue;
        }
        try {
          writeSync(reaper, String(process.pid));
          // A successor may have acquired a different directory while we waited.
          let current;
          try { current = lstatSync(lock); } catch (probe) { if (absent(probe)) continue; throw probe; }
          if (current.ino !== observed.ino || current.birthtimeMs !== observed.birthtimeMs) continue;
          try { unlinkSync(join(lock, "owner")); } catch (probe) { if (!absent(probe)) throw probe; }
          rmdirSync(lock);
        } finally { closeSync(reaper); unlinkSync(`${lock}.reaper`); }
        continue;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  throw new Error(`diagnostic log busy: ${path}`);
}

function reapDeadRecoveryMarker(path: string): void {
  try {
    const observed = lstatSync(path);
    if (!observed.isFile()) return;
    const pid = Number(readFileSync(path, "utf8"));
    if (Number.isSafeInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); return; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") return; }
    } else if (Date.now() - observed.mtimeMs <= 30_000) return;
    const current = lstatSync(path);
    if (current.ino === observed.ino && current.birthtimeMs === observed.birthtimeMs) unlinkSync(path);
  } catch { /* no permission or another writer recovered it; never seize a live lock */ }
}

/** Do not redact independent chunks: a credential can straddle write calls. */
export function diagnosticLineAssembler(emit: (line: string) => void, maxBytes = DIAGNOSTIC_MAX_LINE_BYTES) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let oversized = false;
  let sensitiveQuote: string | undefined;
  const finishLine = (line: string): void => {
    if (sensitiveQuote != null) {
      // A quoted credential may itself contain newlines. Suppress the whole
      // continuation, including the closing line, rather than emit fragments.
      if (line.includes(sensitiveQuote)) sensitiveQuote = undefined;
      emit("[sensitive diagnostic continuation omitted]");
      return;
    }
    const quoted = /\b(?:access[_-]?token|refresh[_-]?token|api[_-]?key|secret|password|token|authorization|cookie)\b["']?\s*[:=]\s*(["'])(.*)$/i.exec(line);
    if (quoted && !quoted[2]!.includes(quoted[1]!)) {
      sensitiveQuote = quoted[1];
      emit("[sensitive diagnostic omitted]");
    } else emit(line);
  };
  const consume = (text: string): void => {
    for (const part of text.split(/(?<=\n)/)) {
      const ends = part.endsWith("\n");
      if (!oversized) {
        if (Buffer.byteLength(pending) + Buffer.byteLength(part) > maxBytes) { pending = ""; oversized = true; }
        else pending += part;
      }
      if (ends) {
        finishLine(oversized ? "[oversized diagnostic line omitted]" : pending.replace(/\r?\n$/, ""));
        pending = "";
        oversized = false;
      }
    }
  };
  return {
    write(chunk: string | Uint8Array, encoding: BufferEncoding = "utf8"): void {
      consume(decoder.write(typeof chunk === "string" ? Buffer.from(chunk, encoding) : Buffer.from(chunk)));
    },
    flush(): void {
      consume(decoder.end());
      if (pending || oversized) finishLine(oversized ? "[oversized diagnostic line omitted]" : pending);
      pending = ""; oversized = false;
    },
  };
}

/** Scoped to a serving process. stdout, stderr's consumer, and callbacks stay intact. */
export function installDiagnosticLogging(stream = "daemon", options: DiagnosticPathOptions = {}) {
  const path = diagnosticLogPath(stream, options);
  const original = process.stderr.write;
  const writer = createDiagnosticWriter({ path, onError: () => original.call(process.stderr, `redskilled: diagnostic log unavailable at ${path}; stderr/journal remains available\n`) });
  const lines = diagnosticLineAssembler((line) => writer.write(line, /\b(?:error|fail(?:ed|ure)?|fatal)\b/i.test(line) ? "ERROR" : /\bwarn(?:ing)?\b/i.test(line) ? "WARN" : "INFO"));
  const wrapped = function (this: NodeJS.WriteStream, ...args: Parameters<typeof process.stderr.write>): boolean {
    const [chunk, encoding] = args;
    lines.write(chunk, typeof encoding === "string" ? encoding : "utf8");
    return original.apply(this, args);
  } as typeof process.stderr.write;
  const crash = (error: Error): void => { lines.flush(); writer.write(error.stack ?? error.message, "FATAL"); };
  process.stderr.write = wrapped;
  process.on("uncaughtExceptionMonitor", crash);
  writer.write(`${stream} process started pid=${process.pid}`);
  return {
    path,
    error(error: unknown): void { writer.write(error instanceof Error ? error.stack ?? error.message : String(error), "ERROR"); },
    close(): void {
      lines.flush();
      if (process.stderr.write === wrapped) process.stderr.write = original;
      process.removeListener("uncaughtExceptionMonitor", crash);
      writer.write(`${stream} process stopped pid=${process.pid}`);
    },
  };
}

export function diagnosticOpenCommand(path: string, platform: NodeJS.Platform = process.platform): { command: string; args: string[] } {
  if (platform === "darwin") return { command: "open", args: [path] };
  // Not cmd /c start: shell metacharacters in a user's profile path stay data.
  if (platform === "win32") return { command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", path] };
  return { command: "xdg-open", args: [path] };
}

export async function openDiagnosticPath(path: string, options: DiagnosticPathOptions = {}): Promise<void> {
  if (!regularOrAbsent(path)) throw new Error(`diagnostic log does not exist yet: ${path}`);
  const command = diagnosticOpenCommand(path, options.platform);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args, { env: options.env ?? process.env, detached: true, stdio: "ignore", windowsHide: true });
    let settled = false;
    const done = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.unref();
      if (error) reject(error); else resolve();
    };
    // Some launchers become the editor itself. Acknowledge submission without
    // waiting for, or ever killing, the user's editor. Catch early failures.
    const timer = setTimeout(() => done(), 500);
    child.once("error", done);
    child.once("exit", (code) => done(code === 0 ? undefined : new Error(`log opener exited ${code ?? "on signal"}`)));
  });
}
