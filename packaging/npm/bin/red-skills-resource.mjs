#!/usr/bin/env node
// Access extracted helpers by their stable original plugin-relative identifier.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../runtime');
const [mode, name, ...args] = process.argv.slice(2);
const path = resolve(root, name ?? '');
if (!['run','read','path'].includes(mode) || !path.startsWith(root + sep) || !existsSync(path) || !realpathSync(path).startsWith(realpathSync(root) + sep)) {
  console.error('Usage: red-skills-resource <run|read|path> plugins/<plugin>/<resource> [args...]'); process.exit(2);
}
if (mode === 'path') console.log(path);
else if (mode === 'read') process.stdout.write(readFileSync(path));
else {
  const result = spawnSync(path.endsWith('.mjs') ? process.execPath : 'bash', [path, ...args], {stdio:'inherit'});
  if (result.signal) process.kill(process.pid, result.signal);
  process.exit(result.status ?? 1);
}
