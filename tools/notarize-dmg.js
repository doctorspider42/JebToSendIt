'use strict';
// electron-builder notarizes/staples the app; notarize the signed DMG separately.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
function run(cmd, args, capture = false) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) {
    // Never include command arguments: notarytool receives a private credential.
    if (capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${cmd} failed (exit ${result.status}). Inspect the Apple submission before retrying.`);
  }
  return result.stdout;
}
// Kolejność: profil z lokalnego Pęku kluczy → klucz App Store Connect API (CI) → Apple ID + hasło do aplikacji.
const env = process.env;
const credentials = env.APPLE_KEYCHAIN_PROFILE
  ? ['--keychain-profile', env.APPLE_KEYCHAIN_PROFILE, ...(env.APPLE_KEYCHAIN ? ['--keychain', env.APPLE_KEYCHAIN] : [])]
  : env.APPLE_API_KEY
    ? ['--key', env.APPLE_API_KEY, '--key-id', env.APPLE_API_KEY_ID, '--issuer', env.APPLE_API_ISSUER]
    : ['--apple-id', env.APPLE_ID, '--password', env.APPLE_APP_SPECIFIC_PASSWORD, '--team-id', env.APPLE_TEAM_ID];
if (credentials.some(v => !v)) throw new Error('Missing Apple notarization credentials.');
const files = fs.readdirSync('dist').filter(f => f.endsWith('.dmg'));
if (!files.length) throw new Error('No DMG to notarize.');
for (const name of files) {
  const file = path.resolve('dist', name);
  run('codesign', ['--verify', '--strict', file]);
  const submission = JSON.parse(run('xcrun', ['notarytool', 'submit', file, ...credentials, '--wait', '--timeout', '30m', '--output-format', 'json'], true));
  fs.writeFileSync(`${file}.notarization.json`, JSON.stringify(submission, null, 2));
  if (submission.status !== 'Accepted') throw new Error(`Apple status: ${submission.status}; submission ${submission.id}`);
  run('xcrun', ['stapler', 'staple', file]);
  run('xcrun', ['stapler', 'validate', file]);
  run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', file]);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jeb-dmg-'));
  const mount = path.join(temp, 'volume');
  fs.mkdirSync(mount);
  let mounted = false;
  try {
    run('hdiutil', ['attach', file, '-readonly', '-nobrowse', '-mountpoint', mount]);
    mounted = true;
    const app = path.join(mount, 'JebToSendIt.app');
    run('codesign', ['--verify', '--deep', '--strict', app]);
    run('xcrun', ['stapler', 'validate', app]);
    const copy = path.join(temp, 'JebToSendIt.app');
    run('ditto', [app, copy]);
    run('xattr', ['-w', 'com.apple.quarantine', `0083;${Math.floor(Date.now() / 1000).toString(16)};JebToSendItCI;`, copy]);
    run('syspolicy_check', ['distribution', copy]);
  } finally {
    if (mounted) run('hdiutil', ['detach', mount]);
    fs.rmSync(temp, { recursive: true, force: true });
  }
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  fs.writeFileSync(`${file}.sha256`, `${digest}  ${name}\n`);
}
