# Split validation

Validated against content commit `0bdca8420bc859002d4034fc9ed145754c78954e`.

## Passed

- Declarative content boundary; Codex, Gemini and Pi manifest projections.
- Workspace lint and all 20 typecheck tasks.
- Full runtime CI at `01f503222266983355c899a6ee8001d6abd8dda4` passed,
  including ACP local transport on Linux and Windows:
  https://github.com/reddb-io/redskilled/actions/runs/35480596758
- All 12 runtime bundle tasks, staged at version 4.5.0.
- Five-package pack/install rehearsal: unchanged package names, 71 OpenCode
  skills, hooks and MCP declarations.
- Signed workstation package-set contract and offline expansion fixtures.
- Five installed runtime integration tests, including hook denial preservation,
  missing runtime, sibling package lookup, traversal rejection and compatibility.
- Dev: 479 files, 6,130 passing tests and one skipped test.
- Release, Link and OpenCode suites after corrections: all three tasks passed.
  Link initially timed out under parallel load; its complete isolated suite passed.
- RedSkills PR #4421 content CI; red-dev PR #237 typecheck/test/build, shellcheck,
  bootstrap and package-set checks. The focused consumer run passed 159 tests.

## Broader-suite limits

The expanded daemon run reported 1,384 passed and 19 failed tests across 175
files, plus one unhandled rejection. The hard-coded artifact version fixture was
then corrected to explicitly stamp its test version; all five artifact tests
passed on rerun. The remaining 18 failures include telemetry tests calling asynchronous handlers synchronously, a statusline consumer allowlist,
ACP conformance/dispatch/publication expectations and other stale assertions.
The source snapshot already lacks `src/acp-go-admission.ts`, referenced by a test.
Before that fixture correction, all 372 daemon/protocol files were compared to source commit
`ed3e4067b1a80abe003e79b1c5d677144ad2f791`: no differences other than package
version metadata. This establishes preserved source, not a full clean-baseline
reproduction of every failing test. These failures remain visible and must not
be presented as an all-green workspace test run.

No release was published. Registry ownership/credentials, actual Sigstore
identity and the Android signing identity still require a real release cutover.
