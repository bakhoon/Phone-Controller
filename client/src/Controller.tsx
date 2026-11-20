import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { REF_H, REF_W, widgetSize, type KeyWidget, type Layout, type PadWidget, type StickWidget, type Widget } from '@shared/layout';
import { stickDirections, type Direction } from '@shared/stick';
import type { Connection } from './connection';

interface Props {
  layout: Layout;
  conn: Connection;
  stream: MediaStream | null;
  rtt: number | null;
}

/** Phone px -> PC px for the touchpad at sensitivity 1. */
const PAD_BASE = 2.5;
const TAP_MAX_MOVE = 8;
const TAP_MAX_MS = 250;

interface StickTouch {
  pointerId: number;
  dirs: Direction[];
}

interface PadTouch {
  pointerId: number;
  lastX: number;
  lastY: number;
  t0: number;
  moved: number;
  w: PadWidget;
}

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return vp;
}

export function Controller({ layout, conn, stream, rtt }: Props) {
  const vp = useViewport();
  const scale = Math.min(vp.w / REF_W, vp.h / REF_H);
  const offX = (vp.w - REF_W * scale) / 2;
  const offY = (vp.h - REF_H * scale) / 2;

  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needTap, setNeedTap] = useState(false);
  const [live, setLive] = useState<Set<string>>(new Set());

  // key id -> pointers holding it (two widgets can share a key)
  // (pointer ids, or "stick:<id>" for joysticks)
  const keyHolders = useRef(new Map<string, Set<number | string>>());
  // pointer id -> widget id, for the pressed highlight
  const pointerWidget = useRef(new Map<number, string>());
  const pad = useRef<PadTouch | null>(null);
  const pending = useRef({ dx: 0, dy: 0, raf: 0 });
  const sticks = useRef(new Map<string, StickTouch>());
  // widget id -> thumb offset as a fraction of the radius
  const [knobs, setKnobs] = useState<Record<string, { x: number; y: number; dirs: Direction[] }>>({});

  // Attach the WebRTC stream to the video element.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream)
      v.play()
        .then(() => setNeedTap(false))
        .catch((err) => {
          setNeedTap(true);
          conn.log('info', `영상 자동 재생이 막혀서 탭이 필요해요 (${String(err)})`);
        });
  }, [stream]);

  // Stop iOS from scrolling / zooming / showing callouts while playing.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchstart', block, { passive: false });
    el.addEventListener('touchmove', block, { passive: false });
    return () => {
      el.removeEventListener('touchstart', block);
      el.removeEventListener('touchmove', block);
    };
  }, []);

  // Release everything if the app goes to the background.
  useEffect(() => {
    const release = () => {
      if (document.visibilityState === 'hidden') releaseAll();
    };
    document.addEventListener('visibilitychange', release);
    window.addEventListener('pagehide', releaseAll);
    return () => {
      document.removeEventListener('visibilitychange', release);
      window.removeEventListener('pagehide', releaseAll);
      releaseAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function releaseAll() {
    keyHolders.current.clear();
    pointerWidget.current.clear();
    pad.current = null;
    sticks.current.clear();
    setKnobs({});
    setLive(new Set());
    conn.send({ t: 'releaseAll' });
  }

  function setWidgetLive(id: string, on: boolean) {
    setLive((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Press / release a key for one holder. The PC only sees the first press and the last release. */
  function holdKey(key: string, holder: number | string, down: boolean): void {
    const holders = keyHolders.current.get(key) ?? new Set<number | string>();
    if (down) {
      if (holders.has(holder)) return;
      const wasDown = holders.size > 0;
      holders.add(holder);
      keyHolders.current.set(key, holders);
      if (!wasDown) conn.send({ t: 'key', key, down: true });
    } else {
      if (!holders.delete(holder)) return;
      if (holders.size === 0) {
        keyHolders.current.delete(key);
        conn.send({ t: 'key', key, down: false });
      }
    }
  }

  function capture(e: RPE) {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  // ---- key buttons ----
  const keyDown = (w: KeyWidget, e: RPE) => {
    e.preventDefault();
    capture(e);
    pointerWidget.current.set(e.pointerId, w.id);
    setWidgetLive(w.id, true);
    holdKey(w.key, e.pointerId, true);
  };

  const keyUp = (w: KeyWidget, e: RPE) => {
    if (pointerWidget.current.get(e.pointerId) !== w.id) return;
    pointerWidget.current.delete(e.pointerId);
    if (![...pointerWidget.current.values()].includes(w.id)) setWidgetLive(w.id, false);
    holdKey(w.key, e.pointerId, false);
  };

  // ---- joystick ----
  const stickUpdate = (w: StickWidget, e: RPE) => {
    const t = sticks.current.get(w.id);
    if (!t || t.pointerId !== e.pointerId) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const radius = r.width / 2;
    const dx = e.clientX - (r.left + radius);
    const dy = e.clientY - (r.top + radius);
    const dirs = stickDirections(dx, dy, radius, w.deadzone, w.eightWay);
    const holder = `stick:${w.id}`;
    for (const d of t.dirs) if (!dirs.includes(d)) holdKey(w.keys[d], holder, false);
    for (const d of dirs) if (!t.dirs.includes(d)) holdKey(w.keys[d], holder, true);
    t.dirs = dirs;
    // Knob follows the finger but stays inside the ring.
    const dist = Math.hypot(dx, dy);
    const max = radius * 0.55;
    const k = dist > max ? max / dist : 1;
    setKnobs((prev) => ({ ...prev, [w.id]: { x: (dx * k) / radius, y: (dy * k) / radius, dirs } }));
  };

  const stickDown = (w: StickWidget, e: RPE) => {
    e.preventDefault();
    if (sticks.current.has(w.id)) return; // one finger per stick
    capture(e);
    sticks.current.set(w.id, { pointerId: e.pointerId, dirs: [] });
    stickUpdate(w, e);
  };

  const stickUp = (w: StickWidget, e: RPE) => {
    const t = sticks.current.get(w.id);
    if (!t || t.pointerId !== e.pointerId) return;
    for (const d of t.dirs) holdKey(w.keys[d], `stick:${w.id}`, false);
    sticks.current.delete(w.id);
    setKnobs((prev) => {
      const next = { ...prev };
      delete next[w.id];
      return next;
    });
  };

  // ---- touchpad ----
  const flushMove = () => {
    const p = pending.current;
    p.raf = 0;
    if (p.dx === 0 && p.dy === 0) return;
    conn.send({ t: 'move', dx: Math.round(p.dx * 100) / 100, dy: Math.round(p.dy * 100) / 100 });
    p.dx = 0;
    p.dy = 0;
  };

  const padDown = (w: PadWidget, e: RPE) => {
    e.preventDefault();
    if (pad.current) return; // one finger drives the mouse
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    pad.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY, t0: performance.now(), moved: 0, w };
    setWidgetLive(w.id, true);
  };

  const padMove = (e: RPE) => {
    const t = pad.current;
    if (!t || t.pointerId !== e.pointerId) return;
    const dx = e.clientX - t.lastX;
    const dy = e.clientY - t.lastY;
    t.lastX = e.clientX;
    t.lastY = e.clientY;
    t.moved += Math.abs(dx) + Math.abs(dy);
    const k = PAD_BASE * t.w.sensitivity;
    pending.current.dx += dx * k;
    pending.current.dy += dy * k;
    if (!pending.current.raf) pending.current.raf = requestAnimationFrame(flushMove);
  };

  const padUp = (e: RPE) => {
    const t = pad.current;
    if (!t || t.pointerId !== e.pointerId) return;
    pad.current = null;
    setWidgetLive(t.w.id, false);
    flushMove();
    const quick = performance.now() - t.t0 < TAP_MAX_MS;
    if (t.w.tapToClick && quick && t.moved < TAP_MAX_MOVE) {
      conn.send({ t: 'key', key: 'MouseLeft', down: true });
      window.setTimeout(() => conn.send({ t: 'key', key: 'MouseLeft', down: false }), 40);
    }
  };

  // ---- layout ----
  const rect = (w: Widget) => {
    const { w: W, h: H } = widgetSize(w);
    return {
      left: offX + (w.x - W / 2) * scale,
      top: offY + (w.y - H / 2) * scale,
      width: W * scale,
      height: H * scale
    };
  };

  const screen = layout.widgets.find((w) => w.kind === 'screen');

  return (
    <div className="controller" ref={rootRef}>
      {screen && (
        <video
          ref={videoRef}
          className="stream"
          style={{ ...rect(screen), objectFit: screen.lockAspect ? 'contain' : 'fill' }}
          autoPlay
          playsInline
          muted
        />
      )}
      {!stream && screen && (
        <div className="stream-wait" style={rect(screen)}>PC 화면을 기다리는 중...</div>
      )}

      {layout.widgets.map((w) => {
        if (w.kind === 'key') {
          const r = rect(w);
          return (
            <button
              key={w.id}
              type="button"
              className={`key ${w.shape} ${live.has(w.id) ? 'down' : ''}`}
              aria-label={w.label}
              style={{ ...r, background: live.has(w.id) ? undefined : `rgba(255,255,255,${w.opacity})`, fontSize: Math.max(11, r.width * 0.3) }}
              onPointerDown={(e) => keyDown(w, e)}
              onPointerUp={(e) => keyUp(w, e)}
              onPointerCancel={(e) => keyUp(w, e)}
              onContextMenu={(e) => e.preventDefault()}
            >
              {w.label}
            </button>
          );
        }
        if (w.kind === 'stick') {
          const knob = knobs[w.id];
          const r = rect(w);
          const on = (d: Direction) => (knob?.dirs.includes(d) ? ' on' : '');
          return (
            <div
              key={w.id}
              className={`stick${knob ? ' down' : ''}`}
              role="application"
              aria-label="조이스틱: 끌어서 방향 입력"
              style={{ ...r, background: `rgba(255,255,255,${w.opacity})` }}
              onPointerDown={(e) => stickDown(w, e)}
              onPointerMove={(e) => stickUpdate(w, e)}
              onPointerUp={(e) => stickUp(w, e)}
              onPointerCancel={(e) => stickUp(w, e)}
            >
              <span className={`arrow up${on('up')}`}>▲</span>
              <span className={`arrow down${on('down')}`}>▼</span>
              <span className={`arrow left${on('left')}`}>◀</span>
              <span className={`arrow right${on('right')}`}>▶</span>
              <span
                className="knob"
                style={{ transform: `translate(calc(-50% + ${(knob?.x ?? 0) * r.width / 2}px), calc(-50% + ${(knob?.y ?? 0) * r.width / 2}px))` }}
              />
            </div>
          );
        }
        if (w.kind === 'pad') {
          return (
            <div
              key={w.id}
              className={`pad ${live.has(w.id) ? 'down' : ''}`}
              role="application"
              aria-label="터치패드: 문지르면 마우스 이동"
              style={{ ...rect(w), background: `rgba(255,255,255,${w.opacity})` }}
              onPointerDown={(e) => padDown(w, e)}
              onPointerMove={padMove}
              onPointerUp={padUp}
              onPointerCancel={padUp}
            >
              <span>터치패드</span>
            </div>
          );
        }
        return null;
      })}

      <div className="pill">
        <span className={`dot ${rtt === null ? '' : rtt < 60 ? 'good' : rtt < 120 ? 'ok' : 'bad'}`} />
        <span className="mono">{rtt === null ? '-' : `${Math.round(rtt)}ms`}</span>
      </div>

      {needTap && (
        <button className="tap-start" onClick={() => videoRef.current?.play().then(() => setNeedTap(false)).catch(() => {})}>
          탭해서 화면 시작
        </button>
      )}

      <div className="rotate">
        <b>폰을 가로로 돌려 주세요</b>
      </div>
    </div>
  );
}
