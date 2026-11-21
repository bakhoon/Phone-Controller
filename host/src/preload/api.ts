// Types for the API the preload script exposes to the renderer as window.api.

import type { Layout } from '@shared/layout';
import type { HostToPhone, PhoneToHost } from '@shared/protocol';

export interface Settings {
  port: number;
  displayId: string;
  fps: 30 | 60;
  maxHeight: 720 | 1080;
  latencyFirst: boolean;
  captureMode: CaptureMode;
}

export type CaptureMode = 'auto' | 'compat' | 'compat-nogpu';

export interface LayoutStore {
  active: number;
  items: Layout[];
}

export interface HostState {
  url: string;
  addresses: string[];
  port: number;
  qrDataUrl: string;
  serverError: string | null;
  phone: { connected: boolean; ua: string; address: string; version: string };
  appVersion: string;
  rtt: number | null;
  inputAvailable: boolean;
  isAdmin: boolean;
  captureMode: CaptureMode;
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
  /** Save a new capture mode and restart the app so it takes effect. */
  restartWithCaptureMode(mode: CaptureMode): Promise<void>;
  /** desktopCapturer source id of the monitor chosen in settings (fallback capture). */
  screenSourceId(): Promise<string | null>;
  /** Put this address in the QR code (e.g. a Tailscale 100.x address). */
  useAddress(address: string): Promise<void>;
  /** Windows: restart with admin rights. Resolves false if the UAC prompt was declined. */
  relaunchAsAdmin(): Promise<boolean>;
  rtcSend(msg: HostToPhone): void;
  onRtc(cb: (msg: PhoneToHost) => void): Unsubscribe;
  onPhone(cb: (event: 'connected' | 'disconnected') => void): Unsubscribe;
  onKey(cb: (key: string, down: boolean) => void): Unsubscribe;
}
