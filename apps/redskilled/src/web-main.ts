#!/usr/bin/env node
import { runRedskilledWebCommand } from "./web-command.js";

try { process.exitCode = await runRedskilledWebCommand(process.argv.slice(2)); }
catch (error) { process.stderr.write(`redskilled web: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
