# Contributing

Read AGENTS.md and README.md for the content/software boundary. Runtime code lives
under apps/ and packages/; extracted plugin helpers live under runtime/plugins/.
Build inputs in plugins/ are composed from the content lock, never edited as source.

Run focused tests, workspace typechecks and the release pack rehearsal for packaging
changes. Keep publication disarmed during migration until every condition in
migration/README.md is satisfied. Package identity and persistent state are stable.
