'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.copyFileSync(path.join(root, 'node_modules/i18next/dist/umd/i18next.min.js'), path.join(root, 'src/renderer/vendor/i18next.min.js'));
