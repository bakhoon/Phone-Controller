import { networkInterfaces } from 'node:os';

const VIRTUAL = /(vethernet|virtualbox|vmware|hyper-v|wsl|docker|loopback|tailscale|zerotier|hamachi)/i;

function isPrivate(ip: string): boolean {
  if (ip.startsWith('192.168.') || ip.startsWith('10.')) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  return !!m && Number(m[1]) >= 16 && Number(m[1]) <= 31;
}

/** LAN IPv4 addresses of this PC, the most likely Wi‑Fi/Ethernet one first. */
export function lanAddresses(): string[] {
  const found: { ip: string; score: number }[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      let score = 0;
      if (isPrivate(a.address)) score += 2;
      if (a.address.startsWith('192.168.')) score += 1;
      if (/wi-?fi|wlan|ethernet|이더넷/i.test(name)) score += 2;
      if (VIRTUAL.test(name)) score -= 5;
      found.push({ ip: a.address, score });
    }
  }
  return found.sort((a, b) => b.score - a.score).map((f) => f.ip);
}
