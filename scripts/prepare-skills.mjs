#!/usr/bin/env node
// Materialise content pinned by commit; a local candidate must be explicitly supplied.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--source')) throw new Error('Usage: prepare-skills.mjs [--source <content checkout>]');
const lock = Object.fromEntries(readFileSync(join(root, 'skills.lock.toon'), 'utf8').trim().split('\n').map(line => line.split(/: /)));
if (lock.repository !== 'reddb-io/red-skills' || !/^[a-f0-9]{40}$/.test(lock.commit)) throw new Error('Invalid skills lock');
let source = args[1] && resolve(args[1]);
let temp;
try {
  if (!source) {
    const cache = join(root, '.skills-cache');
    mkdirSync(cache, { recursive: true });
    if (!existsSync(join(cache, 'HEAD'))) execFileSync('git', ['init', '--bare', cache]);
    try { execFileSync('git', ['--git-dir', cache, 'cat-file', '-e', `${lock.commit}^{commit}`], { stdio: 'pipe' }); }
    catch { execFileSync('git', ['--git-dir', cache, 'fetch', '--depth=1', `https://github.com/${lock.repository}.git`, lock.commit], { stdio: 'inherit' }); }
    temp = mkdtempSync(join(tmpdir(), 'redskilled-skills-'));
    execFileSync('tar', ['-x', '-C', temp], { input: execFileSync('git', ['--git-dir', cache, 'archive', lock.commit], { maxBuffer: 128 * 1024 * 1024 }) });
    source = temp;
  }
  if (resolve(source) === root) throw new Error('Content source must be a separate checkout');
  for (const path of ['plugins', '.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json', '.gemini-plugin/marketplace.json']) {
    if (!existsSync(join(source, path))) throw new Error(`Content missing: ${path}`);
    rmSync(join(root, path), { recursive: true, force: true });
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(source, path), join(root, path), { recursive: true, filter: path => !path.split('/').some(p => ['node_modules', '.git', 'dist'].includes(p)) });
  }
  // This generated tree is consumed by existing packagers and runtime resource loaders.
  cpSync(join(root, 'runtime/plugins'), join(root, 'plugins'), { recursive: true });
  console.log(`Composed skills from ${args[1] ? source : lock.commit}`);
} finally { if (temp) rmSync(temp, { recursive: true, force: true }); }
