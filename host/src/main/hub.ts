// One place that decides which phone is in control, no matter how it connected:
// directly on the same Wi‑Fi (local WebSocket) or from anywhere (Cloudflare relay).
// Input can also arrive over the WebRTC data channel once video is connected.

import { EventEmitter } from 'node:events';
import type { HostToPhone, PhoneToHost } from '@shared/protocol';
import type { InputController } from './input';

/** If keys are held and the phone goes quiet this long, release everything. */
const SILENCE_RELEASE_MS = 2500;

export interface PhoneLink {
  kind: 'local' | 'remote';
  address: string;
  send(msg: HostToPhone): void;
  /** Tell this phone to stop (e.g. replaced or kicked) and drop it if possible. */
  kick(msg: HostToPhone): void;
}

export interface PhoneInfo {
  ua: string;
  address: string;
  version: string;
  kind: 'local' | 'remote';
}

export interface PhoneHubEvents {
  connected: [PhoneInfo];
  disconnected: [];
  stats: [{ rtt: number }];
  log: [{ level: 'info' | 'error'; message: string }];
  rtc: [PhoneToHost];
}

export class PhoneHub extends EventEmitter<PhoneHubEvents> {
  private active: PhoneLink | null = null;
  private lastSeen = 0;
  private watchdog: NodeJS.Timeout;

  constructor(
    private input: InputController,
    private layoutMessage: () => HostToPhone
  ) {
    super();
    this.watchdog = setInterval(() => {
      if (this.input.pressedCount > 0 && Date.now() - this.lastSeen > SILENCE_RELEASE_MS) {
        console.warn('[hub] phone went quiet, releasing all keys');
        this.input.releaseAll();
      }
    }, 500);
  }

  get connected(): boolean {
    return this.active !== null;
  }

  send(msg: HostToPhone): void {
    this.active?.send(msg);
  }

  /** A message from a WebSocket link (local or relay). */
  fromLink(link: PhoneLink, msg: PhoneToHost): void {
    this.lastSeen = Date.now();
    if (msg.t === 'hello') {
      if (this.active && this.active !== link) {
        // Newest phone wins. Release everything the old one was holding.
        this.input.releaseAll();
        this.active.kick({ t: 'replaced' });
      }
      this.active = link;
      link.send(this.layoutMessage());
      this.emit('connected', {
        ua: String(msg.ua ?? ''),
        address: link.address,
        version: typeof msg.version === 'string' ? msg.version : '',
        kind: link.kind
      });
      return;
    }
    if (link !== this.active) return;
    this.apply(msg, (m) => link.send(m));
  }

  /** A message from the WebRTC data channel of the active phone. */
  fromDataChannel(msg: PhoneToHost): void {
    if (!this.active) return;
    this.lastSeen = Date.now();
    this.apply(msg, (m) => this.send(m));
  }

  /** The link went away (socket closed, or the relay says the phone left). */
  linkClosed(link: PhoneLink): void {
    if (this.active !== link) return;
    this.active = null;
    this.input.releaseAll();
    this.emit('disconnected');
  }

  /** "연결 끊기" on the PC. */
  disconnect(): void {
    const link = this.active;
    if (!link) return;
    link.kick({ t: 'kicked' });
    this.linkClosed(link);
  }

  dispose(): void {
    clearInterval(this.watchdog);
    this.input.releaseAll();
  }

  private apply(msg: PhoneToHost, reply: (m: HostToPhone) => void): void {
    switch (msg.t) {
      case 'key':
        if (typeof msg.key === 'string') this.input.key(msg.key, !!msg.down);
        break;
      case 'move':
        this.input.move(Number(msg.dx), Number(msg.dy));
        break;
      case 'releaseAll':
        this.input.releaseAll();
        break;
      case 'ping':
        reply({ t: 'pong', ts: msg.ts });
        break;
      case 'stats':
        this.emit('stats', { rtt: Number(msg.rtt) });
        break;
      case 'log':
        this.emit('log', { level: msg.level === 'error' ? 'error' : 'info', message: String(msg.message).slice(0, 300) });
        break;
      case 'rtc-answer':
      case 'rtc-ice':
        this.emit('rtc', msg);
        break;
    }
  }
}
