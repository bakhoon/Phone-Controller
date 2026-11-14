// Opens the server port in Windows Firewall so the phone can connect.
// Only devices on the same local subnet are allowed. Needs admin rights.

import { execFile } from 'node:child_process';

const RULE_NAME = 'Phone Controller';

function netsh(args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile('netsh', args, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, out: String(stdout) }));
  });
}

/** Replace any old rule with one for the current port. Returns true on success. */
export async function ensureFirewallRule(port: number): Promise<boolean> {
  if (process.platform !== 'win32') return true;
  await netsh(['advfirewall', 'firewall', 'delete', 'rule', `name=${RULE_NAME}`]);
  const res = await netsh([
    'advfirewall',
    'firewall',
    'add',
    'rule',
    `name=${RULE_NAME}`,
    'dir=in',
    'action=allow',
    'protocol=TCP',
    `localport=${port}`,
    'remoteip=localsubnet',
    'profile=any'
  ]);
  if (!res.ok) console.warn('[firewall] could not add rule:', res.out);
  return res.ok;
}
