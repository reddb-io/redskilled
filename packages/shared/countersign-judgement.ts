import { allowLand, refuseLand, type LandSubject, type LandCountersignDecision } from "./land-countersign.js";
import { UNLABELED_VERIFY_REQUIREMENT, verifyRequirementShortfall, type VerifyRequirement } from "./verify-labels.js";
import { standingCountersigns, countersignKeyOf, type CountersignKey, type CountersignClass, type CountersignRow } from "./countersign-ledger.js";

/**
 * The Countersign classes that AUTHORIZE a merge. Narrower than {@link CountersignClass} on
 * purpose: the two names this list omits are the two a verifier writes when it
 * did not approve, and a land precondition that accepted them would be reading
 * "the reviewer answered" as "the reviewer said yes".
 */
export const LAND_PASSING_COUNTERSIGNS: readonly CountersignClass[] = [
  "live-verified",
  "test-verified",
  "type-check-only",
];

/** True when a Countersign class authorizes a merge. PURE. */
export function isPassingCountersign(countersign: CountersignClass): boolean {
  return LAND_PASSING_COUNTERSIGNS.includes(countersign);
}

/**
 * What the ledger says about one head, plus the row a refusal must supersede.
 *
 * The void is reported rather than performed so the rule stays pure: the same
 * decision drives a unit test with no filesystem and the live gate that appends.
 */
export interface LandCountersignJudgement {
  readonly decision: LandCountersignDecision;
  /**
   * The standing row this landing invalidates — a passing judgement of a
   * DIFFERENT head — which the gate voids before refusing. Null when nothing
   * stands to supersede.
   */
  readonly supersede: CountersignRow | null;
}

function subjectOf(key: CountersignKey): LandSubject {
  return { kind: "head", headSha: key.head_sha };
}

/**
 * Judge one head against every row the ledger holds. PURE.
 *
 * The order is the rule read top to bottom: the exact key first, then the
 * clean-rebase equivalence, then the stale judgement that must be voided, then
 * the absence.
 *
 * `requirement` is HOW STRONG the judgement must be — the bar the Ticket's
 * `verify:<value>` label declared (ADR 0156 §2). It is applied only to rows that
 * already PASS: a class that authorizes nothing is refused under its own name
 * first, because "the verifier refused" and "the verifier passed too weakly" are
 * different repairs and collapsing them would send both to the wrong one. The
 * default is the fail-closed unlabeled bar, never the discount, so a caller that
 * forgot to resolve a requirement gets ADR 0154's full precondition.
 */
export function decideLandCountersign(
  rows: readonly CountersignRow[],
  key: CountersignKey,
  requirement: VerifyRequirement = UNLABELED_VERIFY_REQUIREMENT,
): LandCountersignJudgement {
  const subject = subjectOf(key);
  const belowBar = (row: CountersignRow): LandCountersignJudgement | null => {
    const shortfall = verifyRequirementShortfall(requirement, row.countersign);
    return shortfall === null
      ? null
      : { decision: refuseLand("insufficient-countersign", subject, shortfall), supersede: null };
  };
  const forPr = rows.filter((row) => row.pr === key.pr);
  const standing = standingCountersigns(forPr);
  const exact = standing.get(countersignKeyOf(key));

  if (exact?.standing) {
    const row = exact.standing;
    if (isPassingCountersign(row.countersign)) {
      return (
        belowBar(row) ?? {
          decision: allowLand("head-sha", row.countersign, row.verifier_identity),
          supersede: null,
        }
      );
    }
    const reason = row.countersign === "verifier-failed" ? "verifier-failed" : "verifier-blocked";
    return { decision: refuseLand(reason, subject, row.reason ?? undefined), supersede: null };
  }
  if (exact) {
    const voided = exact.voidedBy;
    return {
      decision: refuseLand("voided-countersign", subject, voided?.reason ?? undefined),
      supersede: null,
    };
  }

  const passing = [...standing.values()]
    .map((entry) => entry.standing)
    .filter((row): row is CountersignRow => row !== null && isPassingCountersign(row.countersign));
  const rebased = passing.find((row) => row.patch_id === key.patch_id);
  if (rebased) {
    return (
      belowBar(rebased) ?? {
        decision: allowLand("patch-id", rebased.countersign, rebased.verifier_identity),
        supersede: null,
      }
    );
  }
  const stale = passing[passing.length - 1];
  if (stale) {
    return {
      decision: refuseLand("stale-countersign", subject, `judged at ${stale.head_sha.slice(0, 12)}`),
      supersede: stale,
    };
  }
  return { decision: refuseLand("no-countersign", subject), supersede: null };
}

