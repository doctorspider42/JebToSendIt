'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
function check(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) check(file);
    else if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
}
for (const dir of ['src', 'tools', 'tests']) check(dir);
const vendor = fs.readFileSync('src/renderer/vendor/i18next.min.js');
if (!vendor.equals(fs.readFileSync('node_modules/i18next/dist/umd/i18next.min.js'))) throw new Error('Run npm run vendor');
