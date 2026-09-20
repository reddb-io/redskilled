# Redskilled software repository

Owns runtimes, MCP servers, daemon, apps, hooks, installers, tests and all package
publication. Canonical skills and marketplace content live in `reddb-io/red-skills`.

- Prepare pinned content with `node scripts/prepare-skills.mjs` before builds/tests.
- `plugins/` is generated. Edit helper implementations under `runtime/plugins/`;
  edit skill prose in RedSkills, then update `skills.lock.toon` to the reviewed SHA.
- Use isolated worktrees under `.red/tmp/worktrees/manual/`; preserve other work.
- Read `.red/CONTEXT-MAP.md` and the owning context for domain terminology.
- Keep structured state on TOON/TOONL and owned wires on TOON frames. The contracts
  under `.red/contracts` and the existing serialization tests remain authoritative.
- Only the host daemon births Workers. Keep helper process launches distinct.
- Preserve npm names, command names, MCP identities and persistent state paths.
- Issues about this software belong to `reddb-io/redskilled`. Use qualified issue
  references across repositories.
- Validate changes with focused tests and the package rehearsal before publishing.

**ask-red maintenance rule:** any skill add, rename, removal, or flow change
must re-check `plugins/dev/skills/engineering/ask-red/SKILL.md` in the composed
content; apply edits to its source in RedSkills. Use `writing-for-agents` when
editing agent instructions.

For Worker creation, read [guard-process-birth](plugins/dev/skills/engineering/guard-process-birth/SKILL.md).
For structured state or wires, read [guard-serialization](plugins/dev/skills/engineering/guard-serialization/SKILL.md).
