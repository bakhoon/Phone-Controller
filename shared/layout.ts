// Layout model shared by the PC host (editor) and the phone client (renderer).
// All coordinates live in a fixed reference space the size of an iPhone in
// landscape (REF_W x REF_H). The phone scales this space to fit its screen.

export const REF_W = 844;
export const REF_H = 390;

export type Shape = 'circle' | 'square';

export interface KeyWidget {
  id: string;
  kind: 'key';
  /** Text shown on the button. */
  label: string;
  /** Key id from KEY_OPTIONS (e.g. "KeyQ", "AltLeft", "MouseLeft"). */
  key: string;
  shape: Shape;
  /** Diameter / side length in reference px. */
  size: number;
  /** Center position in reference px. */
  x: number;
  y: number;
  /** Background opacity, 0..1. */
  opacity: number;
}

export interface PadWidget {
  id: string;
  kind: 'pad';
  w: number;
  h: number;
  x: number;
  y: number;
  opacity: number;
  /** Mouse speed multiplier. 1 = default. */
  sensitivity: number;
  /** A short tap sends a left click. */
  tapToClick: boolean;
}

export interface StickKeys {
  up: string;
  down: string;
  left: string;
  right: string;
}

/** Round joystick: drag the thumb and it holds the arrow keys for that direction. */
export interface StickWidget {
  id: string;
  kind: 'stick';
  /** Diameter in reference px. */
  size: number;
  x: number;
  y: number;
  opacity: number;
  /** true = 8 directions (diagonals press two keys), false = 4 directions. */
  eightWay: boolean;
  /** Center area that presses nothing, as a fraction of the radius (0..0.6). */
  deadzone: number;
  keys: StickKeys;
}

export const DEFAULT_STICK_KEYS: StickKeys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

export interface ScreenWidget {
  id: 'screen';
  kind: 'screen';
  w: number;
  h: number;
  x: number;
  y: number;
  /** Keep 16:9 while resizing. */
  lockAspect: boolean;
}

export type Widget = KeyWidget | PadWidget | StickWidget | ScreenWidget;

export interface Layout {
  version: 1;
  name: string;
  widgets: Widget[];
}

export function widgetSize(w: Widget): { w: number; h: number } {
  return w.kind === 'key' || w.kind === 'stick' ? { w: w.size, h: w.size } : { w: w.w, h: w.h };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function key(label: string, keyId: string, shape: Shape, size: number, x: number, y: number): KeyWidget {
  return { id: newId(), kind: 'key', label, key: keyId, shape, size, x, y, opacity: 0.18 };
}

/** Default MapleStory-style layout. Adjust keys to match your in-game key settings. */
export function defaultLayout(name = '메이플 기본'): Layout {
  return {
    version: 1,
    name,
    widgets: [
      { id: 'screen', kind: 'screen', w: REF_W, h: REF_H, x: REF_W / 2, y: REF_H / 2, lockAspect: false },
      {
        id: newId(),
        kind: 'stick',
        size: 150,
        x: 120,
        y: 290,
        opacity: 0.16,
        eightWay: true,
        deadzone: 0.25,
        keys: { ...DEFAULT_STICK_KEYS }
      },
      key('Q', 'KeyQ', 'circle', 56, 578, 50),
      key('W', 'KeyW', 'circle', 56, 644, 50),
      key('E', 'KeyE', 'circle', 56, 710, 50),
      key('R', 'KeyR', 'circle', 56, 776, 50),
      key('점프', 'AltLeft', 'circle', 94, 770, 318),
      key('공격', 'ControlLeft', 'circle', 84, 662, 328),
      key('줍기', 'KeyZ', 'circle', 64, 728, 216),
      { id: newId(), kind: 'pad', w: 240, h: 110, x: 410, y: 318, opacity: 0.12, sensitivity: 1, tapToClick: true }
    ]
  };
}

/** Make sure a layout loaded from disk / the network has a screen widget. */
export function normalizeLayout(l: Layout): Layout {
  const hasScreen = l.widgets.some((w) => w.kind === 'screen');
  if (hasScreen) return l;
  return {
    ...l,
    widgets: [{ id: 'screen', kind: 'screen', w: REF_W, h: REF_H, x: REF_W / 2, y: REF_H / 2, lockAspect: false }, ...l.widgets]
  };
}
