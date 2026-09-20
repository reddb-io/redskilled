# Repository cutover

Source: `source.toon`. The snapshot preserves all software at that commit; Git
history and past releases remain in reddb-io/red-skills. Extracted plugin code is
listed in `plugin-code.txt`. Canonical content is fetched by `skills.lock.toon`.

## Order

1. Validate both candidate trees, the package rehearsal, and the red-dev acquisition
   change. Publish the Redskilled repository with publishing disarmed.
2. Configure repository/environment secrets for npm, release pushes, and Android
   signing with `bash scripts/setup-redskilled-publishing.sh`. Existing secrets
   cannot be read back from GitHub and copied.
3. Disable `red-publish`, `red-release`, and `red-mobile-apk` in RedSkills, and verify
   no publishing job is running. Enable `REDSKILLED_PUBLISH_ENABLED=true` only after
   the old publishing authority is off and the release is ready.
4. Publish a version newer than the last npm version, with unchanged package names.
   Verify the exact registry installs, release assets, signatures and Android signer.
5. Land the RedSkills content-only branch and the red-dev acquisition change only
   after the runtime required by `runtime.toon` is available.
6. Transfer the open runtime issues with workers idle; record old/new URLs, rewrite
   local req/spec references by identity, and verify all unresolved edges remain held.

## Implementation status

- Public runtime snapshot is published at https://github.com/reddb-io/redskilled.
- Content separation is reviewable in reddb-io/red-skills#4421; the installer
  consumer change is in reddb-io/red-dev#237. Both remain draft until cutover.
- All 12 open runtime issues were transferred; see [issues.md](issues.md).
  The parent relationship for #2 -> #1 was restored and verified.
- Old `red-publish`, `red-release`, and `red-mobile-apk` workflows are disabled.
- New publishing remains disarmed (`REDSKILLED_PUBLISH_ENABLED=false`). No npm
  release or tag was published during this migration. The prepared version is 4.5.0.
- Repository secrets still need administrator configuration: `NPM_TOKEN`,
  `RELEASE_PAT`, and the four existing `ANDROID_RELEASE_*` signing secrets.
  GitHub refused organization-secret inspection with HTTP 403 (`admin:org`).
- At content cutover, replace the old required `test`/`typecheck` checks with
  `content / validate-content`; do not merge manifests requiring 4.5.0 before
  that runtime has been published and its exact-version install verified.

## Runtime/content contract

- Runtime install is explicit (`scripts/install-runtime.sh <exact-version>`).
- `red-skills-hook` dispatches installed hook implementations; manifests contain
  only a command and route identifier. No `npx` occurs in a host hook.
- `red-skills-resource run|read|path <original plugin resource>` exposes helpers.
- `red-skills-content --check|--generate <content checkout>` owns content tooling.
- `req:owner/repo#number` is resolved by periodic unblock passes; unresolved remote
  edges cannot be consumed by a local close cascade.
- The signed workstation set includes `runtime-entrypoints.tgz` alongside existing
  asset names. npm and the expanded workstation tree expose the same commands.

Rollback keeps the previous verified runtime/content pair. Never delete old tags,
packages, caches or state to reverse this migration.
