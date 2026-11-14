// Keys a widget can send. The id is the value stored in a layout; the host maps
// it to a Windows scan code (see host/src/main/keymap.ts).

export interface KeyOption {
  id: string;
  label: string;
}

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => ({ id: `Key${c}`, label: c }));
const digits = '1234567890'.split('').map((d) => ({ id: `Digit${d}`, label: d }));
const fkeys = Array.from({ length: 12 }, (_, i) => ({ id: `F${i + 1}`, label: `F${i + 1}` }));

export const KEY_OPTIONS: KeyOption[] = [
  { id: 'ArrowUp', label: '↑' },
  { id: 'ArrowDown', label: '↓' },
  { id: 'ArrowLeft', label: '←' },
  { id: 'ArrowRight', label: '→' },
  ...letters,
  ...digits,
  { id: 'AltLeft', label: 'Alt' },
  { id: 'ControlLeft', label: 'Ctrl' },
  { id: 'ShiftLeft', label: 'Shift' },
  { id: 'Space', label: 'Space' },
  { id: 'Enter', label: 'Enter' },
  { id: 'Escape', label: 'Esc' },
  { id: 'Tab', label: 'Tab' },
  { id: 'Insert', label: 'Insert' },
  { id: 'Delete', label: 'Delete' },
  { id: 'Home', label: 'Home' },
  { id: 'End', label: 'End' },
  { id: 'PageUp', label: 'Page Up' },
  { id: 'PageDown', label: 'Page Down' },
  ...fkeys,
  { id: 'MouseLeft', label: '마우스 왼쪽' },
  { id: 'MouseRight', label: '마우스 오른쪽' }
];

export function keyLabel(id: string): string {
  return KEY_OPTIONS.find((k) => k.id === id)?.label ?? id;
}
