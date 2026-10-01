import { describe, expect, it, vi } from "vitest";
import { createRedskilledGithubCustodyUpstream } from "../src/github-custody-upstream.js";

const HEAD = "a".repeat(40);
const input = {
  project: { projectId: "github:1", projectLabel: "acme/repo", workspacePath: "/fixture", credentialProfile: "personal" },
  credential: { secret: "fixture" }, pullRequest: 42, expectedHead: HEAD,
};

function fixture(head = HEAD) {
  let intent = false;
  const mutations: string[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") {
      const query = (JSON.parse(String(init.body)) as { query: string }).query;
      mutations.push(query);
      intent = query.includes("enablePullRequestAutoMerge");
      return new Response(JSON.stringify({ data: {} }));
    }
    return new Response(JSON.stringify({ node_id: "PR42", state: "open", mergeable: true,
      mergeable_state: "clean", head: { sha: head }, auto_merge: intent ? {} : null }));
  });
  return { upstream: createRedskilledGithubCustodyUpstream({ fetchImpl }), mutations };
}

describe("GitHub native intent at the reviewed head", () => {
  it("refuses a head that moved between custody's observation and the arm lookup", async () => {
    const h = fixture("b".repeat(40));
    await expect(h.upstream.arm(input)).rejects.toThrow("different from the countersigned commit");
    expect(h.mutations).toEqual([]);
  });

  it("enables and explicitly revokes the native intent", async () => {
    const h = fixture();
    expect((await h.upstream.arm(input)).native_intent).toBe(true);
    await h.upstream.disarm?.(input);
    expect(h.mutations[0]).toContain("enablePullRequestAutoMerge");
    expect(h.mutations[1]).toContain("disablePullRequestAutoMerge");
    expect((await h.upstream.observe(input)).native_intent).toBe(false);
  });
});
