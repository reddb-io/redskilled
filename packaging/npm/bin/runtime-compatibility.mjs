import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
export function verifyRuntime(root, env = process.env) {
  const pluginRoot = env.CODEX_PLUGIN_ROOT || env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return;
  const declaration = join(pluginRoot, 'runtime.toon');
  if (!existsSync(declaration)) return; // Legacy plugin installs predate the split.
  const source = readFileSync(declaration,'utf8');
  const match = /^version: ([0-9]+\.[0-9]+\.[0-9]+(?:-[\w.-]+)?)$/m.exec(source);
  if (!match) throw new Error('Invalid runtime.toon compatibility declaration');
  const installed = JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
  const compatible = /^compatible: \^([0-9]+)\.([0-9]+)\.([0-9]+)$/m.exec(source);
  const current = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(installed);
  const accepted = compatible && current && current[1] === compatible[1] &&
    (Number(current[2]) > Number(compatible[2]) || (current[2] === compatible[2] && Number(current[3]) >= Number(compatible[3])));
  if (installed !== match[1] && !accepted) throw new Error(`Skills require runtime ${match[1]}, installed ${installed}; install the matching Redskilled package set before activating these skills`);
}
