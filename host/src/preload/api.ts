// Types for the API the preload script exposes to the renderer as window.api.

import type { Layout } from '@shared/layout';
import type { HostToPhone, PhoneToHost } from '@shared/protocol';

export interface Settings {
  port: number;
  displayId: string;
  fps: 30 | 60;
  maxHeight: 720 | 1080;
  latencyFirst: boolean;
  relayUrl: string;
  roomId: string;
  roomKey: string;
}

export interface LayoutStore {
  active: number;
  items: Layout[];
}

export type QrMode = 'local' | 'remote';

export interface HostState {
  /** What the QR code points to. */
  url: string;
  /** Same-Wi‑Fi address, e.g. http://192.168.0.12:8080 */
  localUrl: string;
  qrMode: QrMode;
  remote: { configured: boolean; status: 'off' | 'connecting' | 'online' | 'error' };
  addresses: string[];
  port: number;
  qrDataUrl: string;
  serverError: string | null;
  phone: { connected: boolean; ua: string; address: string; version: string; kind: 'local' | 'remote' | '' };
  appVersion: string;
  rtt: number | null;
  inputAvailable: boolean;
  isAdmin: boolean;
  /** Windows Firewall rule added (null = not checked / not Windows). */
  firewallOk: boolean | null;
  /** Last status / error message reported by the phone. */
  phoneLog: { level: 'info' | 'error'; message: string } | null;
  platform: string;
}

export interface DisplayInfo {
  id: string;
  name: string;
}

export type Unsubscribe = () => void;

export interface HostApi {
  getState(): Promise<HostState>;
  onState(cb: (s: HostState) => void): Unsubscribe;
  getLayouts(): Promise<LayoutStore>;
  saveLayouts(store: LayoutStore): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  listDisplays(): Promise<DisplayInfo[]>;
  disconnectPhone(): Promise<void>;
  copy(text: string): Promise<void>;
  /** Put this address in the QR code (e.g. a Tailscale 100.x address). */
  useAddress(address: string): Promise<void>;
  setQrMode(mode: QrMode): Promise<void>;
  /** Make a new room key; old QR codes and bookmarks stop working. */
  newRoomKey(): Promise<Settings>;
  /** Input that arrived over the WebRTC data channel. */
  phoneDcMessage(msg: PhoneToHost): void;
  /** Windows: restart with admin rights. Resolves false if the UAC prompt was declined. */
  relaunchAsAdmin(): Promise<boolean>;
  rtcSend(msg: HostToPhone): void;
  onRtc(cb: (msg: PhoneToHost) => void): Unsubscribe;
  onPhone(cb: (event: 'connected' | 'disconnected') => void): Unsubscribe;
  onKey(cb: (key: string, down: boolean) => void): Unsubscribe;
}
