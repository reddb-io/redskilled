#!/usr/bin/env node
import { cliFrontdoor } from "./cli-frontdoor.mjs";
cliFrontdoor("red-skills-hook", "<plugin/host/event/route>");
import { verifyRuntime } from "./runtime-compatibility.mjs";
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pluginBundle } from './runtime-paths.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try { verifyRuntime(root); } catch (error) { console.error(error.message); process.exit(1); }
const routes = JSON.parse(readFileSync(join(root, 'runtime/hook-routes.json'), 'utf8'));
const route = routes[process.argv.slice(2)[0]];
if (!route) { console.error('red-skills-hook: unknown hook route'); process.exit(2); }
const timeout = Math.max(100, Number.parseFloat(process.env.RED_SKILLS_HOOK_TIMEOUT_S || '3') * 1000);
let input = '', ended = false;
const timer = setTimeout(() => { process.stdin.destroy(); run(); }, timeout);
process.stdin.setEncoding('utf8');
process.stdin.on('data', data => { input += data; if (input.length > 4 * 1024 * 1024) { console.error('red-skills-hook: oversized input'); process.exit(2); } });
process.stdin.on('end', run);
function run() {
  if (ended) return;
  ended = true; clearTimeout(timer);
  let target, args;
  try {
    if (route.kind === 'ready') {
      if (!existsSync(join(root, 'dist/redskilled.bundle.min.mjs'))) throw new Error('runtime is incomplete; reinstall the pinned Redskilled package set');
      process.stdout.write('{}'); return;
    }
    target = route.kind === 'plugin' ? pluginBundle(root, route.plugin, false) : join(root, 'runtime', route.path);
    args = route.args ?? [];
    if (!existsSync(target)) throw new Error(`missing runtime resource ${target}`);
  } catch (error) { console.error(`red-skills-hook: ${error.message}`); process.exitCode = 1; return; }
  const pluginRoot = join(root, 'runtime/plugins', route.plugin);
  const child = spawn(target.endsWith('.sh') ? 'bash' : process.execPath, [realpathSync(target), ...args], {
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, CODEX_PLUGIN_ROOT: pluginRoot }, stdio: ['pipe','pipe','inherit'],
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  const stop = setTimeout(() => child.kill('SIGKILL'), timeout);
  child.on('error', error => { clearTimeout(stop); console.error(error.message); process.exitCode = 1; });
  child.on('close', code => { clearTimeout(stop); process.stdout.write(output || '{}'); if (code) process.exitCode = code; });
}
