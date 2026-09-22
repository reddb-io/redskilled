import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDiagnosticWriter, diagnosticLineAssembler, diagnosticLogDirectory,
  diagnosticLogPath, diagnosticOpenCommand, installDiagnosticLogging, redactDiagnosticLine,
  openDiagnosticPath, diagnosticStreamForCommand,
} from "@reddb-io/shared/diagnostic-log.js";
import { runLogsCommand } from "../src/logs-command.js";

const roots: string[] = [];
function root(): string { const path = mkdtempSync(join(tmpdir(), "redskilled-diagnostics-")); roots.push(path); return path; }
function fixturePaths(directory: string) { return { env: { XDG_STATE_HOME: directory, LOCALAPPDATA: directory }, homeDir: directory }; }
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("predictable diagnostic paths", () => {
  it("honors absolute XDG state and ignores relative roots", () => {
    expect(diagnosticLogPath("daemon", { platform: "linux", env: { HOME: "/users/a", XDG_STATE_HOME: "/state space" } })).toBe("/state space/redskilled/logs/daemon.log");
    expect(diagnosticLogDirectory({ platform: "linux", env: { HOME: "/users/a", XDG_STATE_HOME: "relative" } })).toBe("/users/a/.local/state/redskilled/logs");
  });
  it("uses native Windows and macOS conventions", () => {
    expect(diagnosticLogPath("daemon", { platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\a b\\AppData\\Local" } })).toBe("C:\\Users\\a b\\AppData\\Local\\redskilled\\logs\\daemon.log");
    expect(diagnosticLogDirectory({ platform: "darwin", homeDir: "/Users/a", env: {} })).toBe("/Users/a/Library/Logs/redskilled");
    expect(diagnosticLogDirectory({ platform: "win32", env: { HOME: "/c/Users/wrong", USERPROFILE: "C:\\Users\\right" } })).toBe("C:\\Users\\right\\AppData\\Local\\redskilled\\logs");
    expect(() => diagnosticLogPath("../escape")).toThrow();
  });
});

describe("bounded diagnostic rotation", () => {
  it("rotates running writers, retains five files, and resumes after restart", () => {
    const path = join(root(), "private", "daemon.log");
    const options = { path, maxBytes: 256, now: () => "2026-09-22T10:00:00.000Z" };
    const first = createDiagnosticWriter(options);
    const second = createDiagnosticWriter(options);
    for (let index = 0; index < 60; index++) expect((index % 2 ? first : second).write(`record ${index} ${"x".repeat(45)}`)).toBe(true);
    expect(createDiagnosticWriter(options).write("after restart")).toBe(true);
    const files = readdirSync(dirname(path)).sort();
    expect(files).toEqual(["daemon.log", "daemon.log.1", "daemon.log.2", "daemon.log.3", "daemon.log.4"]);
    for (const file of files) expect(statSync(join(dirname(path), file)).size).toBeLessThanOrEqual(256);
    expect(readFileSync(path, "utf8")).toContain("after restart");
    if (process.platform !== "win32") {
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    }
  });
  it("bounds oversized input and oversized pre-existing files", () => {
    const path = join(root(), "daemon.log");
    writeFileSync(path, "old\n".repeat(1_000));
    writeFileSync(`${path}.1`, "é".repeat(1_000));
    const writer = createDiagnosticWriter({ path, maxBytes: 128 });
    expect(writer.write("token=" + "secret".repeat(1_000))).toBe(true);
    expect(writer.write("é".repeat(1_000))).toBe(true);
    for (const file of readdirSync(dirname(path))) expect(statSync(join(dirname(path), file)).size).toBeLessThanOrEqual(128);
    expect(readFileSync(path, "utf8")).toContain("oversized diagnostic line omitted");
    expect(readFileSync(path, "utf8")).not.toContain("�");
  });
  it("reports write failures without throwing or flooding the fallback", () => {
    const errors: unknown[] = [];
    const path = join(root(), "not-a-file");
    mkdirSync(path);
    const writer = createDiagnosticWriter({ path, onError: (error) => errors.push(error) });
    expect(writer.write("first")).toBe(false);
    expect(writer.write("second")).toBe(false);
    expect(errors).toHaveLength(1);
  });
  it("reclaims a dead writer lock after restart", () => {
    const path = join(root(), "daemon.log");
    mkdirSync(`${path}.lock`);
    writeFileSync(join(`${path}.lock`, "owner"), "2147483647");
    expect(createDiagnosticWriter({ path }).write("recovered")).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("recovered");
  });
  it("serializes concurrent processes through rotation without losing retained records", async () => {
    const path = join(root(), "daemon.log");
    const module = new URL("../../../packages/shared/diagnostic-log.ts", import.meta.url).href;
    const run = (id: number) => new Promise<void>((resolve, reject) => {
      const script = `import { createDiagnosticWriter } from ${JSON.stringify(module)}; const w=createDiagnosticWriter({path:${JSON.stringify(path)},maxBytes:512,onError:(error)=>console.error(error)}); for(let i=0;i<10;i++) if(!w.write('process ${id} record '+i)) process.exitCode=1;`;
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { stdio: ["ignore", "ignore", "pipe"] });
      let error = "";
      child.stderr.on("data", (chunk) => { error += chunk; });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(error || `child ${code}`)));
    });
    await Promise.all([run(1), run(2)]);
    const files = readdirSync(dirname(path)).filter((name) => /^daemon\.log(?:\.[1-4])?$/.test(name));
    expect(files.length).toBeGreaterThan(1);
    const lines = files.flatMap((file) => readFileSync(join(dirname(path), file), "utf8").trim().split("\n"));
    expect(lines).toHaveLength(20);
    expect(new Set(lines.map((line) => line.slice(line.indexOf("process")))).size).toBe(20);
  });
});

describe("diagnostic privacy and stream boundaries", () => {
  it("selects only long-running companions, never pairing/CLI/protocol routes", () => {
    expect(diagnosticStreamForCommand("web", ["serve"])).toBe("web");
    expect(diagnosticStreamForCommand("link", ["host"])).toBe("link");
    expect(diagnosticStreamForCommand("link", ["relay"])).toBe("relay");
    for (const surface of ["web", "link"] as const) {
      for (const command of ["pair", "invite", "onboard", "devices", "status", "unit", "acp", "--version", "--help"]) {
        expect(diagnosticStreamForCommand(surface, [command])).toBeUndefined();
      }
      expect(diagnosticStreamForCommand(surface, ["serve", "--help"])).toBeUndefined();
    }
  });
  it("assembles tokens and split UTF-8 before redaction, discards huge lines", () => {
    const lines: string[] = [];
    const assembler = diagnosticLineAssembler((line) => lines.push(redactDiagnosticLine(line)), 64);
    assembler.write("Authorization: Bear");
    assembler.write("er abcsecret\n");
    const bytes = Buffer.from("olá\n");
    assembler.write(bytes.subarray(0, 3));
    assembler.write(bytes.subarray(3));
    assembler.write("z".repeat(1_000));
    assembler.write("still huge\nnormal\n");
    assembler.flush();
    expect(lines).toEqual(["[sensitive diagnostic omitted]", "olá", "[oversized diagnostic line omitted]", "normal"]);
  });
  it("redacts credential and request payload keys", () => {
    const line = redactDiagnosticLine('failure api_key=secretkey url=https://user:pass@host/?token=xyz');
    expect(line).not.toMatch(/secretkey|user:pass|xyz/);
    expect(redactDiagnosticLine('request_body={"text":"private prompt"}')).not.toContain("private prompt");
    expect(redactDiagnosticLine("ghp_topsecretvalue sk-longsecretkey")).not.toContain("topsecret");
    expect(redactDiagnosticLine('token="line-one\nline-two" at Error')).not.toMatch(/line-one|line-two/);
  });
  it("suppresses quoted credential continuations across stderr lines", () => {
    const lines: string[] = [];
    const assembler = diagnosticLineAssembler((line) => lines.push(redactDiagnosticLine(line)));
    assembler.write('token="first secret\n');
    assembler.write('second secret"\nhealthy diagnostic\n');
    assembler.flush();
    expect(lines.join("\n")).not.toContain("secret");
    expect(lines.at(-1)).toBe("healthy diagnostic");
  });
  it("captures stderr, restores it, and never replaces stdout", () => {
    const directory = root();
    const stdout = process.stdout.write;
    const stderr = process.stderr.write;
    const capture = installDiagnosticLogging("daemon", fixturePaths(directory));
    try { process.stderr.write("diagnostic warning for test\n"); } finally { capture.close(); }
    expect(process.stdout.write).toBe(stdout);
    expect(process.stderr.write).toBe(stderr);
    const content = readFileSync(capture.path, "utf8");
    expect(content).toContain("process started pid=");
    expect(content).toContain("WARN diagnostic warning for test");
    expect(content).toContain("process stopped pid=");
  });
  it("records fatal errors without changing Node's failing exit or machine stdout", async () => {
    const directory = root();
    const module = new URL("../../../packages/shared/diagnostic-log.ts", import.meta.url).href;
    const script = `import { installDiagnosticLogging } from ${JSON.stringify(module)}; installDiagnosticLogging('daemon', ${JSON.stringify(fixturePaths(directory))}); process.stdout.write('machine wire\\n'); process.stderr.write('Authorization: Be'); process.stderr.write('arer hidden-token\\n'); throw new Error('crash fixture');`;
    const result = await new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "ignore"] });
      let stdout = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.once("error", reject);
      child.once("exit", (code) => resolve({ code, stdout }));
    });
    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe("machine wire\n");
    const log = readFileSync(diagnosticLogPath("daemon", fixturePaths(directory)), "utf8");
    expect(log).toContain("FATAL Error: crash fixture");
    expect(log).not.toContain("hidden-token");
  });
});

describe("offline log access", () => {
  it("prints the path without creating files or starting a daemon", async () => {
    const directory = root();
    let output = "";
    await runLogsCommand(["--path"], { ...fixturePaths(directory), write: (text) => { output += text; } });
    expect(output).toBe(diagnosticLogPath("daemon", fixturePaths(directory)) + "\n");
    expect(readdirSync(directory)).toEqual([]);
  });
  it("passes spaces and shell metacharacters as literal argv", () => {
    const path = "/path with spaces/$(touch pwned);'&/daemon.log";
    expect(diagnosticOpenCommand(path, "linux")).toEqual({ command: "xdg-open", args: [path] });
    expect(diagnosticOpenCommand(path, "darwin")).toEqual({ command: "open", args: [path] });
    expect(diagnosticOpenCommand(path, "win32")).toEqual({ command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", path] });
  });
  it.skipIf(process.platform === "win32")("reports a real failed/missing opener without an unhandled child error", async () => {
    const directory = root();
    const path = join(directory, "daemon with spaces.log");
    writeFileSync(path, "fixture");
    writeFileSync(join(directory, "xdg-open"), "#!/bin/sh\nexit 7\n", { mode: 0o700 });
    await expect(openDiagnosticPath(path, { platform: "linux", env: { PATH: directory } })).rejects.toThrow("exited 7");
    await expect(openDiagnosticPath(path, { platform: "linux", env: { PATH: join(directory, "missing") } })).rejects.toThrow();
    await expect(openDiagnosticPath(join(directory, "missing.log"), { platform: "linux", env: { PATH: directory } })).rejects.toThrow("does not exist yet");
  });
  it.skipIf(process.platform === "win32")("acknowledges a long-lived editor without killing it", async () => {
    const directory = root();
    const path = join(directory, "daemon.log");
    const proof = join(directory, "editor-survived");
    writeFileSync(path, "fixture");
    writeFileSync(join(directory, "xdg-open"), '#!/bin/sh\n/bin/sleep 1\nprintf alive > "$DIAGNOSTIC_OPENED_FILE"\n', { mode: 0o700 });
    await openDiagnosticPath(path, { platform: "linux", env: { PATH: directory, DIAGNOSTIC_OPENED_FILE: proof } });
    // After acknowledgement, the launcher/editor must still be able to finish.
    for (let count = 0; count < 40 && !existsSync(proof); count++) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(readFileSync(proof, "utf8")).toBe("alive");
  });
  it("opens exactly the existing daemon file and surfaces missing files/opener errors", async () => {
    const directory = root();
    const options = fixturePaths(directory);
    const path = diagnosticLogPath("daemon", options);
    await expect(runLogsCommand(["--open"], options)).rejects.toThrow("older releases use journalctl");
    createDiagnosticWriter({ path }).write("ready");
    const opened: string[] = [];
    await runLogsCommand(["--open"], { ...options, open: async (target) => { opened.push(target); } });
    expect(opened).toEqual([path]);
    await expect(runLogsCommand(["--open"], { ...options, open: async () => { throw new Error("opener unavailable"); } })).rejects.toThrow("opener unavailable");
    await expect(runLogsCommand(["--clear"], options)).rejects.toThrow("Usage:");
  });
});
