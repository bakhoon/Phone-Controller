// Same‑Wi‑Fi path: HTTP server for the phone web app + WebSocket for input,
// layout and signaling. Who is in control is decided by PhoneHub.

import { createServer, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import type { HostToPhone, PhoneToHost } from '@shared/protocol';
import { WS_PATH } from '@shared/protocol';
import type { PhoneHub, PhoneLink } from './hub';

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

export class ControllerServer {
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;

  constructor(
    private clientDir: string,
    private hub: PhoneHub
  ) {}

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const http = createServer((req, res) => void this.serveStatic(req.url ?? '/', res));
      const wss = new WebSocketServer({ server: http, path: WS_PATH });
      wss.on('connection', (ws, req) => this.onConnection(ws, req.socket.remoteAddress ?? ''));
      http.once('error', reject);
      // 0.0.0.0 so the phone on the same Wi‑Fi can reach it (localhost would only work on this PC).
      http.listen(port, '0.0.0.0', () => {
        http.off('error', reject);
        http.on('error', (e) => console.error('[server]', e));
        this.http = http;
        this.wss = wss;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const ws of this.wss?.clients ?? []) ws.terminate();
    this.wss?.close();
    await new Promise<void>((r) => (this.http ? this.http.close(() => r()) : r()));
    this.http = null;
    this.wss = null;
  }

  private onConnection(ws: WebSocket, address: string): void {
    const send = (msg: HostToPhone) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const link: PhoneLink = {
      kind: 'local',
      address,
      send,
      kick: (msg) => {
        send(msg);
        ws.close();
      }
    };

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
      let msg: PhoneToHost;
      try {
        msg = JSON.parse(String(data)) as PhoneToHost;
      } catch {
        return;
      }
      this.hub.fromLink(link, msg);
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      this.hub.linkClosed(link);
    });
  }

  private async serveStatic(url: string, res: ServerResponse): Promise<void> {
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
