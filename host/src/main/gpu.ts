// Windows per-app GPU preference (Settings > System > Display > Graphics).
// On laptops with two GPUs, forcing this app onto the high-performance GPU
// can stop screen capture ("Could not start video source"), because the
// screen is drawn by the other GPU.

import { execFile } from 'node:child_process';

const KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';

export type GpuPref = 'unset' | 'auto' | 'saving' | 'high' | 'unknown';

function reg(args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile('reg', args, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, out: String(stdout) }));
  });
}

export async function readGpuPref(): Promise<GpuPref> {
  if (process.platform !== 'win32') return 'unknown';
  const res = await reg(['query', KEY, '/v', process.execPath]);
  if (!res.ok) return 'unset';
  const m = /GpuPreference=(\d)/.exec(res.out);
  if (!m) return 'unset';
  return m[1] === '2' ? 'high' : m[1] === '1' ? 'saving' : 'auto';
}

/** Point this app at the power-saving GPU (the one that usually draws the screen on laptops). */
export async function setPowerSavingGpu(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  const res = await reg(['add', KEY, '/v', process.execPath, '/t', 'REG_SZ', '/d', 'GpuPreference=1;', '/f']);
  return res.ok;
}
