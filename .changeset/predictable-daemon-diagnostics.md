---
"@reddb-io/redskilled": patch
---

Persist private daemon, web, remote-link and relay diagnostics in the OS-standard log directory with 10 MiB rotation and five files per stream. Add offline `redskilled logs --path`/`--open` commands and an Open log tray action. Keep structured recovery and Worker log lanes unchanged.
