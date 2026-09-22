import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDiagnosticWriter } from "./diagnostic-log.js";

const roots: string[] = [];
function fixture(): string { const directory = mkdtempSync(join(tmpdir(), "shared-diagnostics-")); roots.push(directory); return directory; }
afterEach(() => { for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("shared diagnostic writer contract", () => {
  it("accepts the exact byte boundary and rotates a one-file stream before crossing it", () => {
    const directory = fixture();
    const path = join(directory, "single.log");
    const writer = createDiagnosticWriter({ path, maxBytes: 128, fileCount: 1, now: () => "T" });
    // Each record adds eight bytes: 'T INFO ' plus the final newline.
    expect(writer.write("x".repeat(100))).toBe(true);
    expect(writer.write("y".repeat(12))).toBe(true);
    expect(statSync(path).size).toBe(128);
    expect(writer.write("replacement")).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("T INFO replacement\n");
    expect(readdirSync(directory)).toEqual(["single.log"]);
  });

  it("rejects invalid retention limits before creating any file", () => {
    const directory = fixture();
    const path = join(directory, "daemon.log");
    for (const maxBytes of [0, 127, NaN, Infinity, 128.5]) {
      expect(() => createDiagnosticWriter({ path, maxBytes })).toThrow("invalid diagnostic retention");
    }
    for (const fileCount of [0, -1, NaN, Infinity, 1.5]) {
      expect(() => createDiagnosticWriter({ path, fileCount })).toThrow("invalid diagnostic retention");
    }
    expect(readdirSync(directory)).toEqual([]);
  });

  it.skipIf(process.platform === "win32")("refuses a symlink archive without replacing its target or current file", () => {
    const directory = fixture();
    const path = join(directory, "daemon.log");
    const unrelated = join(directory, "unrelated");
    writeFileSync(path, "current evidence\n");
    writeFileSync(unrelated, "do not touch\n");
    symlinkSync(unrelated, `${path}.1`);
    const errors: unknown[] = [];
    const writer = createDiagnosticWriter({ path, maxBytes: 128, onError: (error) => errors.push(error) });
    expect(writer.write("incoming")).toBe(false);
    expect(errors).toHaveLength(1);
    expect(readFileSync(path, "utf8")).toBe("current evidence\n");
    expect(readFileSync(unrelated, "utf8")).toBe("do not touch\n");
    expect(readdirSync(directory)).not.toContain("daemon.log.lock");
  });
});
