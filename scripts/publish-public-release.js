const { existsSync, readFileSync } = require('fs');
const { join, resolve } = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const ROOT = resolve(__dirname, '..');
const RELEASE_ENV_FILE = join(ROOT, '.env.release.local');

function loadReleaseEnv() {
  if (!existsSync(RELEASE_ENV_FILE)) {
    throw new Error(
      'Missing .env.release.local. Copy .env.release.example and fill release values.'
    );
  }

  const parsed = dotenv.parse(readFileSync(RELEASE_ENV_FILE));
  return mergeReleaseEnv(parsed);
}

function mergeReleaseEnv(parsed, baseEnv = process.env) {
  return {
    ...baseEnv,
    ...parsed,
  };
}

function booleanValue(value) {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').toLowerCase());
}

function required(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required release value: ${key}`);
  }
  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
    env: options.env || process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    env: options.env || process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.allowFailure) return '';
    throw new Error(`${command} ${args.join(' ')} failed`);
  }

  return result.stdout.trim();
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    stdio: 'ignore',
  });
  return !result.error && result.status === 0;
}

function shouldUseGithubCli(publishEnv) {
  return (
    commandExists('gh') && !publishEnv.GITHUB_TOKEN && !publishEnv.GH_TOKEN
  );
}

function githubRequestSync(method, path, token, body) {
  const script = `
const https = require('https');
const method = ${JSON.stringify(method)};
const path = ${JSON.stringify(path)};
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const body = ${JSON.stringify(body || null)};
if (!token) {
  console.error('GITHUB_TOKEN is required when GitHub CLI is not available.');
  process.exit(2);
}
const payload = body ? JSON.stringify(body) : null;
const req = https.request({
  hostname: 'api.github.com',
  path,
  method,
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token,
    'User-Agent': 'bots-signals-release',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(payload ? {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    } : {}),
  },
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      process.stdout.write(data || '{}');
      return;
    }
    if (res.statusCode === 404) {
      process.exit(4);
      return;
    }
    console.error(data);
    process.exit(1);
  });
});
req.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
if (payload) req.write(payload);
req.end();
`;

  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_TOKEN: token,
      GH_TOKEN: token,
    },
  });

  if (result.status === 4) return null;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `GitHub API ${method} ${path} failed`);
  }

  return result.stdout ? JSON.parse(result.stdout) : {};
}

function parseVersion(value) {
  const match = String(value || '')
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function incrementPatch(version) {
  return `${version.major}.${version.minor}.${version.patch + 1}`;
}

function resolveVersion(env, githubRepo, publishEnv, token) {
  const configured = env.PUBLIC_RELEASE_VERSION;
  if (configured && configured !== 'auto') {
    return configured.replace(/^v/, '');
  }

  let latestTag = '';
  if (shouldUseGithubCli(publishEnv)) {
    latestTag = capture(
      'gh',
      [
        'release',
        'view',
        '--repo',
        githubRepo,
        '--json',
        'tagName',
        '--jq',
        '.tagName',
      ],
      { env: publishEnv, allowFailure: true }
    );
  } else {
    const release = githubRequestSync(
      'GET',
      `/repos/${githubRepo}/releases/latest`,
      token
    );
    latestTag = release?.tag_name || '';
  }

  const parsed = parseVersion(latestTag);
  if (!parsed) {
    return '1.0.0';
  }

  return incrementPatch(parsed);
}

function repoExists(githubRepo, publishEnv, token) {
  if (shouldUseGithubCli(publishEnv)) {
    const result = capture('gh', ['repo', 'view', githubRepo], {
      env: publishEnv,
      allowFailure: true,
    });
    return Boolean(result);
  }

  return Boolean(githubRequestSync('GET', `/repos/${githubRepo}`, token));
}

function githubRemoteUrl(githubRepo) {
  return `https://github.com/${githubRepo}.git`;
}

function authenticatedGithubRemoteUrl(githubRepo, token) {
  if (!token) return githubRemoteUrl(githubRepo);
  return `https://x-access-token:${encodeURIComponent(
    token
  )}@github.com/${githubRepo}.git`;
}

function createGithubRepo(githubRepo, publishEnv, token) {
  const [owner, repo] = githubRepo.split('/');
  const user = githubRequestSync('GET', '/user', token);
  const path = owner === user.login ? '/user/repos' : `/orgs/${owner}/repos`;
  githubRequestSync('POST', path, token, {
    name: repo,
    private: false,
  });
}

function publishRepository(outDir, githubRepo, publishEnv, token) {
  if (!repoExists(githubRepo, publishEnv, token)) {
    if (shouldUseGithubCli(publishEnv)) {
      run(
        'gh',
        [
          'repo',
          'create',
          githubRepo,
          '--public',
          '--source',
          '.',
          '--remote',
          'origin',
          '--push',
        ],
        { cwd: outDir, env: publishEnv }
      );
      return;
    }

    createGithubRepo(githubRepo, publishEnv, token);
  }

  run(
    'git',
    [
      'remote',
      'add',
      'origin',
      authenticatedGithubRemoteUrl(githubRepo, token),
    ],
    {
      cwd: outDir,
      env: publishEnv,
    }
  );
  run('git', ['push', '--force', 'origin', 'main'], {
    cwd: outDir,
    env: publishEnv,
  });
}

function createGithubRelease(githubRepo, version, publishEnv, token) {
  if (shouldUseGithubCli(publishEnv)) {
    run(
      'gh',
      [
        'release',
        'create',
        `v${version}`,
        '--repo',
        githubRepo,
        '--generate-notes',
      ],
      { cwd: ROOT, env: publishEnv }
    );
    return;
  }

  githubRequestSync('POST', `/repos/${githubRepo}/releases`, token, {
    tag_name: `v${version}`,
    name: `v${version}`,
    generate_release_notes: true,
  });
}

function main() {
  const env = loadReleaseEnv();
  const outDir = resolve(env.PUBLIC_RELEASE_OUT || '/tmp/bots-public-release');
  const githubRepo = required(env, 'PUBLIC_GITHUB_REPO');

  const publishEnv = {
    ...process.env,
    ...env,
  };

  if (env.GITHUB_TOKEN) {
    publishEnv.GH_TOKEN = env.GITHUB_TOKEN;
    publishEnv.GITHUB_TOKEN = env.GITHUB_TOKEN;
  }

  const token = publishEnv.GITHUB_TOKEN || publishEnv.GH_TOKEN;
  if (!shouldUseGithubCli(publishEnv) && !token) {
    throw new Error(
      'GITHUB_TOKEN is required in .env.release.local when gh is unavailable or token mode is selected.'
    );
  }
  const version = resolveVersion(env, githubRepo, publishEnv, token);

  const prepareArgs = [
    'scripts/prepare-public-release.js',
    '--out',
    outDir,
    '--version',
    version,
    '--github-repo',
    githubRepo,
  ];

  if (booleanValue(env.PUBLIC_RELEASE_FORCE)) {
    prepareArgs.push('--force');
  }

  run('node', prepareArgs, { env: publishEnv });
  run('git', ['add', '.'], { cwd: outDir, env: publishEnv });
  run('git', ['commit', '-m', `Release ${version}`], {
    cwd: outDir,
    env: publishEnv,
  });
  publishRepository(outDir, githubRepo, publishEnv, token);
  run('git', ['tag', `v${version}`], { cwd: outDir, env: publishEnv });
  run('git', ['push', 'origin', `v${version}`], {
    cwd: outDir,
    env: publishEnv,
  });
  run('git', ['remote', 'set-url', 'origin', githubRemoteUrl(githubRepo)], {
    cwd: outDir,
    env: publishEnv,
  });
  createGithubRelease(githubRepo, version, publishEnv, token);

  console.log(`Published ${githubRepo} release v${version} from ${outDir}`);
}

try {
  if (require.main === module) {
    main();
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

module.exports = {
  parseVersion,
  incrementPatch,
  githubRemoteUrl,
  authenticatedGithubRemoteUrl,
  shouldUseGithubCli,
  mergeReleaseEnv,
};
