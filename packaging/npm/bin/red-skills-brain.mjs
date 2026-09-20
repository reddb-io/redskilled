#!/usr/bin/env node
import { cliFrontdoor } from "./cli-frontdoor.mjs";
cliFrontdoor("red-skills-brain", "[command] [args...]");
import { verifyRuntime } from "./runtime-compatibility.mjs";
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginBundle } from './runtime-paths.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try { verifyRuntime(root); } catch (error) { console.error(error.message); process.exit(1); }
const args = process.argv.slice(2);
try {
  const mcp = args[0] === 'mcp';
  const bundle = pluginBundle(root, 'brain', mcp);
  const result = spawnSync(process.execPath, [bundle, ...(mcp ? args.slice(1) : args)], { stdio: 'inherit' });
  if (result.signal) process.kill(process.pid, result.signal);
  process.exit(result.status ?? 1);
} catch (error) { console.error(error.message); process.exit(1); }
