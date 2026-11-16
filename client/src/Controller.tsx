import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { REF_H, REF_W, widgetSize, type KeyWidget, type Layout, type PadWidget, type Widget } from '@shared/layout';
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
  const keyHolders = useRef(new Map<string, Set<number>>());
  // pointer id -> widget id, for the pressed highlight
  const pointerWidget = useRef(new Map<number, string>());
  const pad = useRef<PadTouch | null>(null);
  const pending = useRef({ dx: 0, dy: 0, raf: 0 });

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

  // ---- key buttons ----
  const keyDown = (w: KeyWidget, e: RPE) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const holders = keyHolders.current.get(w.key) ?? new Set<number>();
    const wasDown = holders.size > 0;
    holders.add(e.pointerId);
    keyHolders.current.set(w.key, holders);
    pointerWidget.current.set(e.pointerId, w.id);
    setWidgetLive(w.id, true);
    if (!wasDown) conn.send({ t: 'key', key: w.key, down: true });
  };

  const keyUp = (w: KeyWidget, e: RPE) => {
    const holders = keyHolders.current.get(w.key);
    if (!holders || !holders.has(e.pointerId)) return;
    holders.delete(e.pointerId);
    pointerWidget.current.delete(e.pointerId);
    if (![...pointerWidget.current.values()].includes(w.id)) setWidgetLive(w.id, false);
    if (holders.size === 0) {
      keyHolders.current.delete(w.key);
      conn.send({ t: 'key', key: w.key, down: false });
    }
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
        <span className="mono">{rtt === null ? '- ms' : `${Math.round(rtt)} ms`}</span>
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
