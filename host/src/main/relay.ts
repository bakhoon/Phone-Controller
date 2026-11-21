// Play-from-anywhere path: keep an outbound WebSocket to the Cloudflare relay.
// The relay passes messages between this PC and a phone that knows the room key.

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { HostToPhone, PhoneToHost, RelayToHost } from '@shared/protocol';
import type { PhoneHub, PhoneLink } from './hub';

export type RelayStatus = 'off' | 'connecting' | 'online' | 'error';

export class RelayClient extends EventEmitter<{ status: [RelayStatus] }> {
  status: RelayStatus = 'off';
  private ws: WebSocket | null = null;
  private retry: NodeJS.Timeout | null = null;
  private ping: NodeJS.Timeout | null = null;
  private failures = 0;
  private target: { url: string; room: string; key: string } | null = null;

  private link: PhoneLink = {
    kind: 'remote',
    address: '원격',
    send: (msg: HostToPhone) => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    },
    // The relay keeps the phone socket; we can only tell the phone to stop.
    kick: (msg: HostToPhone) => this.link.send(msg)
  };

  constructor(private hub: PhoneHub) {
    super();
  }

  start(url: string, room: string, key: string): void {
    this.stop();
    if (!url) return;
    this.target = { url: url.replace(/\/+$/, ''), room, key };
    this.connect();
  }

  stop(): void {
    this.target = null;
    if (this.retry) clearTimeout(this.retry);
    if (this.ping) clearInterval(this.ping);
    this.retry = null;
    this.ping = null;
    const ws = this.ws;
    this.ws = null;
    ws?.terminate();
    this.hub.linkClosed(this.link);
    this.setStatus('off');
  }

  private setStatus(s: RelayStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  private connect(): void {
    const t = this.target;
    if (!t) return;
    this.setStatus('connecting');
    const wsUrl = t.url.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsUrl}/ws?room=${encodeURIComponent(t.room)}&role=host&key=${encodeURIComponent(t.key)}`);
    this.ws = ws;

    ws.on('open', () => {
      this.failures = 0;
      this.setStatus('online');
      // Keep the connection from idling out.
      this.ping = setInterval(() => ws.ping(), 20_000);
    });

    ws.on('message', (data) => {
      let msg: PhoneToHost | RelayToHost;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.t === 'peer') {
        if (msg.status === 'left') this.hub.linkClosed(this.link);
        return;
      }
      this.hub.fromLink(this.link, msg);
    });

    const onDown = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      this.hub.linkClosed(this.link);
      if (!this.target) return;
      this.failures++;
      this.setStatus(this.failures >= 3 ? 'error' : 'connecting');
      this.retry = setTimeout(() => this.connect(), Math.min(1000 * 2 ** Math.min(this.failures, 4), 15_000));
    };
    ws.on('close', onDown);
    ws.on('error', (e) => {
      console.warn('[relay]', e.message);
      onDown();
    });
  }
}
