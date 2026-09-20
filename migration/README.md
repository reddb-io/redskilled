# Repository cutover

Source: `source.toon`. The snapshot preserves all software at that commit; Git
history and past releases remain in reddb-io/red-skills. Extracted plugin code is
listed in `plugin-code.txt`. Canonical content is fetched by `skills.lock.toon`.

## Order

1. Validate both candidate trees, the package rehearsal, and the red-dev acquisition
   change. Publish the Redskilled repository with publishing disarmed.
2. Keep the publisher on the same organization-level `NPM_TOKEN` and
   `RELEASE_PAT` secrets used by RedSkills. Restore the existing Android signer
   and configure its four repository secrets separately when mobile releases are
   part of the cutover.
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
- Runtime cutover preparation landed in reddb-io/redskilled#13. Content separation
  landed in reddb-io/red-skills#4421, and the installer consumer change landed in
  reddb-io/red-dev#237.
- All 12 open runtime issues were transferred; see [issues.md](issues.md).
  The parent relationship for #2 -> #1 was restored and verified.
- Old `red-publish`, `red-release`, and `red-mobile-apk` workflows are disabled.
- Redskilled is the active publisher (`REDSKILLED_PUBLISH_ENABLED=true`). Version
  4.5.0 was published from commit `d9b92cf35ccd33b6b407f64f98450bda1aba5bfa`:
  https://github.com/reddb-io/redskilled/releases/tag/v4.5.0. The release workflow
  completed successfully at https://github.com/reddb-io/redskilled/actions/runs/35514328037.
- All five existing package names were published with `latest=4.5.0`, and a fresh
  isolated exact-version install verified their installed commands:
  `@reddb-io/red-skills`, `@reddb-io/red-skills-dev`,
  `@reddb-io/red-skills-memory`, `@reddb-io/red-skills-brain`, and
  `@reddb-io/red-skills-internal`.
- Mobile publishing is independently disarmed
  (`REDSKILLED_MOBILE_PUBLISH_ENABLED=false`) until the original Android signer
  is restored. Runtime, npm and GitHub releases do not depend on that cutover.
- `NPM_TOKEN` and `RELEASE_PAT` remain organization-owned and are inherited by
  the workflows under the same names used by RedSkills. Organization-secret
  inspection is restricted to administrators, so their values are intentionally
  neither copied nor stored as repository secrets.
- The four existing `ANDROID_RELEASE_*` signing secrets remain repository-specific
  and are the only credential copy still needed for signed mobile releases.
- The original Android `.jks` must be restored from backup before running the
  wizard. The old encrypted repository secret cannot be read back, and replacing
  the signer would break updates for already signed installs.
- Redskilled protects `main` with required `test` and `typecheck` checks. RedSkills
  protects `main` with `content / validate-content`; its post-cutover validation
  passed at https://github.com/reddb-io/red-skills/actions/runs/35514957711.
- The red-dev consumer uses RedSkills for versions before 4.5.0 and Redskilled for
  4.5.0 and later. Its post-merge CI passed at
  https://github.com/reddb-io/red-dev/actions/runs/35514928133, followed by the
  successful v1.0.141 release at
  https://github.com/reddb-io/red-dev/actions/runs/35514928105.

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
