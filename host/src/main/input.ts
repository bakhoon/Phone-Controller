// Turns phone input into real Windows keyboard / mouse input via SendInput.
// On non-Windows platforms (for development) input is only logged.

import { isMouseButton, scanCodeFor } from './keymap';

const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_SCANCODE = 0x0008;
const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;

interface KeyboardInput {
  type: number;
  u: { ki: { wVk: number; wScan: number; dwFlags: number; time: number; dwExtraInfo: number } };
}
interface MouseInput {
  type: number;
  u: { mi: { dx: number; dy: number; mouseData: number; dwFlags: number; time: number; dwExtraInfo: number } };
}

type SendFn = (input: KeyboardInput | MouseInput) => boolean;

function loadSendInput(): SendFn | null {
  if (process.platform !== 'win32') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
      dx: 'int32',
      dy: 'int32',
      mouseData: 'uint32',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uintptr_t'
    });
    const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
      wVk: 'uint16',
      wScan: 'uint16',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uintptr_t'
    });
    const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', {
      uMsg: 'uint32',
      wParamL: 'uint16',
      wParamH: 'uint16'
    });
    const INPUT_UNION = koffi.union('INPUT_UNION', { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT });
    const INPUT = koffi.struct('INPUT', { type: 'uint32', u: INPUT_UNION });
    const SendInput = user32.func('__stdcall', 'SendInput', 'uint32', ['uint32', koffi.pointer(INPUT), 'int']);
    const size = koffi.sizeof(INPUT);
    return (input) => SendInput(1, [input], size) === 1;
  } catch (err) {
    console.error('[input] could not load SendInput:', err);
    return null;
  }
}

export class InputController {
  private send: SendFn | null = loadSendInput();
  private pressed = new Set<string>();
  private remX = 0;
  private remY = 0;
  /** Called with every key change so the UI can show it. */
  onKey: (key: string, down: boolean) => void = () => {};

  get available(): boolean {
    return this.send !== null;
  }

  get pressedCount(): number {
    return this.pressed.size;
  }

  key(id: string, down: boolean): void {
    if (down === this.pressed.has(id)) return; // ignore repeats
    if (down) this.pressed.add(id);
    else this.pressed.delete(id);
    this.emit(id, down);
    this.onKey(id, down);
  }

  /** Relative mouse move in PC pixels. Fractions are carried over. */
  move(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.remX += dx;
    this.remY += dy;
    const ix = Math.trunc(this.remX);
    const iy = Math.trunc(this.remY);
    if (ix === 0 && iy === 0) return;
    this.remX -= ix;
    this.remY -= iy;
    this.mouse(MOUSEEVENTF_MOVE, ix, iy);
  }

  /** Release every key and mouse button that is still held. */
  releaseAll(): void {
    for (const id of [...this.pressed]) this.key(id, false);
    this.remX = 0;
    this.remY = 0;
  }

  private emit(id: string, down: boolean): void {
    if (isMouseButton(id)) {
      const flag =
        id === 'MouseLeft'
          ? down ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP
          : down ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
      this.mouse(flag, 0, 0);
      return;
    }
    const code = scanCodeFor(id);
    if (!code) {
      console.warn('[input] unknown key', id);
      return;
    }
    let flags = KEYEVENTF_SCANCODE;
    if (code.extended) flags |= KEYEVENTF_EXTENDEDKEY;
    if (!down) flags |= KEYEVENTF_KEYUP;
    if (!this.send) {
      console.log(`[input] key ${id} ${down ? 'down' : 'up'} (scan 0x${code.code.toString(16)})`);
      return;
    }
    this.send({ type: INPUT_KEYBOARD, u: { ki: { wVk: 0, wScan: code.code, dwFlags: flags, time: 0, dwExtraInfo: 0 } } });
  }

  private mouse(flags: number, dx: number, dy: number): void {
    if (!this.send) return;
    this.send({ type: INPUT_MOUSE, u: { mi: { dx, dy, mouseData: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } } });
  }
}
