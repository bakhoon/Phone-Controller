// Messages exchanged over the WebSocket between the phone and the PC host.
// Video goes over WebRTC; the WebSocket carries input, layout, pings and
// WebRTC signaling.

import type { Layout } from './layout';

export interface IceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type PhoneToHost =
  | { t: 'hello'; ua: string; version?: string }
  | { t: 'key'; key: string; down: boolean }
  | { t: 'move'; dx: number; dy: number }
  | { t: 'releaseAll' }
  | { t: 'ping'; ts: number }
  | { t: 'stats'; rtt: number }
  | { t: 'rtc-answer'; sdp: string }
  | { t: 'rtc-ice'; candidate: IceCandidate }
  | { t: 'log'; level: 'info' | 'error'; message: string };

export type HostToPhone =
  | { t: 'layout'; layout: Layout }
  | { t: 'pong'; ts: number }
  | { t: 'rtc-offer'; sdp: string }
  | { t: 'rtc-ice'; candidate: IceCandidate }
  | { t: 'replaced' };

export const WS_PATH = '/ws';
