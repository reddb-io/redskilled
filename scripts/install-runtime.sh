#!/usr/bin/env bash
# Explicit installation only: hosts never install from a hook or MCP handshake.
set -euo pipefail
version="${1:?Usage: install-runtime.sh <exact runtime version>}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]] || { echo 'An exact version is required' >&2; exit 2; }
npm install --global "@reddb-io/red-skills@$version" "@reddb-io/red-skills-dev@$version" "@reddb-io/red-skills-memory@$version" "@reddb-io/red-skills-brain@$version" "@reddb-io/red-skills-internal@$version"
for cmd in red-skills-hook red-skills-resource red-skills-redskilled-mcp red-skills-memory red-skills-brain; do
  command -v "$cmd" >/dev/null || { echo "Missing installed command: $cmd; check the npm global bin directory in PATH" >&2; exit 1; }
done
red-skills-redskilled --version
