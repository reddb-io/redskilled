# 0171 — The browser dashboard is a paired Host companion

- **Status**: accepted
- **Date**: 2026-09-20
- **Related**: ADR 0158 (remote control is a companion); ADR 0166 (bounded Mobile operator); ADR 0170 (TOON ACP wire)

## Context

An operator needs one host-wide surface for every Project, Worker, queue,
budget and typed control operation. Putting HTTPS, certificates, browser
sessions and static assets in the daemon would couple network-facing failures
to the process that admits and protects every Worker. Forwarding arbitrary ACP
would also make each future daemon method remotely callable without a product
decision.

## Decision

`redskilled-web` is a separately supervised process and release artifact. It
serves the pinned RedDB Design System dashboard over HTTPS and reaches the
daemon only through the local ACP socket. The daemon remains the sole authority
for Projects and Workers.

Every browser pairs through a short-lived, one-use invitation and receives an
individually revocable session. The Host owns a private local CA. The web API
uses TOON snapshots and TOON-framed update streams, accepts only an explicit
versioned operation allowlist, and resolves Projects from daemon registrations.
It never accepts a shell command, arbitrary filesystem path, credential read or
caller-named ACP method. A newly added daemon method is denied until this web
contract explicitly admits it.

The companion listens on localhost and the LAN by default at port 25051. Host
policy may narrow its bind or disable LAN. Remote access beyond the LAN remains
the responsibility of `redskilled-link`.

## Consequences

The workstation package set carries a second Redskilled bundle and provisioning
installs a second user service. A failure of that service costs the dashboard,
never Worker admission. Browser trust requires installing the Host CA once per
device, after verifying the fingerprint shown by the local CLI.
