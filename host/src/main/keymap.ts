// Key id (shared/keys.ts) -> Windows set-1 scan code.
// Scan codes are used instead of virtual-key codes because many games
// (DirectInput / raw input) only react to scan codes.

export interface ScanCode {
  code: number;
  /** Needs the 0xE0 prefix (KEYEVENTF_EXTENDEDKEY). */
  extended: boolean;
}

const sc = (code: number, extended = false): ScanCode => ({ code, extended });

const LETTERS: Record<string, number> = {
  Q: 0x10, W: 0x11, E: 0x12, R: 0x13, T: 0x14, Y: 0x15, U: 0x16, I: 0x17, O: 0x18, P: 0x19,
  A: 0x1e, S: 0x1f, D: 0x20, F: 0x21, G: 0x22, H: 0x23, J: 0x24, K: 0x25, L: 0x26,
  Z: 0x2c, X: 0x2d, C: 0x2e, V: 0x2f, B: 0x30, N: 0x31, M: 0x32
};

const DIGITS: Record<string, number> = {
  '1': 0x02, '2': 0x03, '3': 0x04, '4': 0x05, '5': 0x06,
  '6': 0x07, '7': 0x08, '8': 0x09, '9': 0x0a, '0': 0x0b
};

const FKEYS = [0x3b, 0x3c, 0x3d, 0x3e, 0x3f, 0x40, 0x41, 0x42, 0x43, 0x44, 0x57, 0x58];

const SPECIAL: Record<string, ScanCode> = {
  Escape: sc(0x01),
  Tab: sc(0x0f),
  Enter: sc(0x1c),
  ControlLeft: sc(0x1d),
  ShiftLeft: sc(0x2a),
  AltLeft: sc(0x38),
  Space: sc(0x39),
  ArrowUp: sc(0x48, true),
  ArrowLeft: sc(0x4b, true),
  ArrowRight: sc(0x4d, true),
  ArrowDown: sc(0x50, true),
  Insert: sc(0x52, true),
  Delete: sc(0x53, true),
  Home: sc(0x47, true),
  End: sc(0x4f, true),
  PageUp: sc(0x49, true),
  PageDown: sc(0x51, true)
};

export function scanCodeFor(id: string): ScanCode | null {
  if (SPECIAL[id]) return SPECIAL[id];
  const letter = /^Key([A-Z])$/.exec(id);
  if (letter) return sc(LETTERS[letter[1]]);
  const digit = /^Digit([0-9])$/.exec(id);
  if (digit) return sc(DIGITS[digit[1]]);
  const f = /^F([0-9]{1,2})$/.exec(id);
  if (f) {
    const n = Number(f[1]);
    if (n >= 1 && n <= 12) return sc(FKEYS[n - 1]);
  }
  return null;
}

export function isMouseButton(id: string): id is 'MouseLeft' | 'MouseRight' {
  return id === 'MouseLeft' || id === 'MouseRight';
}
