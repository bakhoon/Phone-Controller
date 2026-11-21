// Captures the PC screen and sends it to the phone over WebRTC.
// Signaling (offer / answer / ICE) goes through the main process WebSocket.

import { ICE_SERVERS, type IceCandidate, type PhoneToHost } from '@shared/protocol';
import type { Settings } from '../../preload/api';

type SendParams = RTCRtpSendParameters & { degradationPreference?: string };

export class Streamer {
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private sender: RTCRtpSender | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  onStatus: (s: 'idle' | 'starting' | 'streaming' | 'error', detail?: string) => void = () => {};

  async start(settings: Settings): Promise<void> {
    this.stop();
    this.onStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: settings.fps, max: settings.fps },
          height: { max: settings.maxHeight }
        },
        audio: false
      });
      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      track.contentHint = settings.latencyFirst ? 'motion' : 'detail';

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.pc = pc;
      const transceiver = pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] });
      this.sender = transceiver.sender;
      preferH264(transceiver);

      // Input from the phone comes over this channel once connected: lower latency
      // than the WebSocket, and direct even when signaling goes through the relay.
      const dc = pc.createDataChannel('input', { ordered: true });
      dc.onmessage = (ev) => {
        let msg: PhoneToHost;
        try {
          msg = JSON.parse(String(ev.data)) as PhoneToHost;
        } catch {
          return;
        }
        // Answer pings right here so the phone measures the real input path.
        if (msg.t === 'ping') dc.send(JSON.stringify({ t: 'pong', ts: msg.ts }));
        else window.api.phoneDcMessage(msg);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) window.api.rtcSend({ t: 'rtc-ice', candidate: e.candidate.toJSON() as IceCandidate });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') this.onStatus('streaming');
        if (pc.connectionState === 'failed') this.onStatus('error', '영상 연결에 실패했어요');
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      window.api.rtcSend({ t: 'rtc-offer', sdp: offer.sdp ?? '' });
      this.settings = settings;
    } catch (err) {
      console.error('[rtc] start failed', err);
      this.onStatus('error', '화면 캡처를 시작하지 못했어요');
    }
  }

  private settings: Settings | null = null;

  async handle(msg: PhoneToHost): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    try {
      if (msg.t === 'rtc-answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
        for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c);
        await this.tuneEncoder();
      } else if (msg.t === 'rtc-ice') {
        if (pc.remoteDescription) await pc.addIceCandidate(msg.candidate);
        else this.pendingIce.push(msg.candidate);
      }
    } catch (err) {
      console.error('[rtc] signaling error', err);
    }
  }

  stop(): void {
    this.pc?.close();
    this.pc = null;
    this.sender = null;
    this.pendingIce = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.onStatus('idle');
  }

  private async tuneEncoder(): Promise<void> {
    if (!this.sender || !this.settings) return;
    const s = this.settings;
    const params = this.sender.getParameters() as SendParams;
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].maxBitrate = s.maxHeight >= 1080 ? 12_000_000 : 6_000_000;
    params.encodings[0].maxFramerate = s.fps;
    params.degradationPreference = s.latencyFirst ? 'maintain-framerate' : 'maintain-resolution';
    try {
      await this.sender.setParameters(params);
    } catch (err) {
      console.warn('[rtc] setParameters failed', err);
    }
  }
}

/** iPhones decode H.264 in hardware, so put it first when available. */
function preferH264(t: RTCRtpTransceiver): void {
  const caps = RTCRtpSender.getCapabilities?.('video');
  if (!caps || typeof t.setCodecPreferences !== 'function') return;
  const h264 = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264');
  if (h264.length === 0) return;
  const rest = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== 'video/h264');
  try {
    t.setCodecPreferences([...h264, ...rest]);
  } catch (err) {
    console.warn('[rtc] could not prefer H.264', err);
  }
}
