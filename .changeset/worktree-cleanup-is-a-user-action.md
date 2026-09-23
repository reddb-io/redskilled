---
"@reddb-io/redskilled": minor
---

RedSkilled no longer removes a Project's git worktrees on its own; redcode owns worktree lifecycle. Boot now only reports a broken worktree and keeps any dead attempt directory that holds a worktree, its git port no longer prunes, and the new `plugins.dev.afk.worktrees.auto_clean` setting (default `false`) is the only way back to unattended removal. The web Projects view gains **Clean worktrees space**: it shows how much disk the Project's linked worktrees use and opens a confirmation list grouped as merged or clean, stale, dirty (unselected, each needs its own discard confirmation) and in use (never removable), then removes only what you confirmed and reports the space freed. The daemon serves it through the new `_redskills/worktree_space` and `_redskills/worktree_clean` methods, admitted to the web allowlist as `worktree_space` and `worktree_clean`. `.red/worktrees/` is now a recognised lane for the worktree and `.red` taxonomy doctors.
