// Usage: node scripts/run-as-admin.mjs <npm script>
// Windows: opens an elevated PowerShell window in the repo root and runs `npm run <script>`.
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = process.argv[2] ?? 'dev';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (process.platform !== 'win32') {
  spawnSync('npm', ['run', script], { cwd: root, stdio: 'inherit' });
  process.exit(0);
}

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const inner = `Set-Location -LiteralPath ${q(root)}; npm run ${script}`;
const cmd = `Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList ${q(`-NoExit -Command "${inner}"`)}`;
try {
  execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { stdio: 'inherit' });
  console.log('관리자 권한 PowerShell 창에서 실행 중이에요.');
} catch {
  console.error('관리자 권한 요청이 취소됐어요.');
  process.exit(1);
}
