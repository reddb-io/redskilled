import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
export function verifyRuntime(root, env = process.env) {
  const pluginRoot = env.CODEX_PLUGIN_ROOT || env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return;
  const declaration = join(pluginRoot, 'runtime.toon');
  if (!existsSync(declaration)) return; // Legacy plugin installs predate the split.
  const match = /^version: ([0-9]+\.[0-9]+\.[0-9]+(?:-[\w.-]+)?)$/m.exec(readFileSync(declaration,'utf8'));
  if (!match) throw new Error('Invalid runtime.toon compatibility declaration');
  const installed = JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
  if (installed !== match[1]) throw new Error(`Skills require runtime ${match[1]}, installed ${installed}; install the matching Redskilled package set before activating these skills`);
}
