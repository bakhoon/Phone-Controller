// Relay for remote play.
// - Serves the phone web app (client/dist) as static assets.
// - /ws?room=<id>&role=host|phone&key=<secret> joins a room (one Durable Object per room).
//   The PC app connects as "host" and sets the room key; a phone must present the same key.
//   Messages are passed through as-is. Video and input then go directly phone <-> PC over WebRTC.

import { DurableObject } from 'cloudflare:workers';

interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
}

const ROOM_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const ROOM_KEY_RE = /^[A-Za-z0-9_-]{16,80}$/;
const MAX_MESSAGE = 64 * 1024;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      const room = url.searchParams.get('room') ?? '';
      if (!ROOM_ID_RE.test(room)) return new Response('Bad room', { status: 400 });
      return env.ROOM.get(env.ROOM.idFromName(room)).fetch(req);
    }
    return env.ASSETS.fetch(req);
  }
} satisfies ExportedHandler<Env>;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function send(ws: WebSocket | null, msg: unknown): void {
  try {
    ws?.send(JSON.stringify(msg));
  } catch {
    /* socket already closed */
  }
}

export class Room extends DurableObject<Env> {
  private host: WebSocket | null = null;
  private phone: WebSocket | null = null;
  private key = '';

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const role = url.searchParams.get('role');
    const key = url.searchParams.get('key') ?? '';
    if ((role !== 'host' && role !== 'phone') || !ROOM_KEY_RE.test(key)) return new Response('Bad request', { status: 400 });

    const pair = new WebSocketPair();
    const [client, ws] = [pair[0], pair[1]];
    ws.accept();

    if (role === 'host') this.attachHost(ws, key);
    else this.attachPhone(ws, key);

    return new Response(null, { status: 101, webSocket: client });
  }

  private attachHost(ws: WebSocket, key: string): void {
    // A restarted PC app replaces the old connection. A different key kicks the phone.
    if (this.host) this.host.close(4000, 'replaced');
    if (this.key && !timingSafeEqual(this.key, key) && this.phone) {
      this.phone.close(4001, 'key changed');
      this.phone = null;
    }
    this.host = ws;
    this.key = key;
    send(this.phone, { t: 'host', status: 'online' });
    if (this.phone) send(ws, { t: 'peer', status: 'joined' });

    ws.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string' && ev.data.length <= MAX_MESSAGE) this.phone?.send(ev.data);
    });
    ws.addEventListener('close', () => {
      if (this.host !== ws) return;
      this.host = null;
      send(this.phone, { t: 'host', status: 'offline' });
    });
  }

  private attachPhone(ws: WebSocket, key: string): void {
    if (!this.host || !timingSafeEqual(this.key, key)) {
      // Wrong key: stop. PC app not running: the phone waits and retries.
      if (this.host) send(ws, { t: 'denied' });
      else send(ws, { t: 'host', status: 'offline' });
      ws.close(4002, this.host ? 'bad key' : 'host offline');
      return;
    }
    if (this.phone) {
      send(this.phone, { t: 'replaced' });
      this.phone.close(4003, 'replaced');
      send(this.host, { t: 'peer', status: 'left' });
    }
    this.phone = ws;
    send(ws, { t: 'host', status: 'online' });
    send(this.host, { t: 'peer', status: 'joined' });

    ws.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string' && ev.data.length <= MAX_MESSAGE) this.host?.send(ev.data);
    });
    ws.addEventListener('close', () => {
      if (this.phone !== ws) return;
      this.phone = null;
      send(this.host, { t: 'peer', status: 'left' });
    });
  }
}
