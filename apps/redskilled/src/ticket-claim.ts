import { randomUUID } from "node:crypto";
import { acquireClaim, renderClaimComment, type ClaimGh, type RawClaimComment } from "@reddb-io/worker/engine";
import { credentialForAcpProject, type RedskilledGithubGatewayRegistration, type RedskilledGithubProjectReader } from "./github-gateway.js";
import type { AcpProjectWorkspace } from "./project-workspace.js";

/** The mobile dispatcher and the unattended drain contend through the same election. */
export function createTicketClaimAdapter(reader: RedskilledGithubProjectReader, repository: string, workerId: string): ClaimGh {
  let sequence = 0;
  const publish = async (issue: number, body: string): Promise<unknown> => {
    sequence += 1;
    return (await reader.write({
      idempotency_key: `claim:${workerId}:${issue}:${sequence}:${randomUUID()}`.slice(0, 128),
      write: { kind: "issue-publication", issue, body },
    })).value;
  };
  return {
    async postClaim(issue, body) {
      const managed = reader as RedskilledGithubProjectReader & {
        mergeCustodyStatus?: () => Promise<{ records: readonly { owner_ticket: number; state: string }[] }>;
      };
      const custody = await managed.mergeCustodyStatus?.();
      if (custody?.records.some((record) => record.owner_ticket === issue && record.state === "active")) {
        throw new Error(`Ticket #${issue} already has a PR in merge custody`);
      }
      const value = await publish(issue, body) as { id?: unknown } | null;
      const id = Number(value?.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("GitHub published no claim comment id");
      return id;
    },
    async listClaims(issue): Promise<RawClaimComment[]> {
      const comments: RawClaimComment[] = [];
      // A winner on page two still owns the Ticket. Truncation must never elect a second owner.
      for (let page = 1; page <= 100; page += 1) {
        const read = { kind: "rest" as const, path: `repos/${repository}/issues/${issue}/comments?per_page=100&page=${page}` };
        const answer = await (reader.readLive == null ? reader.read(read) : reader.readLive(read));
        if (answer.backpressure != null || answer.cache?.outcome === "stale") {
          throw new Error("GitHub claim election requires an authoritative comment read");
        }
        if (!Array.isArray(answer.value)) throw new Error("GitHub returned no claim comment list");
        for (const entry of answer.value) {
          if (entry == null || typeof entry !== "object") continue;
          const id = Number(entry.id);
          if (Number.isSafeInteger(id) && id > 0 && typeof entry.body === "string") comments.push({ id, body: entry.body });
        }
        if (answer.value.length < 100) return comments;
      }
      throw new Error("GitHub claim election exceeded its comment pagination bound");
    },
    async concede(issue, body) { await publish(issue, body); },
  };
}

export interface ClaimedDemandTicket { release(): Promise<void>; }

/** Win before birth, under the Project's daemon-owned credential profile. */
export async function claimDemandTicket(
  registration: RedskilledGithubGatewayRegistration | undefined,
  project: AcpProjectWorkspace,
  ticket: number,
  workerId: string,
): Promise<ClaimedDemandTicket> {
  const selection = await credentialForAcpProject(registration, project);
  if (registration == null || selection == null) throw new Error("Ticket admission requires a daemon-owned GitHub credential profile");
  const reader = registration.gateway.forProject({
    projectId: project.projectId, projectLabel: project.projectLabel,
    workspacePath: project.workspacePath, credentialProfile: selection.profile,
  }, selection.credential);
  return claimTicketOwnership(reader, project.projectLabel, ticket, workerId);
}

/** Both entry points release an unverifiable election before refusing admission. */
export async function claimTicketOwnership(
  reader: RedskilledGithubProjectReader,
  repository: string,
  ticket: number,
  workerId: string,
): Promise<ClaimedDemandTicket> {
  const claim = createTicketClaimAdapter(reader, repository, workerId);
  const release = async () => claim.concede(ticket, renderClaimComment({ worker: workerId }, "concede", "released"));
  let decision;
  try {
    decision = await acquireClaim(claim, { worker: workerId, createdAt: new Date().toISOString() }, ticket);
  } catch (error) {
    await release().catch(() => undefined);
    throw error;
  }
  if (decision.verdict !== "won") throw new Error(`Ticket #${ticket} is already claimed by ${decision.winner ?? "another Worker"}`);
  return { release };
}
