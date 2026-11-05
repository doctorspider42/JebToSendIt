'use strict';
const { spawnSync } = require('node:child_process');

// Retry interrupted ticket delivery, never an interrupted notary submission.
function runApple(cmd, args, capture = false) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (!capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    if (result.status === 0) return result.stdout;
    const submitting = cmd === 'xcrun' && args[0] === 'notarytool';
    const ticketCommand = (cmd === 'xcrun' && args[0] === 'stapler') || cmd === 'spctl';
    const transportFailure = (ticketCommand && /NSURLErrorDomain Code=-(?:1001|1005|1009)|The network connection was lost/.test(output))
      || /The (?:staple and validate|validate) action failed! Error 68|Failed to staple your application with code: 68/.test(output);
    if (!submitting && transportFailure && attempt < 4) {
      process.stderr.write(`Apple ticket delivery interrupted; retry ${attempt}/3 in ${attempt * 10}s.\n`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 10_000);
      continue;
    }
    if (capture && result.stderr) process.stderr.write(result.stderr);
    // Do not include arguments: notarytool may receive private credentials.
    throw new Error(`${cmd} failed (exit ${result.status}). Inspect the Apple submission before retrying.`);
  }
}

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) throw new Error('A command is required.');
  runApple(cmd, args);
}

module.exports = { runApple };
