import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
export function pluginBundle(root, plugin, mcp) {
  const name = `${plugin}${mcp ? '-mcp' : ''}.bundle.min.mjs`;
  const candidates = [join(root, 'dist', name)];
  try { candidates.push(join(dirname(createRequire(join(root, 'package.json')).resolve(`@reddb-io/red-skills-${plugin}/package.json`)), 'dist', name)); } catch {}
  // The verified workstation package set expands plugins alongside the core dist/.
  candidates.push(join(root, 'plugins', plugin, 'dist', name));
  const result = candidates.find(existsSync);
  if (!result) throw new Error(`Install @reddb-io/red-skills-${plugin} at the same runtime version before starting ${plugin}`);
  return result;
}
