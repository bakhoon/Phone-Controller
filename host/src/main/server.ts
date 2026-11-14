// HTTP server for the phone web app + WebSocket for input, layout and signaling.
// Only one phone is controlled at a time; a new phone replaces the old one.

import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { EventEmitter } from 'node:events';
import { WebSocketServer, WebSocket } from 'ws';
import type { HostToPhone, PhoneToHost } from '@shared/protocol';
import { WS_PATH } from '@shared/protocol';
import type { InputController } from './input';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/** If keys are held and the phone goes quiet this long, release everything. */
const SILENCE_RELEASE_MS = 2500;

export interface PhoneInfo {
  ua: string;
  address: string;
}

export interface ControllerServerEvents {
  connected: [PhoneInfo];
  disconnected: [];
  stats: [{ rtt: number }];
  rtc: [PhoneToHost];
  error: [Error];
}

export class ControllerServer extends EventEmitter<ControllerServerEvents> {
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;
  private phone: WebSocket | null = null;
  private lastSeen = 0;
  private watchdog: NodeJS.Timeout | null = null;

  constructor(
    private clientDir: string,
    private input: InputController,
    private getLayoutMessage: () => HostToPhone
  ) {
    super();
  }

  get connected(): boolean {
    return this.phone !== null && this.phone.readyState === WebSocket.OPEN;
  }

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const http = createServer((req, res) => void this.serveStatic(req.url ?? '/', res));
      const wss = new WebSocketServer({ server: http, path: WS_PATH });
      wss.on('connection', (ws, req) => this.onConnection(ws, req.socket.remoteAddress ?? ''));
      http.once('error', reject);
      // 0.0.0.0 so the phone on the same Wi‑Fi can reach it (localhost would only work on this PC).
      http.listen(port, '0.0.0.0', () => {
        http.off('error', reject);
        http.on('error', (e) => this.emit('error', e));
        this.http = http;
        this.wss = wss;
        this.watchdog = setInterval(() => this.checkSilence(), 500);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.input.releaseAll();
    this.phone?.terminate();
    this.phone = null;
    this.wss?.close();
    await new Promise<void>((r) => (this.http ? this.http.close(() => r()) : r()));
    this.http = null;
    this.wss = null;
  }

  send(msg: HostToPhone): void {
    if (this.connected) this.phone!.send(JSON.stringify(msg));
  }

  private onConnection(ws: WebSocket, address: string): void {
    if (this.phone) {
      // Newest phone wins. Release everything the old one was holding.
      this.input.releaseAll();
      try {
        this.phone.send(JSON.stringify({ t: 'replaced' } satisfies HostToPhone));
      } catch {
        /* ignore */
      }
      this.phone.close();
    }
    this.phone = ws;
    this.lastSeen = Date.now();
    let alive = true;
    ws.on('pong', () => (alive = true));
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 2000);

    ws.on('message', (data) => {
      this.lastSeen = Date.now();
      let msg: PhoneToHost;
      try {
        msg = JSON.parse(String(data)) as PhoneToHost;
      } catch {
        return;
      }
      this.handle(msg, ws, address);
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      if (this.phone === ws) {
        this.phone = null;
        this.input.releaseAll();
        this.emit('disconnected');
      }
    });
  }

  private handle(msg: PhoneToHost, ws: WebSocket, address: string): void {
    if (ws !== this.phone) return;
    switch (msg.t) {
      case 'hello':
        this.send(this.getLayoutMessage());
        this.emit('connected', { ua: msg.ua, address });
        break;
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
        this.send({ t: 'pong', ts: msg.ts });
        break;
      case 'stats':
        this.emit('stats', { rtt: Number(msg.rtt) });
        break;
      case 'rtc-answer':
      case 'rtc-ice':
        this.emit('rtc', msg);
        break;
    }
  }

  private checkSilence(): void {
    if (this.input.pressedCount > 0 && Date.now() - this.lastSeen > SILENCE_RELEASE_MS) {
      console.warn('[server] phone went quiet, releasing all keys');
      this.input.releaseAll();
    }
  }

  private async serveStatic(url: string, res: import('node:http').ServerResponse): Promise<void> {
    const path = decodeURIComponent(url.split('?')[0]);
    const rel = normalize(path === '/' ? '/index.html' : path).replace(/^([/\\])+/, '');
    let full = join(this.clientDir, rel);
    if (!full.startsWith(this.clientDir + sep) && full !== this.clientDir) {
      res.writeHead(403).end();
      return;
    }
    try {
      const s = await stat(full);
      if (s.isDirectory()) full = join(full, 'index.html');
    } catch {
      full = join(this.clientDir, 'index.html'); // single-page app fallback
    }
    try {
      const body = await readFile(full);
      res.writeHead(200, {
        'Content-Type': MIME[extname(full)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Phone app not built. Run "npm run build:client" in the repo root.');
    }
  }
}
