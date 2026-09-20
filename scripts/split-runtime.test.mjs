import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
function fixture() {
  const dir = mkdtempSync(join(tmpdir(),'split-runtime-'));
  cpSync(join(root,'packaging/npm/bin'),join(dir,'bin'),{recursive:true});
  mkdirSync(join(dir,'runtime/plugins/dev/hooks'),{recursive:true});
  cpSync(join(root,'runtime/hook-routes.json'),join(dir,'runtime/hook-routes.json'));
  writeFileSync(join(dir,'package.json'),'{"type":"module","version":"4.5.0"}');
  return dir;
}
test('packaged commands resolve plugins from installed npm siblings without network', () => {
 const dir=fixture();
 try {
  const plugin=join(dir,'node_modules/@reddb-io/red-skills-memory');mkdirSync(join(plugin,'dist'),{recursive:true});
  writeFileSync(join(plugin,'package.json'),'{"name":"@reddb-io/red-skills-memory","version":"4.5.0"}');
  writeFileSync(join(plugin,'dist/memory-mcp.bundle.min.mjs'),'console.log("mcp-ready")');
  const res=spawnSync(process.execPath,[join(dir,'bin/red-skills-memory.mjs'),'mcp'],{encoding:'utf8'});
  assert.equal(res.status,0,res.stderr);assert.equal(res.stdout.trim(),'mcp-ready');
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('missing runtime fails actionably instead of installing at hook time', () => {
 const dir=fixture();try {
  const res=spawnSync(process.execPath,[join(dir,'bin/red-skills-hook.mjs'),'dev/claude/SessionStart/0'],{input:'{}',encoding:'utf8'});
  assert.equal(res.status,1);assert.match(res.stderr,/reinstall/);
 }finally {rmSync(dir,{recursive:true,force:true});}
});
test('hooks receive unchanged stdin and retain their denial response', () => {
 const dir=fixture();try {
  writeFileSync(join(dir,'runtime/plugins/dev/hooks/command-guard.sh'),'#!/bin/bash\ncat\n');
  const body='{"decision":"block","reason":"contract"}';
  const res=spawnSync(process.execPath,[join(dir,'bin/red-skills-hook.mjs'),'dev/claude/PreToolUse/1'],{input:body,encoding:'utf8'});
  assert.equal(res.status,0,res.stderr);assert.equal(res.stdout,body);
 }finally {rmSync(dir,{recursive:true,force:true});}
});
test('resource reader refuses traversal', () => {
 const dir=fixture();try {
  const res=spawnSync(process.execPath,[join(dir,'bin/red-skills-resource.mjs'),'read','../package.json'],{encoding:'utf8'});
  assert.equal(res.status,2);
 }finally {rmSync(dir,{recursive:true,force:true});}
});
