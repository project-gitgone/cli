# Contributing

Thanks for helping with the GitGone CLI.

## Setup

Node 22 or newer and pnpm (`corepack enable`).

```bash
pnpm install
pnpm test
pnpm build && node dist/index.js --help
```

Point it at a local server with `gitgone config set serverUrl http://localhost:3333`.

## Before opening a pull request

```bash
pnpm typecheck
pnpm test
pnpm build
```

CI runs the same commands, plus CodeQL, Gitleaks, Plumber, actionlint and typos.

## Changesets

A change that ships to users needs a changeset: run `pnpm changeset`, pick the bump (patch, minor, major) and
describe the change for the CHANGELOG. Docs, tests and refactors without user impact do not need one.

On every push to `main`, the Release workflow opens or updates a **chore: version packages** pull request that
bumps the version and the CHANGELOG. Merging it publishes `@project-gitgone/cli` to npm.

## Conventions

- TypeScript strict, no comments in the code.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
- `main` is protected: every change goes through a pull request with a green CI.

## Code of Conduct

This project follows the [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.
