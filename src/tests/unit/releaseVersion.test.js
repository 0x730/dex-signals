const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseVersion,
  incrementPatch,
  githubRemoteUrl,
  authenticatedGithubRemoteUrl,
  shouldUseGithubCli,
  mergeReleaseEnv,
  renderReleaseBookkeepingNote,
} = require('../../../scripts/publish-public-release');

test('parseVersion accepts semver tags with optional v prefix', () => {
  assert.deepEqual(parseVersion('v1.2.3'), {
    major: 1,
    minor: 2,
    patch: 3,
  });
  assert.deepEqual(parseVersion('1.2.3'), {
    major: 1,
    minor: 2,
    patch: 3,
  });
});

test('parseVersion rejects non-semver tags', () => {
  assert.equal(parseVersion('release-1'), null);
  assert.equal(parseVersion('1.2'), null);
});

test('incrementPatch increments only patch version', () => {
  assert.equal(incrementPatch({ major: 1, minor: 2, patch: 3 }), '1.2.4');
});

test('githubRemoteUrl builds an HTTPS GitHub remote URL', () => {
  assert.equal(
    githubRemoteUrl('OWNER/REPO'),
    'https://github.com/OWNER/REPO.git'
  );
});

test('authenticatedGithubRemoteUrl embeds token only when provided', () => {
  assert.equal(
    authenticatedGithubRemoteUrl('OWNER/REPO', ''),
    'https://github.com/OWNER/REPO.git'
  );
  assert.equal(
    authenticatedGithubRemoteUrl('OWNER/REPO', 'token value'),
    'https://x-access-token:token%20value@github.com/OWNER/REPO.git'
  );
});

test('shouldUseGithubCli is false when token auth is configured', () => {
  assert.equal(shouldUseGithubCli({ GITHUB_TOKEN: 'token' }), false);
  assert.equal(shouldUseGithubCli({ GH_TOKEN: 'token' }), false);
});

test('mergeReleaseEnv lets .env.release.local override shell env', () => {
  assert.deepEqual(
    mergeReleaseEnv(
      { GITHUB_TOKEN: 'local-token', PUBLIC_GITHUB_REPO: '0x730/repo' },
      { GITHUB_TOKEN: 'shell-token', PUBLIC_GITHUB_REPO: 'old/repo' }
    ),
    { GITHUB_TOKEN: 'local-token', PUBLIC_GITHUB_REPO: '0x730/repo' }
  );
});

test('renderReleaseBookkeepingNote records public release traceability', () => {
  const note = renderReleaseBookkeepingNote({
    githubRepo: '0x730/dex-signals',
    version: '1.2.3',
    outDir: '/tmp/bots-public',
    sourceBranch: 'dev',
    sourceCommit: 'abc123',
    sourceStatus: ' M readme.md',
    createdAt: '2026-05-04T12:00:00.000Z',
  });

  assert.match(note, /https:\/\/github\.com\/0x730\/dex-signals/);
  assert.match(note, /Version: v1\.2\.3/);
  assert.match(note, /Branch: dev/);
  assert.match(note, /Commit: abc123/);
  assert.match(note, /M readme\.md/);
});
