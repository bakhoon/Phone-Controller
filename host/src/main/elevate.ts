// Restart the app with administrator rights (Windows UAC prompt).

import { app } from 'electron';
import { execFile } from 'node:child_process';
import { join } from 'node:path';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`; // PowerShell single-quoted string

function runPowerShell(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true }, (err) => resolve(!err));
  });
}

/**
 * Launch an elevated copy and return true if the user accepted the UAC prompt.
 * In dev (`npm run dev`) the dev server env can't be passed through UAC, so we
 * re-run `npm run dev` from the repo root in an elevated PowerShell window instead.
 */
export async function relaunchAsAdmin(): Promise<boolean> {
  if (process.platform !== 'win32') return false;

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    const repoRoot = join(app.getAppPath(), '..');
    const inner = `Set-Location -LiteralPath ${q(repoRoot)}; npm.cmd run dev`;
    return runPowerShell(
      `Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList ${q(`-NoExit -ExecutionPolicy Bypass -Command "${inner.replace(/"/g, '\\"')}"`)}`
    );
  }

  const args = process.argv.slice(1).map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ');
  const argPart = args ? ` -ArgumentList ${q(args)}` : '';
  return runPowerShell(`Start-Process -FilePath ${q(process.execPath)} -Verb RunAs${argPart}`);
}
