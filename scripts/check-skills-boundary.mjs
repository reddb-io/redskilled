#!/usr/bin/env node
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
const root = resolve(process.argv[2] ?? '.');
const errors = [];
function visit(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name), rel = relative(root, path);
    if (['.git', 'node_modules'].includes(name) || rel.startsWith('.red/tmp') || rel.startsWith('.red/state')) continue;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) { errors.push(`${rel}: symlinks are not declarative content`); continue; }
    if (stat.isDirectory()) { visit(path); continue; }
    if (/\.(?:[cm]?[jt]sx?|sh|bash|py|rs|go|wasm|tgz|vsix)$/.test(name) || stat.mode & 0o111) errors.push(`${rel}: executable content`);
    if (['pnpm-lock.yaml','pnpm-workspace.yaml','turbo.json'].includes(name)) errors.push(`${rel}: runtime workspace configuration`);
    if (name.endsWith('.json')) {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      function inspect(value) {
        if (!value || typeof value !== 'object') return;
        for (const [key, item] of Object.entries(value)) {
          if (key === 'command' && typeof item === 'string' && !/^red-skills-[a-z-]+(?: [a-zA-Z0-9/_-]+)*$/.test(item)) errors.push(`${rel}: non-declarative command ${item.slice(0, 80)}`);
          if (key === 'scripts' && !Array.isArray(item) && item && typeof item === 'object') errors.push(`${rel}: npm scripts`);
          inspect(item);
        }
      }
      inspect(data);
    }
    if (rel.startsWith('.github/workflows/') && /^\s*run:/m.test(readFileSync(path,'utf8'))) errors.push(`${rel}: workflow implementation belongs in redskilled`);
  }
}
visit(root);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Skills boundary: declarative content only');
