const {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('fs');
const { dirname, join, resolve } = require('path');
const { spawnSync } = require('child_process');

const ROOT = resolve(__dirname, '..');
const DEFAULT_OUT = '/tmp/bots-public-release';

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    force: false,
    skipVerify: false,
    githubRepo: '',
    version: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') args.out = argv[++index];
    else if (arg === '--force') args.force = true;
    else if (arg === '--skip-verify') args.skipVerify = true;
    else if (arg === '--github-repo') args.githubRepo = argv[++index];
    else if (arg === '--version') args.version = argv[++index];
    else if (arg === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run release:public:prepare -- --out /tmp/bots-public --version 1.0.0 --github-repo OWNER/REPO --force

Options:
  --out DIR              Export directory. Default: ${DEFAULT_OUT}
  --version VERSION      Version used for package.json and printed tag/release commands.
  --github-repo OWNER/REPO
                         Repository used in printed gh commands.
  --force                Remove the output directory first when it exists.
  --skip-verify          Skip npm test, npm run lint, and npm run check:public.
`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }

  return result.stdout || '';
}

function trackedAndUntrackedFiles() {
  return run(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { capture: true }
  )
    .split('\n')
    .filter(Boolean)
    .filter((file) => existsSync(join(ROOT, file)));
}

function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
}

function loadPublicIgnore() {
  const ignorePath = join(ROOT, '.publicignore');
  if (!existsSync(ignorePath)) return [];

  return readFileSync(ignorePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => ({
      negate: line.startsWith('!'),
      pattern: line.startsWith('!') ? line.slice(1) : line,
    }));
}

function matchesPattern(file, pattern) {
  if (pattern.endsWith('/')) {
    return file.startsWith(pattern);
  }
  if (pattern.includes('*')) {
    return wildcardToRegExp(pattern).test(file);
  }
  return file === pattern || file.startsWith(`${pattern}/`);
}

function isPublicFile(file, rules) {
  let included = true;
  for (const rule of rules) {
    if (matchesPattern(file, rule.pattern)) {
      included = rule.negate;
    }
  }
  return included;
}

function assertNoSensitiveExport(files) {
  const failures = [];

  for (const file of files) {
    if (
      /^\.env(?:\.|$)/.test(file) &&
      !['.env.example', '.env.release.example'].includes(file)
    ) {
      failures.push(`environment file would be exported: ${file}`);
    }
    if (file.startsWith('.git/') || file === '.git') {
      failures.push(`git metadata would be exported: ${file}`);
    }
    if (file.startsWith('.idea/') || file.endsWith('.iml')) {
      failures.push(`IDE file would be exported: ${file}`);
    }
    if (
      file === 'todo.md' ||
      file.startsWith('PM/') ||
      file.startsWith('archive/') ||
      file.startsWith('research/') ||
      file.startsWith('logs/') ||
      file.startsWith('data/')
    ) {
      failures.push(`private/internal file would be exported: ${file}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Public export blocked:\n- ${failures.join('\n- ')}`);
  }
}

function assertPublicReleaseMetadata(files) {
  const failures = [];
  const hasLicenseFile = files.some((file) =>
    /^licen[cs]e(?:\.|$)/i.test(file)
  );

  if (!hasLicenseFile) {
    failures.push('missing public LICENSE file');
  }

  const packagePath = join(ROOT, 'package.json');
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (!pkg.name || pkg.name === 'bots') {
      failures.push('package.json name is missing or generic');
    }
    if (!pkg.description) {
      failures.push('package.json description is missing');
    }
    if (!pkg.license || pkg.license === 'UNLICENSED') {
      failures.push('package.json license is missing or not public');
    }
  }

  const placeholderPatterns = [
    /support@yourdomain\.com/i,
    /discord\.gg\/yourdiscord/i,
    /t\.me\/yourtelegram/i,
  ];

  for (const file of files) {
    if (!file.endsWith('.md') || !existsSync(join(ROOT, file))) continue;
    const source = readFileSync(join(ROOT, file), 'utf8');
    if (placeholderPatterns.some((pattern) => pattern.test(source))) {
      failures.push(
        `placeholder public support/contact link remains in ${file}`
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Public release metadata check failed:\n- ${failures.join('\n- ')}`
    );
  }
}

function copyFileOrDirectory(file, outDir) {
  const source = join(ROOT, file);
  const target = join(outDir, file);
  mkdirSync(dirname(target), { recursive: true });

  if (statSync(source).isDirectory()) {
    cpSync(source, target, { recursive: true });
  } else {
    copyFileSync(source, target);
  }
}

function patchPackageVersion(outDir, version) {
  if (!version) return;

  const packagePath = join(outDir, 'package.json');
  if (!existsSync(packagePath)) return;

  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  pkg.version = version;
  writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function initGit(outDir) {
  run('git', ['init', '-b', 'main'], { cwd: outDir });
}

function printNextCommands({ outDir, githubRepo, version }) {
  console.log('\nPublic release snapshot prepared.');
  console.log(`Export directory: ${outDir}`);
  console.log('\nNext commands:');
  console.log(`cd ${outDir}`);
  console.log('git add .');
  console.log(`git commit -m "Release ${version || '<version>'}"`);
  console.log(
    `gh repo create ${githubRepo || 'OWNER/REPO'} --public --source . --remote origin --push`
  );
  console.log(`git tag v${version || '<version>'}`);
  console.log(`git push origin v${version || '<version>'}`);
  console.log(
    `gh release create v${version || '<version>'} --repo ${
      githubRepo || 'OWNER/REPO'
    } --generate-notes`
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const outDir = resolve(args.out);
  if (existsSync(outDir)) {
    if (!args.force) {
      throw new Error(
        `Output directory exists. Re-run with --force: ${outDir}`
      );
    }
    rmSync(outDir, { recursive: true, force: true });
  }

  if (!args.skipVerify) {
    run('npm', ['test']);
    run('npm', ['run', 'format:check']);
    run('npm', ['run', 'lint']);
    run('npm', ['run', 'check:public']);
  }

  const rules = loadPublicIgnore();
  const files = trackedAndUntrackedFiles().filter((file) =>
    isPublicFile(file, rules)
  );

  assertPublicReleaseMetadata(files);
  assertNoSensitiveExport(files);

  mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    copyFileOrDirectory(file, outDir);
  }

  patchPackageVersion(outDir, args.version);
  initGit(outDir);
  printNextCommands({
    outDir,
    githubRepo: args.githubRepo,
    version: args.version,
  });
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
