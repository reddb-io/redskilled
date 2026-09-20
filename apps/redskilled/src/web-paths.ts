import { homedir } from "node:os";
import { join } from "node:path";
import { redskilledHomeDir } from "@reddb-io/shared/redskilled-home.js";

export const REDSKILLED_WEB_DEFAULT_PORT = 25_051;

export interface RedskilledWebPaths {
  readonly root: string;
  readonly auth: string;
  readonly audit: string;
  readonly caCertificate: string;
  readonly caPrivateKey: string;
  readonly certificate: string;
  readonly privateKey: string;
  readonly lock: string;
}

export function redskilledWebPaths(homeDir: string = homedir()): RedskilledWebPaths {
  const root = join(redskilledHomeDir(homeDir), "web");
  return {
    root,
    auth: join(root, "auth.toon"),
    audit: join(root, "audit.toonl"),
    caCertificate: join(root, "ca.crt"),
    caPrivateKey: join(root, "ca.key"),
    certificate: join(root, "host.crt"),
    privateKey: join(root, "host.key"),
    lock: join(root, "auth.lock"),
  };
}
