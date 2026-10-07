---
"@project-gitgone/cli": patch
---

New `gitgone log` command: the history of every environment of the project as a graph, like `git log --graph`, with the names of the keys added, changed or removed by each version (never their values), rollbacks and key rotations. Supports `-e`, `--limit` and `--json`. Requires a server with the timeline endpoint.
