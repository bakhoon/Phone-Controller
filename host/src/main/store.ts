// Settings and layouts saved as JSON in the app's user data folder.

import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { defaultLayout, normalizeLayout, type Layout } from '@shared/layout';

export interface Settings {
  port: number;
  /** Electron display_id of the monitor to capture; empty = primary. */
  displayId: string;
  fps: 30 | 60;
  maxHeight: 720 | 1080;
  latencyFirst: boolean;
  /** Cloudflare relay URL for play-from-anywhere, e.g. https://phone-controller.you.workers.dev. Empty = off. */
  relayUrl: string;
  /** This PC's room on the relay, and the secret a phone needs to join it. */
  roomId: string;
  roomKey: string;
}

export interface LayoutStore {
  active: number;
  items: Layout[];
}

const DEFAULT_SETTINGS: Settings = { port: 8080, displayId: '', fps: 60, maxHeight: 1080, latencyFirst: true, relayUrl: '', roomId: '', roomKey: '' };

export function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

function file(name: string): string {
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file(name), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(name: string, value: unknown): void {
  writeFileSync(file(name), JSON.stringify(value, null, 2), 'utf8');
}

export function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>('settings.json', {}) };
  if (!s.roomId || !s.roomKey) {
    s.roomId = s.roomId || randomToken(9);
    s.roomKey = s.roomKey || randomToken(18);
    saveSettings(s);
  }
  return s;
}

export function saveSettings(s: Settings): void {
  writeJson('settings.json', s);
}

export function loadLayouts(): LayoutStore {
  const stored = readJson<LayoutStore | null>('layouts.json', null);
  if (!stored || !Array.isArray(stored.items) || stored.items.length === 0) {
    return { active: 0, items: [defaultLayout()] };
  }
  const items = stored.items.map(normalizeLayout);
  const active = Math.min(Math.max(0, stored.active | 0), items.length - 1);
  return { active, items };
}

export function saveLayouts(s: LayoutStore): void {
  writeJson('layouts.json', s);
}
