// Settings and layouts saved as JSON in the app's user data folder.

import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defaultLayout, normalizeLayout, type Layout } from '@shared/layout';

export interface Settings {
  port: number;
  /** Electron display_id of the monitor to capture; empty = primary. */
  displayId: string;
  fps: 30 | 60;
  maxHeight: 720 | 1080;
  latencyFirst: boolean;
}

export interface LayoutStore {
  active: number;
  items: Layout[];
}

const DEFAULT_SETTINGS: Settings = { port: 8080, displayId: '', fps: 60, maxHeight: 1080, latencyFirst: true };

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
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>('settings.json', {}) };
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
