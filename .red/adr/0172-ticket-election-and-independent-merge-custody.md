# 0172 — Ticket election precedes birth; independent approval precedes merge

- **Status**: accepted
- **Date**: 2026-09-30
- **Related**: ADR 0130 (host-owned Worker lifecycle); ADR 0144 (Project control state); ADR 0154 (independent verification); ADR 0156 (Countersign); ADR 0165 (atomic dispatch)

## Context

Mobile dispatch verifies its claim election before Worker admission. The
unattended drain instead published a claim marker from inside the Worker and
implemented without verifying a winner. Its local gate skipped review, while
the optional pre-land Countersign port was unwired. Durable merge custody could
therefore arm native merge intent based only on the implementing Worker's gate.

## Decision

Both dispatch paths use the same claim election through the Project-bound
GitHub gateway. Reads used to elect an owner bypass dated cache answers and
paginate the comment thread. The unattended daemon wins before admission,
marks the handoff preclaimed, and releases a won claim if admission fails.
A Ticket already held in active local merge custody cannot start another Worker.

PR production and merge authorization have distinct lifetimes. A Worker may
publish and hand off a PR, then release its host slot. The durable Project
partition checks the shared Countersign ledger before arming native merge
intent and on subsequent custody passes. Missing, withdrawn, unavailable, or
nonmatching approval retains the PR with an explicit `await-countersign`
reason. Existing native intent is revoked when approval no longer stands or
the head moves. Legacy custody records without an armed head remain readable
but must restate that head before merge can be authorized.

The ledger implementation and pure judgement live in `packages/shared`;
plugin import paths remain compatible. Custody accepts exact-head evidence,
without inferring rebase equivalence. This amends the earlier division that
left the ledger question solely with a disposable Worker: checking durable
project-owned authorization is Project control state, not model execution.

The required workspace CI aggregate includes complete Worker and daemon suites
in bounded shards. Focused ACP contracts continue to run on Linux and Windows.

## Consequences

A missing verifier holds the PR rather than repeatedly paying for implementation.
This change does not introduce a reviewer model runtime or change configured
runners. Verifier producers must still write independently attributed evidence
to the canonical Project ledger. GitHub branch protection remains authoritative
for actual integration; custody observes changes on its polling cadence and
checks the head again immediately before requesting native intent.
