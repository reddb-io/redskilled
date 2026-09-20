@AGENTS.md

**ask-red maintenance rule:** any skill add, rename, removal, or flow change
must re-check `plugins/dev/skills/engineering/ask-red/SKILL.md` in the composed
content; apply edits to its source in RedSkills. Use `writing-for-agents` when
editing agent instructions.

A project's `.red/` never contains `redskilled` daemon logs. Worker logs live at
`.red/tmp/workers/{id}/worker.log.toonl`; the daemon log lives at
`~/.red/redskilled/redskilled.log.toonl`.

Runtime layout (content is composed separately):

```text
redskilled/
├── apps/
│   ├── herdr-plugin-redskilled/
│   ├── host-opencode/
│   ├── mcp-browser/
│   ├── mcp-navigator/
│   ├── plugin-brain/
│   ├── plugin-dev/
│   ├── plugin-memory/
│   ├── redskilled/
│   ├── redskilled-link/
│   ├── redskilled-mobile/
│   ├── release/
│   ├── rsp/
│   ├── vscode-extension-redskilled/
│   ├── worker-container/
│   ├── zellij-plugin-redskilled/
├── packages/
│   ├── brain-store/
│   ├── brand-tokens/
│   ├── browser-bridge/
│   ├── build-info/
│   ├── cdp-driver/
│   ├── github/
│   ├── protocol-acp/
│   ├── red-skills-link-protocol/
│   ├── redskilled-render/
│   ├── shared/
│   ├── worker/
```

For Worker creation, read [guard-process-birth](plugins/dev/skills/engineering/guard-process-birth/SKILL.md).
For structured state or wires, read [guard-serialization](plugins/dev/skills/engineering/guard-serialization/SKILL.md).
