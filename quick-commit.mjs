#!/usr/bin/env node
// quick-commit.mjs
// Usage: node quick-commit.mjs "your commit message"
// Auto-stages all changes and pushes to origin/main.

import { execSync } from 'child_process';

const msg = process.argv[2];
if (!msg) { console.error('Usage: node quick-commit.mjs "message"'); process.exit(1); }

try {
  execSync('git add .', { stdio: 'inherit' });
  execSync(`git commit -m "${msg}"`, { stdio: 'inherit' });
  execSync('git push origin main', { stdio: 'inherit' });
  console.log('\n✅ Pushed to GitHub successfully.');
} catch (e) {
  console.error('Push failed:', e.message);
  process.exit(1);
}
