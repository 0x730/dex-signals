# Public Release Runbook

This repository is developed privately. Public GitHub releases must be made
from a generated snapshot, not from the private Git history.

## Preconditions

- Rotate any secret that was ever committed to the private repository.
- Confirm `LICENSE`, `package.json` name, description, and license are correct.
- Review `README.md`, `spec/`, and generated release contents for private context.
- Either install/authenticate GitHub CLI (`gh`) or set `GITHUB_TOKEN` in
  `.env.release.local`.

## Prepare Snapshot

```bash
npm run release:public:prepare -- \
  --out /tmp/bots-public \
  --version 1.0.0 \
  --github-repo OWNER/REPO \
  --force
```

The command runs `npm test`, `npm run format:check`, `npm run lint`, and
`npm run check:public` before exporting. It then creates a clean output
directory, copies only public files, patches `package.json` to the requested
version, initializes a new Git repository, and prints the exact GitHub follow-up
commands.

## Publish

Run the printed commands from the snapshot directory when you want a manual
publish path:

```bash
cd /tmp/bots-public
git add .
git commit -m "Release 1.0.0"
gh repo create OWNER/REPO --public --source . --remote origin --push
git tag v1.0.0
git push origin v1.0.0
gh release create v1.0.0 --repo OWNER/REPO --generate-notes
```

## One-Command Publish

Create a local release env file:

```bash
cp .env.release.example .env.release.local
```

Set `PUBLIC_GITHUB_REPO=OWNER/REPO`. Leave `PUBLIC_RELEASE_VERSION=auto` to
read the latest GitHub release tag and increment the patch version, or set an
explicit version.

If GitHub CLI is not installed or authenticated, set `GITHUB_TOKEN` in
`.env.release.local`. The token needs permission to create/update the target
repository and create releases.

Then publish:

```bash
npm run release:public:publish
```

The script prepares the snapshot, commits it, creates the GitHub repo when it
does not exist, or force-updates `main` when it already exists. It then tags
`v<version>` and creates the GitHub release. `.env.release.local` is gitignored
and must stay private.

After a successful publish, the script writes a private bookkeeping note under
`PM/notes/` with the public repository, version, export directory, source
branch, source commit, and source worktree status. Commit that note in the
private repository with the release tooling changes when you want private source
traceability.

## Public Snapshot Rules

- `.env.example` is the only environment file allowed.
- `.git`, private Git history, IDE files, `node_modules`, generated logs,
  `data/`, `archive/`, `research/`, `PM/`, and `todo.md` are excluded.
- Public metadata must be present before export.
- Publication checks are machine-enforced by `npm run check:public`.

## Historical Secret Risk

Deleting a secret from the current tree does not remove it from private Git
history. Rotate exposed keys before publishing any snapshot.
