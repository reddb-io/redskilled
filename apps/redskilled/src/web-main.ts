#!/usr/bin/env node
import { runRedskilledWebCommand } from "./web-command.js";
import { diagnosticStreamForCommand, installDiagnosticLogging } from "@reddb-io/shared/diagnostic-log.js";

const diagnosticStream = diagnosticStreamForCommand("web", process.argv.slice(2));
const diagnostics = diagnosticStream == null ? undefined : installDiagnosticLogging(diagnosticStream);
try { process.exitCode = await runRedskilledWebCommand(process.argv.slice(2)); }
catch (error) { diagnostics?.error(error); process.stderr.write(`redskilled web: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
finally { diagnostics?.close(); }
