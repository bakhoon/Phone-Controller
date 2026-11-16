// Joystick math shared by the phone (input) and the PC editor (preview).

export type Direction = 'up' | 'down' | 'left' | 'right';

// Sector index (counter-clockwise from "right", 45° each) -> held directions.
const EIGHT: Direction[][] = [
  ['right'],
  ['up', 'right'],
  ['up'],
  ['up', 'left'],
  ['left'],
  ['down', 'left'],
  ['down'],
  ['down', 'right']
];
const FOUR: Direction[][] = [['right'], ['up'], ['left'], ['down']];

/**
 * Directions held for a thumb offset (dx, dy) from the stick center.
 * dy is screen-down positive. deadzone is a fraction of the radius.
 */
export function stickDirections(dx: number, dy: number, radius: number, deadzone: number, eightWay: boolean): Direction[] {
  const dist = Math.hypot(dx, dy);
  if (dist < radius * deadzone) return [];
  const angle = Math.atan2(-dy, dx); // radians, CCW from right
  const deg = ((angle * 180) / Math.PI + 360) % 360;
  if (eightWay) return EIGHT[Math.round(deg / 45) % 8];
  return FOUR[Math.round(deg / 90) % 4];
}
