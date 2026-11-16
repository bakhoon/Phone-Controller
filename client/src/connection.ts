// WebSocket connection to the PC host plus the WebRTC receiver for the screen.

import type { Layout } from '@shared/layout';
import { WS_PATH, type HostToPhone, type IceCandidate, type PhoneToHost } from '@shared/protocol';

export type ConnStatus = 'connecting' | 'connected' | 'failed' | 'replaced';

const PING_MS = 1000;

export class Connection {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private pendingIce: IceCandidate[] = [];
  private failures = 0;
  private retryTimer: number | undefined;
  private pingTimer: number | undefined;
  private stopped = false;

  onStatus: (s: ConnStatus) => void = () => {};
  onLayout: (l: Layout) => void = () => {};
  onStream: (s: MediaStream | null) => void = () => {};
  onRtt: (ms: number) => void = () => {};

  start(): void {
    this.stopped = false;
    this.connect();
  }

  retry(): void {
    this.failures = 0;
    window.clearTimeout(this.retryTimer);
    this.ws?.close();
    this.connect();
  }

  /** Report a status / error line to the PC app (shown on its main screen). */
  log(level: 'info' | 'error', message: string): void {
    this.send({ t: 'log', level, message });
  }

  send(msg: PhoneToHost): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private connect(): void {
    if (this.stopped) return;
    this.onStatus(this.failures >= 3 ? 'failed' : 'connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    // Same host and port the page came from: the PC's LAN address.
    const ws = new WebSocket(`${proto}://${location.host}${WS_PATH}`);
    this.ws = ws;

    ws.onopen = () => {
      this.failures = 0;
      this.onStatus('connected');
      this.send({ t: 'hello', ua: navigator.userAgent });
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', ts: performance.now() }), PING_MS);
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
      this.onStatus(this.failures >= 3 ? 'failed' : 'connecting');
      this.retryTimer = window.setTimeout(() => this.connect(), Math.min(1000 * this.failures, 5000));
    };
  }

  private async handle(msg: HostToPhone): Promise<void> {
    switch (msg.t) {
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
        // Another phone took over. Stop reconnecting so we don't fight it.
        this.stopped = true;
        this.onStatus('replaced');
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
    const pc = new RTCPeerConnection({ iceServers: [] });
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
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === 'connecting') this.log('info', '영상 연결 중...');
      if (pc.connectionState === 'connected') this.log('info', '영상 연결됨');
      if (pc.connectionState === 'failed') this.log('error', '영상 연결 실패: 방화벽 또는 네트워크가 영상(UDP)을 막고 있어요');
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
    this.pc?.close();
    this.pc = null;
    this.pendingIce = [];
    this.onStream(null);
  }
}
