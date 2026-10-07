---
"@project-gitgone/cli": minor
---

`gitgone login` now handles every first connection: on a GitGone Cloud instance it signs in with the cloud account, on a new self-hosted server it creates the first administrator, otherwise it asks for the email and password. `gitgone admin setup` is deprecated and now only sets the server URL before running `gitgone login`.
