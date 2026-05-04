# Public Release Readiness Contract

## Scope

Backend API query behavior and repository process constraints required before publishing this repository publicly.

## Contract

1. Token search queries must be case-insensitive and compatible with MySQL (`mysql2`).
2. Watched-token stale-check filters must keep pooled quote constraints grouped with stale/unchecked conditions.
3. Query priority ordering expressions must use SQL identifier-safe syntax for the active database.
4. Behavior changes must include automated checks under `src/tests/unit/`.
5. Release changes must not include committed environment secrets.
6. State-changing management routes must be POST-only and require manager authentication (`MANAGER_API_KEY`).
7. Deployment-specific external URLs must be environment configured, not hardcoded to private hosts.
8. Public GitHub releases must be generated from a clean snapshot, not private Git history.
9. Public release snapshots must exclude `.git`, `.env`, `.env.*`, IDE files, `node_modules`, generated logs, `data/`, `archive/`, `research/`, `PM/`, and `todo.md`.
10. Public release metadata must include `LICENSE`, package name, package description, and public package license.
11. `.env.release.local` stores local publish settings and must never be committed.
12. `npm run release:public:publish` must support `PUBLIC_RELEASE_VERSION=auto` by incrementing the latest GitHub release patch version.
13. Repeated public releases update the public snapshot repository from the generated export, not from private source history.
14. Successful one-command public releases must write a private PM bookkeeping note with the public repository, public version, source branch, source commit, export directory, and source worktree status.

## Verification

- Run `npm test`.
- Run `npm run format:check`.
- Run `npm run lint`.
- Run `npm run check:public`.
- Run `npm run release:public:prepare -- --out /tmp/bots-public --version 1.0.0 --force`.
- Confirm tracked files do not contain environment secrets intended for private deployment.

## Runbook

The human-facing public release procedure lives in `PUBLIC_RELEASE.md`.
