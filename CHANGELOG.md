# @project-gitgone/cli

## 26.11.0

### Minor Changes

- [`2c2c368`](https://github.com/project-gitgone/cli/commit/2c2c36813f749c7d80ba755fdb177eb0b44769ff) Thanks [@Asuniia](https://github.com/Asuniia)! - `gitgone login` now handles every first connection: on a GitGone Cloud instance it signs in with the cloud account, on a new self-hosted server it creates the first administrator, otherwise it asks for the email and password. It replaces `gitgone admin setup`.

### Patch Changes

- [#4](https://github.com/project-gitgone/cli/pull/4) [`3f043b0`](https://github.com/project-gitgone/cli/commit/3f043b0835a782603578fca98aa4cbb7b906bff9) Thanks [@Asuniia](https://github.com/Asuniia)! - BREAKING: the CLI was redesigned and several commands were renamed (for example `keys` is now `key`, `passwd` is now `account password`, `admin users create` is now `user invite`). Typing an old name prints the new one. See the migration page of the documentation: https://docs.gitgone.org/docs/cli/migration.
  
  - `gitgone` alone opens a guided menu that signs you in, links the folder and offers the everyday actions.
  - The GitGone logo in color, then a grouped help with examples for every command and suggestions for mistyped commands.
  - Every command accepts `--json`, `--yes`, `--server` and `--no-color`, and never waits for an answer without a terminal.
  - `push` and `pull` show the variables that change (names only) and ask before applying.
  - New `status`, `whoami`, `logout`, `project info` and `team list` commands; `init` now also links existing projects and saves a default environment.
  - `pull` and `run` read the environment of a token when `GITGONE_TOKEN` is set, without login, linked folder or password, so pipelines can use the CLI. Only a verifier derived from the token is sent to the server.
  - Your vault is unlocked once, then remembered in the system keychain (macOS Keychain, Windows Credential Manager, Secret Service on Linux): no more password for every command. `gitgone logout` forgets it, `gitgone config set keychain off` turns it off. Without a keychain, the password is asked as before.
