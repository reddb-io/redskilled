# Redskilled

Software and distribution for the [RedSkills marketplace](https://github.com/reddb-io/red-skills):
MCP servers, host daemon, worker runtime, tunnel, mobile and desktop interfaces,
IDE/terminal integrations, hooks, installers and all published packages.

The repositories are siblings with independent versions. Package names, command
names, host identities and existing state locations remain stable.

## Development

Requires Node 22+, pnpm 11.5.0 and the tooling declared by each app.

```sh
node scripts/prepare-skills.mjs
REDDB_SKIP_POSTINSTALL=1 pnpm install --frozen-lockfile
pnpm bundle
pnpm typecheck
```

`skills.lock.toon` pins the exact RedSkills commit. `plugins/` and root marketplace
manifests are generated, ignored inputs, composed with implementations in `runtime/`.
Edit skills in RedSkills; edit software here. To test a coordinated candidate:

```sh
node scripts/prepare-skills.mjs --source ../red-skills
node scripts/check-skills-boundary.mjs ../red-skills
```

The explicit local source is for development only. CI/release always uses the lock.
Run `pnpm skills:prepare` after changing the lock and before tests or packaging.

## Installation and publishing

`scripts/install-runtime.sh <exact-version>` installs the existing core and plugin
npm packages and checks command availability. Hosts require the commands on PATH;
hooks and MCP startup do not fetch packages. `red-skills-resource` exposes helpers
extracted from the content repository. `red-skills-hook` owns host hook behavior.

The existing publisher now belongs here. `REDSKILLED_PUBLISH_ENABLED` remains off
until the old publisher is disabled and credentials, signing and consumers have
passed the migration checks. See [migration/README.md](migration/README.md).
