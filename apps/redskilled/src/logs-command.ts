import { stat } from "node:fs/promises";
import { diagnosticLogPath, openDiagnosticPath, type DiagnosticPathOptions } from "@reddb-io/shared/diagnostic-log.js";

export const LOGS_USAGE = "Usage: redskilled logs [--path | --open]\n\nPrint the daemon diagnostic log path, or open its existing file. Never starts the daemon.\n";

export async function runLogsCommand(args: readonly string[], options: DiagnosticPathOptions & {
  readonly write?: (text: string) => void;
  readonly open?: (path: string) => Promise<void>;
} = {}): Promise<number> {
  if (args.length > 1 || (args[0] != null && args[0] !== "--path" && args[0] !== "--open")) throw new Error(LOGS_USAGE.trim());
  const path = diagnosticLogPath("daemon", options);
  if (args[0] !== "--open") { (options.write ?? ((text) => process.stdout.write(text)))(`${path}\n`); return 0; }
  await openDaemonLog(path, options.open ?? ((target) => openDiagnosticPath(target, options)));
  return 0;
}

export async function openDaemonLog(path: string, open = openDiagnosticPath): Promise<void> {
  try {
    if (!(await stat(path)).isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`No readable daemon diagnostic log at ${path}. This version creates it when the daemon starts; older releases use journalctl --user -u redskilled.service.`);
  }
  await open(path);
}
