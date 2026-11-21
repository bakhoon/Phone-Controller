// Connection to the PC app, in one of two modes:
// - local:  the page came from the PC itself (same Wi‑Fi); WebSocket to location.host.
// - remote: the page came from the Cloudflare relay with #r=<room>&k=<key>; WebSocket to the relay,
//           which passes messages to the PC.
// Either way video and input then go directly phone <-> PC over WebRTC when possible.

import type { Layout } from '@shared/layout';
import { ICE_SERVERS, WS_PATH, type HostToPhone, type IceCandidate, type PhoneToHost } from '@shared/protocol';

export type ConnStatus = 'connecting' | 'connected' | 'failed' | 'host-offline' | 'replaced' | 'kicked' | 'denied';

const PING_MS = 1000;
/** Messages that may take the direct data channel instead of the WebSocket. */
const DC_TYPES = new Set<PhoneToHost['t']>(['key', 'move', 'releaseAll', 'ping', 'stats']);

function remoteParams(): { room: string; key: string } | null {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const room = h.get('r');
  const key = h.get('k');
  return room && key ? { room, key } : null;
}

export class Connection {
  readonly remote = remoteParams();
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private pendingIce: IceCandidate[] = [];
  private failures = 0;
  private hostOffline = false;
  private retryTimer: number | undefined;
  private pingTimer: number | undefined;
  private stopped = false;

  onStatus: (s: ConnStatus) => void = () => {};
  onLayout: (l: Layout) => void = () => {};
  onStream: (s: MediaStream | null) => void = () => {};
  onRtt: (ms: number) => void = () => {};
  onPath: (direct: boolean) => void = () => {};

  start(): void {
    this.stopped = false;
    this.connect();
  }

  retry(): void {
    this.failures = 0;
    this.stopped = false;
    window.clearTimeout(this.retryTimer);
    this.ws?.close();
    this.connect();
  }

  /** Report a status / error line to the PC app (shown on its main screen). */
  log(level: 'info' | 'error', message: string): void {
    this.send({ t: 'log', level, message });
  }

  send(msg: PhoneToHost): void {
    if (DC_TYPES.has(msg.t) && this.dc?.readyState === 'open') {
      this.dc.send(JSON.stringify(msg));
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private wsUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    if (this.remote) {
      const q = new URLSearchParams({ room: this.remote.room, role: 'phone', key: this.remote.key });
      return `${proto}://${location.host}${WS_PATH}?${q}`;
    }
    return `${proto}://${location.host}${WS_PATH}`;
  }

  private setStatusForFailure(): void {
    if (this.hostOffline) this.onStatus('host-offline');
    else this.onStatus(this.failures >= 3 ? 'failed' : 'connecting');
  }

  private hello(): void {
    this.send({ t: 'hello', ua: navigator.userAgent, version: __APP_VERSION__ });
    window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => this.send({ t: 'ping', ts: performance.now() }), PING_MS);
  }

  private connect(): void {
    if (this.stopped) return;
    this.setStatusForFailure();
    const ws = new WebSocket(this.wsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.failures = 0;
      // Local: the PC is right there. Remote: wait for the relay to say the PC is online.
      if (!this.remote) {
        this.onStatus('connected');
        this.hello();
      }
    };

    ws.onmessage = (ev) => {
      let msg: HostToPhone;
      try {
        msg = JSON.parse(String(ev.data)) as HostToPhone;
      } catch {
        return;
      }
      void this.handle(msg);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      window.clearInterval(this.pingTimer);
      this.closePeer();
      if (this.stopped) return;
      this.failures++;
      this.setStatusForFailure();
      const delay = this.hostOffline ? 3000 : Math.min(1000 * this.failures, 5000);
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    };
  }

  private async handle(msg: HostToPhone): Promise<void> {
    switch (msg.t) {
      case 'host':
        if (msg.status === 'online') {
          this.hostOffline = false;
          this.onStatus('connected');
          this.hello();
        } else {
          this.hostOffline = true;
          window.clearInterval(this.pingTimer);
          this.closePeer();
          this.onStatus('host-offline');
        }
        break;
      case 'layout':
        this.onLayout(msg.layout);
        break;
      case 'pong': {
        const rtt = performance.now() - msg.ts;
        this.onRtt(rtt);
        this.send({ t: 'stats', rtt });
        break;
      }
      case 'rtc-offer':
        try {
          await this.answer(msg.sdp);
        } catch (err) {
          this.log('error', `영상 연결 준비 실패: ${String(err)}`);
        }
        break;
      case 'rtc-ice':
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(msg.candidate).catch(() => {});
        else this.pendingIce.push(msg.candidate);
        break;
      case 'replaced':
      case 'kicked':
      case 'denied':
        // Stop reconnecting so we don't fight the other phone / the PC's choice.
        this.stopped = true;
        window.clearInterval(this.pingTimer);
        this.closePeer();
        this.onStatus(msg.t);
        this.ws?.close();
        break;
    }
  }

  private async answer(sdp: string): Promise<void> {
    this.closePeer();
    if (typeof RTCPeerConnection === 'undefined') {
      this.log('error', '이 브라우저에서 WebRTC를 쓸 수 없어요 (HTTPS가 필요할 수 있음)');
      return;
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    pc.ontrack = (e) => {
      // Ask for the smallest possible playout buffer (ignored where unsupported).
      try {
        const r = e.receiver as RTCRtpReceiver & { jitterBufferTarget?: number | null; playoutDelayHint?: number };
        r.jitterBufferTarget = 0;
        r.playoutDelayHint = 0;
      } catch {
        /* not supported */
      }
      this.onStream(e.streams[0] ?? new MediaStream([e.track]));
    };
    pc.ondatachannel = (e) => {
      const dc = e.channel;
      dc.onopen = () => {
        if (pc !== this.pc) return;
        this.dc = dc;
        this.onPath(true);
      };
      dc.onclose = () => {
        if (this.dc === dc) {
          this.dc = null;
          this.onPath(false);
        }
      };
      dc.onmessage = (ev) => {
        try {
          void this.handle(JSON.parse(String(ev.data)) as HostToPhone);
        } catch {
          /* ignore */
        }
      };
    };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === 'connecting') this.log('info', '영상 연결 중...');
      if (pc.connectionState === 'connected') this.log('info', '영상 연결됨');
      if (pc.connectionState === 'failed')
        this.log('error', this.remote ? '영상 연결 실패: 이 네트워크는 직접 연결을 막고 있어요' : '영상 연결 실패: 방화벽 또는 네트워크가 영상(UDP)을 막고 있어요');
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ t: 'rtc-ice', candidate: e.candidate.toJSON() as IceCandidate });
    };
    await pc.setRemoteDescription({ type: 'offer', sdp });
    for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.send({ t: 'rtc-answer', sdp: answer.sdp ?? '' });
  }

  private closePeer(): void {
    this.dc = null;
    this.onPath(false);
    this.pc?.close();
    this.pc = null;
    this.pendingIce = [];
    this.onStream(null);
  }
}
