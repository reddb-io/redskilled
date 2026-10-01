import { createCountersignLedger } from "@reddb-io/shared/countersign-ledger.js";
import { decideLandCountersign } from "@reddb-io/shared/countersign-judgement.js";
import { refuseLand, type LandCountersignDecision } from "@reddb-io/shared/land-countersign.js";
import type { RedskilledGithubCustodyUpstreamInput } from "./github-custody.js";

/** PR production is independent of merge authorization; custody asks again on every pass. */
export async function projectCustodyCountersign(
  input: RedskilledGithubCustodyUpstreamInput,
  headSha: string,
): Promise<LandCountersignDecision> {
  const subject = { kind: "head" as const, headSha };
  try {
    const ledger = createCountersignLedger(input.project.workspacePath);
    const rows = await ledger.read();
    const exact = rows.filter((row) => row.pr === input.pullRequest && row.head_sha === headSha).at(-1);
    // Custody has an exact head, never permission to infer clean-rebase equivalence.
    const key = { pr: input.pullRequest, head_sha: headSha, patch_id: exact?.patch_id ?? `head:${headSha}` };
    return decideLandCountersign(rows.filter((row) => row.head_sha === headSha), key).decision;
  } catch (error) {
    return refuseLand("verifier-blocked", subject, error instanceof Error ? error.message : String(error));
  }
}
