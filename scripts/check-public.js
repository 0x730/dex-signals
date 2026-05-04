const { spawnSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const { join, resolve } = require('path');

const ROOT = resolve(__dirname, '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !result.stdout) {
    throw new Error(result.stderr || `${command} ${args.join(' ')} failed`);
  }

  return result.stdout || '';
}

function gitLsFiles() {
  return run('git', ['ls-files', '--cached', '--others', '--exclude-standard'])
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

function hasLicenseFile(files) {
  return files.some((file) => /^licen[cs]e(?:\.|$)/i.test(file));
}

function validateMetadata(files, failures) {
  if (!hasLicenseFile(files)) {
    failures.push('missing public LICENSE file');
  }

  const packagePath = join(ROOT, 'package.json');
  if (!existsSync(packagePath)) return;

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

function validatePlaceholders(files, failures) {
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
}

function validateFiles(files, failures) {
  for (const file of files) {
    if (
      /^\.env(?:\.|$)/.test(file) &&
      !['.env.example', '.env.release.example'].includes(file)
    ) {
      failures.push(`tracked environment file: ${file}`);
    }

    if (file.startsWith('.idea/') || file.endsWith('.iml')) {
      failures.push(`tracked IDE file: ${file}`);
    }

    if (
      file.startsWith('archive/') ||
      file.startsWith('PM/') ||
      file.startsWith('research/') ||
      file.startsWith('logs/') ||
      file.startsWith('data/')
    ) {
      failures.push(`private/internal file would be exported: ${file}`);
    }

    if (file.startsWith('src/') && file.endsWith('.js')) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      if (/app\.listen\(\s*PORT\s*,\s*\(/.test(source)) {
        failures.push(`service binds without explicit host: ${file}`);
      }
    }
  }
}

function main() {
  const rules = loadPublicIgnore();
  const files = gitLsFiles().filter((file) => isPublicFile(file, rules));
  const failures = [];

  validateFiles(files, failures);
  validateMetadata(files, failures);
  validatePlaceholders(files, failures);

  if (failures.length > 0) {
    console.error('Public repository check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Public repository check passed.');
}

main();
