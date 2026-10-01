import { describe, expect, it } from "vitest";
import { acquireClaim, renderClaimComment } from "@reddb-io/worker/engine";
import { createTicketClaimAdapter } from "../src/ticket-claim.js";
import type { RedskilledGithubProjectReader } from "../src/github-gateway.js";

function tracker(initial: { id: number; body: string }[] = []) {
  const comments = [...initial];
  const pages: string[] = [];
  const reader = {
    async readLive(read: { path: string }) {
      pages.push(read.path);
      const page = Number(new URL(`https://example.invalid/${read.path}`).searchParams.get("page"));
      return { value: comments.slice((page - 1) * 100, page * 100) };
    },
    async read() { throw new Error("a dated cache cannot elect a claimant"); },
    async write({ write }: { write: { body: string } }) {
      const row = { id: Math.max(0, ...comments.map((comment) => comment.id)) + 1, body: write.body };
      comments.push(row);
      return { value: row };
    },
  } as unknown as RedskilledGithubProjectReader;
  return { reader, comments, pages };
}

describe("the daemon Ticket claim election", () => {
  it("refuses a stale or backpressured comment snapshot", async () => {
    for (const answer of [{ value: [], cache: { outcome: "stale" } }, { value: [], backpressure: { reason: "rate-limit" } }]) {
      const h = tracker();
      h.reader.readLive = async () => answer as never;
      await expect(acquireClaim(createTicketClaimAdapter(h.reader, "acme/repo", "drain"), { worker: "drain" }, 42)).rejects.toThrow("authoritative");
    }
  });

  it("does not publish a new claim while local merge custody holds the Ticket", async () => {
    const h = tracker();
    const reader = Object.assign(h.reader, { mergeCustodyStatus: async () => ({ records: [{ owner_ticket: 42, state: "active" }] }) });
    await expect(acquireClaim(createTicketClaimAdapter(reader, "acme/repo", "drain"), { worker: "drain" }, 42)).rejects.toThrow("merge custody");
    expect(h.comments).toHaveLength(0);
  });

  it("admits one of two simultaneous mobile/drain contenders", async () => {
    const h = tracker();
    const decisions = await Promise.all(["mobile", "drain"].map((worker) =>
      acquireClaim(createTicketClaimAdapter(h.reader, "acme/repo", worker), { worker }, 42)));
    expect(decisions.map((decision) => decision.verdict)).toEqual(["won", "lost"]);
    expect(h.comments.at(-1)?.body).toContain("kind=concede");
  });

  it("finds an earlier owner beyond the first page of comments", async () => {
    const h = tracker([
      ...Array.from({ length: 100 }, (_, index) => ({ id: index + 1, body: "discussion" })),
      { id: 101, body: renderClaimComment({ worker: "owner" }) },
    ]);
    const decision = await acquireClaim(createTicketClaimAdapter(h.reader, "acme/repo", "drain"), { worker: "drain" }, 42);
    expect(decision.verdict).toBe("lost");
    expect(decision.winner).toBe("owner");
    expect(h.pages).toContain("repos/acme/repo/issues/42/comments?per_page=100&page=2");
  });
});
