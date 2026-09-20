#!/usr/bin/env node
import { cliFrontdoor } from "./cli-frontdoor.mjs";
cliFrontdoor("red-skills-content", "<--check|--generate> <content checkout>");
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const [mode, input] = process.argv.slice(2);
if (!['--check','--generate'].includes(mode) || !input) { console.error('Usage: red-skills-content <--check|--generate> <skills checkout>'); process.exit(2); }
const scripts = resolve(dirname(fileURLToPath(import.meta.url)), '../scripts');
const root = resolve(input);
for (const [script, args] of [
  ['check-skills-boundary.mjs',[root]],
  ...['codex','gemini','pi'].map(host => [`generate-${host}-manifests.mjs`,['--root',root,...(mode === '--check' ? ['--check'] : [])]]),
]) {
  const result=spawnSync(process.execPath,[resolve(scripts,script),...args],{stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
