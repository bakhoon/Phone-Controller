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
  /** From the relay: whether the PC app is connected to the room. */
  | { t: 'host'; status: 'online' | 'offline' }
  | { t: 'pong'; ts: number }
  | { t: 'rtc-offer'; sdp: string }
  | { t: 'rtc-ice'; candidate: IceCandidate }
  | { t: 'replaced' }
  /** The PC pressed "연결 끊기". */
  | { t: 'kicked' }
  /** From the relay: the room key in this link is wrong (old QR code). */
  | { t: 'denied' };

/** Messages the relay itself sends to the PC app. */
export type RelayToHost = { t: 'peer'; status: 'joined' | 'left' };

export const WS_PATH = '/ws';

/** Public STUN servers so the phone and PC can find a direct path across the internet. */
export const ICE_SERVERS = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];

/** Room ids and keys are URL-safe random strings. */
export const ROOM_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
export const ROOM_KEY_RE = /^[A-Za-z0-9_-]{16,80}$/;
