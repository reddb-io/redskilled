import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname, networkInterfaces } from "node:os";
import forge from "node-forge";
import type { RedskilledWebPaths } from "./web-paths.js";

export interface RedskilledWebTls {
  readonly key: string;
  readonly cert: string;
  readonly ca: string;
  readonly fingerprint: string;
  readonly names: readonly string[];
}

export async function ensureRedskilledWebTls(paths: RedskilledWebPaths): Promise<RedskilledWebTls> {
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  let caCertificate: forge.pki.Certificate;
  let caKey: forge.pki.rsa.PrivateKey;
  try {
    caCertificate = forge.pki.certificateFromPem(await readFile(paths.caCertificate, "utf8"));
    caKey = forge.pki.privateKeyFromPem(await readFile(paths.caPrivateKey, "utf8"));
  } catch {
    const pair = forge.pki.rsa.generateKeyPair(2_048);
    caKey = pair.privateKey;
    caCertificate = forge.pki.createCertificate();
    caCertificate.publicKey = pair.publicKey;
    caCertificate.serialNumber = serial();
    caCertificate.validity.notBefore = new Date(Date.now() - 60_000);
    caCertificate.validity.notAfter = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1_000);
    const subject = [{ name: "commonName", value: "Redskilled Local CA" }, { name: "organizationName", value: "RedDB" }];
    caCertificate.setSubject(subject);
    caCertificate.setIssuer(subject);
    caCertificate.setExtensions([
      { name: "basicConstraints", cA: true },
      { name: "keyUsage", keyCertSign: true, cRLSign: true, digitalSignature: true },
      { name: "subjectKeyIdentifier" },
    ]);
    caCertificate.sign(caKey, forge.md.sha256.create());
    await secureWrite(paths.caPrivateKey, forge.pki.privateKeyToPem(caKey));
    await secureWrite(paths.caCertificate, forge.pki.certificateToPem(caCertificate));
  }

  const names = hostNames();
  const pair = forge.pki.rsa.generateKeyPair(2_048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = pair.publicKey;
  certificate.serialNumber = serial();
  certificate.validity.notBefore = new Date(Date.now() - 60_000);
  certificate.validity.notAfter = new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000);
  certificate.setSubject([{ name: "commonName", value: names[0] ?? "localhost" }, { name: "organizationName", value: "RedDB" }]);
  certificate.setIssuer(caCertificate.subject.attributes);
  certificate.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
    { name: "extKeyUsage", serverAuth: true },
    { name: "subjectAltName", altNames: names.map((value) => ip(value) ? { type: 7, ip: value } : { type: 2, value }) },
  ]);
  certificate.sign(caKey, forge.md.sha256.create());
  const key = forge.pki.privateKeyToPem(pair.privateKey);
  const cert = forge.pki.certificateToPem(certificate);
  const ca = forge.pki.certificateToPem(caCertificate);
  await secureWrite(paths.privateKey, key);
  await secureWrite(paths.certificate, cert);
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(caCertificate)).getBytes();
  const fingerprint = createHash("sha256").update(Buffer.from(der, "binary")).digest("hex").match(/.{2}/g)!.join(":").toUpperCase();
  return { key, cert, ca, fingerprint, names };
}

function hostNames(): string[] {
  const found = new Set(["localhost", "127.0.0.1", "::1", hostname()]);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) if (!entry.internal) found.add(entry.address);
  }
  return [...found];
}

function ip(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || value.includes(":");
}

function serial(): string {
  return randomBytes(16).toString("hex").replace(/^0/, "1");
}

async function secureWrite(path: string, value: string): Promise<void> {
  await writeFile(path, value, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}
