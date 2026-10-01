// Project-bound GitHub read validation and authority refusals.
import type { RedskilledGithubProjectAuthority, RedskilledGithubRead } from "./github-gateway.js";

export class RedskilledGithubAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedskilledGithubAuthorityError";
  }
}

export function validateAuthority(
  authority: RedskilledGithubProjectAuthority,
): RedskilledGithubProjectAuthority {
  const fields = [authority.projectId, authority.projectLabel, authority.workspacePath, authority.credentialProfile];
  if (fields.some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new RedskilledGithubAuthorityError("a GitHub reader needs one resolved Project and credential profile");
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(authority.projectLabel)) {
    throw new RedskilledGithubAuthorityError("the resolved Project has no canonical GitHub repository identity");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(authority.credentialProfile)) {
    throw new RedskilledGithubAuthorityError("the daemon-owned credential profile name is not publishable");
  }
  return { ...authority };
}

export function validateRead(
  project: RedskilledGithubProjectAuthority,
  request: RedskilledGithubRead,
): RedskilledGithubRead {
  if (request == null || typeof request !== "object") return refuse("a GitHub read must be an object");
  if (request.kind === "rest") {
    requireOnlyKeys(request, ["kind", "path"]);
    return validateRestRead(project, request);
  }
  if (request.kind === "graphql") {
    requireOnlyKeys(request, ["kind", "selection"]);
    return validateGraphqlRead(request);
  }
  if (request.kind === "repository-fetch") {
    requireOnlyKeys(request, ["kind", "ref"]);
    return validateRepositoryFetch(request);
  }
  return refuse("Project authority permits only REST, GraphQL, and repository-fetch reads");
}

function validateRestRead(
  project: RedskilledGithubProjectAuthority,
  request: Extract<RedskilledGithubRead, { kind: "rest" }>,
): RedskilledGithubRead {
  let path = typeof request.path === "string" ? request.path.trim().replace(/^\/+/, "") : "";
  const repositoryPrefix = `repos/${project.projectLabel}/`;
  if (path.startsWith("repos/")) {
    if (!path.toLowerCase().startsWith(repositoryPrefix.toLowerCase())) {
      return refuse("a Project GitHub reader cannot address another repository");
    }
    path = path.slice(repositoryPrefix.length);
  }
  if (path === "" || path.includes("\\") || path.split("/").some((part) => part === ".." || part === ".")) {
    return refuse("a Project GitHub REST read needs one repository-relative path");
  }
  const root = path.split(/[/?#]/, 1)[0]!.toLowerCase();
  if (["admin", "applications", "enterprises", "installation", "installations", "orgs", "rate_limit", "user", "users"].includes(root)) {
    return refuse("Project authority cannot use the GitHub gateway for host or account administration");
  }
  return { kind: "rest", path };
}

function validateGraphqlRead(
  request: Extract<RedskilledGithubRead, { kind: "graphql" }>,
): RedskilledGithubRead {
  const selection = typeof request.selection === "string"
    ? request.selection.trim().replace(/\s+/g, " ")
    : "";
  if (selection === "") return refuse("a Project GraphQL read needs a repository field selection");
  // The upstream wraps this selection inside repository(owner:, name:). Root
  // operations and root-only fields are therefore refused rather than parsed or
  // executed as caller-authored documents.
  if (/\b(query|mutation|subscription|repository|viewer|user|organization|enterprise|node|nodes|search|rateLimit)\b\s*(?:\(|\{)/i.test(selection) || selection.includes("$")) {
    return refuse("a Project GraphQL read may select fields only from its bound repository");
  }
  return { kind: "graphql", selection };
}

function validateRepositoryFetch(
  request: Extract<RedskilledGithubRead, { kind: "repository-fetch" }>,
): RedskilledGithubRead {
  if (request.ref == null || request.ref.trim() === "") return { kind: "repository-fetch" };
  const ref = request.ref.trim();
  if (!/^refs\/(heads|tags)\/[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(ref) ||
    ref.includes("..") || ref.includes("//") || ref.endsWith(".") || ref.endsWith("/") || ref.includes("@{")) {
    return refuse("a Project repository fetch may name only one ordinary branch or tag ref");
  }
  return { kind: "repository-fetch", ref };
}

export function refuse(message: string): never {
  throw new RedskilledGithubAuthorityError(message);
}

function requireOnlyKeys(value: object, allowed: readonly string[]): void {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra != null) {
    refuse("a Project GitHub read cannot carry Project, credential, remote, or host authority fields");
  }
}

