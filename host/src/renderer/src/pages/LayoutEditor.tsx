import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  REF_H,
  REF_W,
  defaultLayout,
  newId,
  widgetSize,
  type KeyWidget,
  type Layout,
  type PadWidget,
  type ScreenWidget,
  type StickWidget,
  type Widget,
  DEFAULT_STICK_KEYS
} from '@shared/layout';
import { KEY_OPTIONS, keyLabel } from '@shared/keys';
import type { HostState, LayoutStore } from '../../../preload/api';
import { IconArrows, IconBack, IconMouse, IconPad, IconStick } from '../icons';

interface Props {
  store: LayoutStore;
  state: HostState;
  pressed: Set<string>;
  lastInput: string;
  onSave: (s: LayoutStore) => Promise<void>;
  onBack: () => void;
}

type DragMode = 'move' | 'resize';
interface Drag {
  id: string;
  mode: DragMode;
  sx: number;
  sy: number;
  scale: number;
  orig: Widget;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const BEZEL = 14;

function newKey(label: string, key: string, shape: KeyWidget['shape'], size: number, x: number, y: number): KeyWidget {
  return { id: newId(), kind: 'key', label, key, shape, size, x, y, opacity: 0.18 };
}

export function LayoutEditor({ store, state, pressed, lastInput, onSave, onBack }: Props) {
  const [items, setItems] = useState<Layout[]>(() => structuredClone(store.items));
  const [active, setActive] = useState(store.active);
  const [selId, setSelId] = useState<string | null>(null);
  const [grid, setGrid] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scale, setScale] = useState(0.85);

  const stageRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const layout = items[active];
  const sel = layout.widgets.find((w) => w.id === selId) ?? null;

  // Fit the phone preview into the available width.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const avail = el.clientWidth - BEZEL * 2 - 4;
      setScale(clamp(avail / REF_W, 0.4, 1.1));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const updateWidgets = (fn: (ws: Widget[]) => Widget[]) => {
    setItems((prev) => prev.map((l, i) => (i === active ? { ...l, widgets: fn(l.widgets) } : l)));
    setDirty(true);
  };
  const patch = (id: string, p: Partial<KeyWidget> | Partial<PadWidget> | Partial<StickWidget> | Partial<ScreenWidget>) =>
    updateWidgets((ws) => ws.map((w) => (w.id === id ? ({ ...w, ...p } as Widget) : w)));
  const add = (list: Widget[]) => {
    updateWidgets((ws) => [...ws, ...list]);
    setSelId(list[list.length - 1].id);
  };

  // ---- drag & resize ----
  const startDrag = (e: ReactPointerEvent, w: Widget, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = innerRef.current?.getBoundingClientRect();
    const s = rect && rect.width ? rect.width / REF_W : scale;
    drag.current = { id: w.id, mode, sx: e.clientX, sy: e.clientY, scale: s, orig: { ...w } };
    setSelId(w.id);
  };

  const onDrag = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.scale;
    const dy = (e.clientY - d.sy) / d.scale;
    const snap = (v: number) => (grid ? Math.round(v / 10) * 10 : Math.round(v));
    const o = d.orig;
    const { w: W, h: H } = widgetSize(o);

    if (d.mode === 'move') {
      patch(d.id, { x: clamp(snap(o.x + dx), W / 2, REF_W - W / 2), y: clamp(snap(o.y + dy), H / 2, REF_H - H / 2) });
      return;
    }
    const left = o.x - W / 2;
    const top = o.y - H / 2;
    if (o.kind === 'key' || o.kind === 'stick') {
      const [lo, hi] = o.kind === 'stick' ? [80, 240] : [32, 150];
      const size = clamp(Math.round((o.size + Math.max(dx, dy)) / 2) * 2, lo, hi);
      patch(d.id, { size, x: left + size / 2, y: top + size / 2 });
    } else if (o.kind === 'pad') {
      const nw = clamp(snap(o.w + dx), 100, 600);
      const nh = clamp(snap(o.h + dy), 60, REF_H);
      patch(d.id, { w: nw, h: nh, x: left + nw / 2, y: top + nh / 2 });
    } else {
      let nw = clamp(snap(o.w + dx), 200, REF_W);
      let nh: number;
      if (o.lockAspect) {
        nh = Math.round((nw * 9) / 16);
        if (nh > REF_H) {
          nh = REF_H;
          nw = Math.round((REF_H * 16) / 9);
        }
      } else {
        nh = clamp(snap(o.h + dy), 110, REF_H);
      }
      const l = clamp(left, 0, REF_W - nw);
      const t = clamp(top, 0, REF_H - nh);
      patch(d.id, { w: nw, h: nh, x: l + nw / 2, y: t + nh / 2 });
    }
  };

  const endDrag = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    drag.current = null;
  };

  // ---- screen helpers ----
  const setScreen = (s: ScreenWidget, nw: number, nh: number, extra: Partial<ScreenWidget> = {}) => {
    const W = clamp(nw, 200, REF_W);
    const H = clamp(nh, 110, REF_H);
    const left = clamp(s.x - W / 2, 0, REF_W - W);
    const top = clamp(s.y - H / 2, 0, REF_H - H);
    patch(s.id, { w: W, h: H, x: left + W / 2, y: top + H / 2, ...extra });
  };

  // ---- profiles ----
  const newProfile = () => {
    const l = { ...structuredClone(layout), name: `새 프로필 ${items.length + 1}` };
    setItems((prev) => [...prev, l]);
    setActive(items.length);
    setSelId(null);
    setDirty(true);
  };
  const deleteProfile = () => {
    if (items.length <= 1) return;
    if (!window.confirm(`"${layout.name}" 프로필을 삭제할까요?`)) return;
    setItems((prev) => prev.filter((_, i) => i !== active));
    setActive(0);
    setSelId(null);
    setDirty(true);
  };
  const resetProfile = () => {
    if (!window.confirm('이 프로필을 기본 메이플 배치로 되돌릴까요?')) return;
    setItems((prev) => prev.map((l, i) => (i === active ? defaultLayout(l.name) : l)));
    setSelId(null);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    await onSave({ active, items });
    setSaving(false);
    setDirty(false);
  };

  const back = () => {
    if (dirty && !window.confirm('저장하지 않은 변경이 있어요. 나갈까요?')) return;
    onBack();
  };

  return (
    <>
      <header className="topbar">
        <div className="row">
          <button className="btn icon" aria-label="메인으로" onClick={back}><IconBack /></button>
          <h1>레이아웃 편집</h1>
        </div>
        <div className="row">
          <label htmlFor="profile">프로필</label>
          {renaming ? (
            <input
              id="profile"
              className="field"
              autoFocus
              value={layout.name}
              onChange={(e) => {
                const name = e.target.value;
                setItems((prev) => prev.map((l, i) => (i === active ? { ...l, name } : l)));
                setDirty(true);
              }}
              onBlur={() => setRenaming(false)}
              onKeyDown={(e) => e.key === 'Enter' && setRenaming(false)}
            />
          ) : (
            <select id="profile" className="field" value={active} onChange={(e) => { setActive(Number(e.target.value)); setSelId(null); setDirty(true); }}>
              {items.map((l, i) => (
                <option key={i} value={i}>{l.name}</option>
              ))}
            </select>
          )}
          <button className="btn small" onClick={() => setRenaming(true)}>이름 바꾸기</button>
          <button className="btn small" onClick={newProfile}>새 프로필</button>
          <button className="btn small" onClick={resetProfile}>기본값</button>
          <button className="btn small danger" disabled={items.length <= 1} onClick={deleteProfile}>삭제</button>
          <button className="btn primary" disabled={!dirty || saving} onClick={() => void save()}>
            {dirty ? '저장하고 폰에 반영' : '저장됨'}
          </button>
        </div>
      </header>

      <div className="editor">
        <aside className="palette" aria-label="위젯 추가">
          <h2>위젯 추가</h2>
          <button onClick={() => add([newKey('A', 'KeyA', 'circle', 60, REF_W / 2, REF_H / 2)])}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', border: '1.5px solid var(--mint)', display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--mint)' }}>K</span>
            키 버튼
          </button>
          <button
            onClick={() =>
              add([
                newKey('↑', 'ArrowUp', 'square', 52, 370, 140),
                newKey('←', 'ArrowLeft', 'square', 52, 314, 196),
                newKey('→', 'ArrowRight', 'square', 52, 426, 196),
                newKey('↓', 'ArrowDown', 'square', 52, 370, 252)
              ])
            }
          >
            <IconArrows color="var(--mint)" /> 방향키 4개
          </button>
          <button
            onClick={() =>
              add([
                {
                  id: newId(),
                  kind: 'stick',
                  size: 150,
                  x: 130,
                  y: REF_H - 100,
                  opacity: 0.16,
                  eightWay: true,
                  deadzone: 0.25,
                  keys: { ...DEFAULT_STICK_KEYS }
                }
              ])
            }
          >
            <IconStick color="var(--mint)" />
            <span>
              조이스틱
              <br />
              <span className="hint" style={{ fontSize: 12 }}>돌려서 8방향 이동</span>
            </span>
          </button>
          <button onClick={() => add([newKey('클릭', 'MouseLeft', 'circle', 70, REF_W / 2, REF_H / 2)])}>
            <IconMouse color="var(--mint)" /> 마우스 클릭
          </button>
          <button
            onClick={() =>
              add([{ id: newId(), kind: 'pad', w: 220, h: 110, x: REF_W / 2, y: REF_H / 2, opacity: 0.12, sensitivity: 1, tapToClick: true }])
            }
          >
            <IconPad color="var(--mint)" />
            <span>
              터치패드
              <br />
              <span className="hint" style={{ fontSize: 12 }}>문질러서 마우스 이동</span>
            </span>
          </button>
          <p className="hint" style={{ marginTop: 8, fontSize: 12 }}>
            위젯과 PC 화면을 끌어서 옮기고, 선택한 것의 오른쪽 아래 핸들을 끌어서 크기를 바꿔요. 격자가 켜져 있으면 10px 단위로 맞춰져요.
          </p>
        </aside>

        <section className="stage" ref={stageRef} aria-label="폰 화면 미리보기">
          <div className="bezel">
            <div
              className="screen-area"
              style={{ width: REF_W * scale, height: REF_H * scale }}
              onPointerDown={() => setSelId(null)}
            >
              <div ref={innerRef} className="screen-inner" style={{ width: REF_W, height: REF_H, transform: `scale(${scale})` }}>
                {grid && <div className="grid-bg" />}
                {layout.widgets.map((w) => (
                  <WidgetView
                    key={w.id}
                    w={w}
                    selected={w.id === selId}
                    live={
                      (w.kind === 'key' && pressed.has(w.key)) ||
                      (w.kind === 'stick' && Object.values(w.keys).some((k) => pressed.has(k)))
                    }
                    onDown={(e) => startDrag(e, w, 'move')}
                    onHandleDown={(e) => startDrag(e, w, 'resize')}
                    onMove={onDrag}
                    onUp={endDrag}
                    onFocus={() => setSelId(w.id)}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="statusbar">
            <span className="row" style={{ gap: 8 }}>
              <span className={`dot ${state.phone.connected ? 'on' : ''}`} style={{ width: 8, height: 8, boxShadow: 'none' }} />
              {state.phone.connected ? '폰 연결됨' : '폰 연결 안 됨'}
            </span>
            {state.phone.connected && <span className="mono" style={{ color: 'var(--mint)' }}>{state.rtt ?? '-'} ms</span>}
            <span style={{ color: 'var(--sub)' }}>
              마지막 입력: <b className="mono" style={{ color: 'var(--text)' }}>{lastInput || '없음'}</b>
            </span>
            <button className="btn small" onClick={() => setGrid((g) => !g)}>격자 {grid ? '끄기' : '켜기'}</button>
          </div>
          <p className="hint">폰에서 버튼을 누르면 여기서 민트색으로 표시돼요.</p>
        </section>

        <aside className="card panel" aria-label="선택한 위젯 설정">
          {!sel && (
            <>
              <h2>선택한 위젯 없음</h2>
              <p className="hint" style={{ fontSize: 14 }}>가운데 폰 화면에서 위젯을 누르거나, 왼쪽에서 새 위젯을 추가하세요.</p>
            </>
          )}
          {sel?.kind === 'key' && <KeyPanel w={sel} patch={(p) => patch(sel.id, p)} />}
          {sel?.kind === 'pad' && <PadPanel w={sel} patch={(p) => patch(sel.id, p)} />}
          {sel?.kind === 'stick' && <StickPanel w={sel} patch={(p) => patch(sel.id, p)} />}
          {sel?.kind === 'screen' && (
            <ScreenPanel
              w={sel}
              setSize={(nw, nh, extra) => setScreen(sel, nw, nh, extra)}
              fill={() => patch(sel.id, { w: REF_W, h: REF_H, x: REF_W / 2, y: REF_H / 2, lockAspect: false })}
              center={() => patch(sel.id, { x: REF_W / 2, y: REF_H / 2 })}
            />
          )}
          {sel && sel.kind !== 'screen' && (
            <>
              <Range
                id="opacity"
                label="투명도"
                value={Math.round(sel.opacity * 100)}
                unit="%"
                min={5}
                max={80}
                onChange={(v) => patch(sel.id, { opacity: v / 100 })}
              />
              <button
                className="btn danger"
                onClick={() => {
                  updateWidgets((ws) => ws.filter((w) => w.id !== sel.id));
                  setSelId(null);
                }}
              >
                이 위젯 삭제
              </button>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

interface WidgetViewProps {
  w: Widget;
  selected: boolean;
  live: boolean;
  onDown: (e: ReactPointerEvent) => void;
  onHandleDown: (e: ReactPointerEvent) => void;
  onMove: (e: ReactPointerEvent) => void;
  onUp: (e: ReactPointerEvent) => void;
  onFocus: () => void;
}

function WidgetView({ w, selected, live, onDown, onHandleDown, onMove, onUp, onFocus }: WidgetViewProps) {
  const { w: W, h: H } = widgetSize(w);
  const z = w.kind === 'screen' ? 0 : selected ? 2 : 1;
  let faceStyle: CSSProperties = {};
  let content: ReactNode = null;
  let aria = '';

  if (w.kind === 'key') {
    faceStyle = {
      borderRadius: w.shape === 'circle' ? '50%' : 14,
      background: selected ? 'rgba(61,220,151,0.3)' : `rgba(255,255,255,${w.opacity})`,
      fontSize: Math.max(12, Math.round(w.size * 0.3))
    };
    content = w.label;
    aria = `${w.label} 버튼 (${keyLabel(w.key)})`;
  } else if (w.kind === 'stick') {
    faceStyle = { borderRadius: '50%', background: selected ? 'rgba(61,220,151,0.25)' : `rgba(255,255,255,${w.opacity})` };
    const arrow = (style: CSSProperties, ch: string) => (
      <span aria-hidden="true" style={{ position: 'absolute', fontSize: 12, color: 'rgba(255,255,255,0.6)', ...style }}>{ch}</span>
    );
    content = (
      <>
        {arrow({ top: '8%', left: '50%', transform: 'translateX(-50%)' }, '▲')}
        {arrow({ bottom: '8%', left: '50%', transform: 'translateX(-50%)' }, '▼')}
        {arrow({ left: '8%', top: '50%', transform: 'translateY(-50%)' }, '◀')}
        {arrow({ right: '8%', top: '50%', transform: 'translateY(-50%)' }, '▶')}
        <span aria-hidden="true" style={{ width: '42%', height: '42%', borderRadius: '50%', background: 'rgba(255,255,255,0.45)', border: '1.5px solid rgba(255,255,255,0.7)' }} />
      </>
    );
    aria = `조이스틱 (${w.eightWay ? '8방향' : '4방향'})`;
  } else if (w.kind === 'pad') {
    faceStyle = { background: selected ? 'rgba(61,220,151,0.25)' : `rgba(255,255,255,${w.opacity})` };
    content = (
      <>
        <IconPad size={22} />
        <span>터치패드</span>
      </>
    );
    aria = '터치패드 (마우스 이동)';
  } else {
    content = (
      <>
        <span aria-hidden="true" style={{ position: 'absolute', left: '10%', top: '64%', width: '34%', height: '3.5%', background: '#343A4F', borderRadius: 4 }} />
        <span aria-hidden="true" style={{ position: 'absolute', left: '54%', top: '44%', width: '27%', height: '3.5%', background: '#343A4F', borderRadius: 4 }} />
        <span aria-hidden="true" style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: '11%', background: '#2C3244' }} />
        <span>PC 화면 (스트리밍)</span>
      </>
    );
    aria = 'PC 화면 영역';
  }

  return (
    <div
      className={`w ${w.kind} ${selected ? 'sel' : ''} ${live ? 'live' : ''}`}
      style={{ left: w.x - W / 2, top: w.y - H / 2, width: W, height: H, zIndex: z }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <button type="button" className="face" style={faceStyle} aria-label={aria} onFocus={onFocus}>
        {content}
      </button>
      {selected && (
        <span
          className="handle"
          aria-label="크기 조절"
          onPointerDown={onHandleDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      )}
    </div>
  );
}

function Range(props: { id: string; label: string; value: number; unit: string; min: number; max: number; step?: number; display?: string; onChange: (v: number) => void }) {
  return (
    <div className="col">
      <div className="kv">
        <label htmlFor={props.id}>{props.label}</label>
        <span className="v">{props.display ?? `${props.value}${props.unit}`}</span>
      </div>
      <input
        id={props.id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting-row">
      <div className="col" style={{ gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
        <span className="hint" style={{ fontSize: 12 }}>{hint}</span>
      </div>
      <button className="toggle" aria-label={label} aria-pressed={on} onClick={() => onChange(!on)} />
    </div>
  );
}

function KeyPanel({ w, patch }: { w: KeyWidget; patch: (p: Partial<KeyWidget>) => void }) {
  return (
    <>
      <div className="kv" style={{ alignItems: 'center' }}>
        <h2>키 버튼</h2>
        <span className="chip">{keyLabel(w.key)}</span>
      </div>
      <div className="col">
        <label htmlFor="key">누르면 보낼 키</label>
        <select
          id="key"
          className="field mono"
          value={w.key}
          onChange={(e) => {
            const prevLabel = keyLabel(w.key);
            const next = e.target.value;
            // If the label still matches the old key, follow the new key.
            patch(w.label === prevLabel ? { key: next, label: keyLabel(next) } : { key: next });
          }}
        >
          {KEY_OPTIONS.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </select>
      </div>
      <div className="col">
        <label htmlFor="label">버튼에 보일 글자</label>
        <input id="label" className="field" value={w.label} maxLength={8} onChange={(e) => patch({ label: e.target.value })} />
      </div>
      <Range id="size" label="크기" value={w.size} unit=" px" min={32} max={150} step={2} onChange={(v) => patch({ size: v })} />
      <div className="col">
        <span className="label">모양</span>
        <div className="seg" role="group" aria-label="모양" style={{ display: 'flex' }}>
          <button style={{ flex: 1 }} aria-pressed={w.shape === 'circle'} onClick={() => patch({ shape: 'circle' })}>원</button>
          <button style={{ flex: 1 }} aria-pressed={w.shape === 'square'} onClick={() => patch({ shape: 'square' })}>사각형</button>
        </div>
      </div>
    </>
  );
}

function StickPanel({ w, patch }: { w: StickWidget; patch: (p: Partial<StickWidget>) => void }) {
  const dirs: { d: keyof StickWidget['keys']; label: string }[] = [
    { d: 'up', label: '위' },
    { d: 'down', label: '아래' },
    { d: 'left', label: '왼쪽' },
    { d: 'right', label: '오른쪽' }
  ];
  return (
    <>
      <div className="col" style={{ gap: 4 }}>
        <h2>조이스틱</h2>
        <p className="hint">엄지로 끌어서 돌리면 방향키가 눌려요. 대각선은 두 키가 같이 눌려요.</p>
      </div>
      <Range id="stsize" label="크기" value={w.size} unit=" px" min={80} max={240} step={2} onChange={(v) => patch({ size: v })} />
      <Toggle label="8방향" hint="끄면 위/아래/왼쪽/오른쪽 4방향만" on={w.eightWay} onChange={(v) => patch({ eightWay: v })} />
      <Range
        id="dead"
        label="가운데 무반응 영역"
        value={Math.round(w.deadzone * 100)}
        unit="%"
        min={5}
        max={60}
        onChange={(v) => patch({ deadzone: v / 100 })}
      />
      <div className="col" style={{ gap: 8 }}>
        <span className="label">방향별 키</span>
        {dirs.map(({ d, label }) => (
          <div key={d} className="row" style={{ flexWrap: 'nowrap' }}>
            <label htmlFor={`stk-${d}`} style={{ width: 52 }}>{label}</label>
            <select
              id={`stk-${d}`}
              className="field mono"
              style={{ flex: 1, minWidth: 0 }}
              value={w.keys[d]}
              onChange={(e) => patch({ keys: { ...w.keys, [d]: e.target.value } })}
            >
              {KEY_OPTIONS.map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </>
  );
}

function PadPanel({ w, patch }: { w: PadWidget; patch: (p: Partial<PadWidget>) => void }) {
  return (
    <>
      <div className="col" style={{ gap: 4 }}>
        <h2>터치패드</h2>
        <p className="hint">노트북 터치패드처럼 손가락으로 문지르면 PC 마우스가 움직여요.</p>
      </div>
      <Range id="padw" label="가로" value={w.w} unit=" px" min={100} max={600} step={10} onChange={(v) => patch({ w: v })} />
      <Range id="padh" label="세로" value={w.h} unit=" px" min={60} max={REF_H} step={10} onChange={(v) => patch({ h: v })} />
      <Range
        id="sens"
        label="마우스 속도"
        value={Math.round(w.sensitivity * 10)}
        unit=""
        display={`${w.sensitivity.toFixed(1)}x`}
        min={2}
        max={40}
        onChange={(v) => patch({ sensitivity: v / 10 })}
      />
      <Toggle label="탭하면 클릭" hint="한 번 톡 = 왼쪽 클릭" on={w.tapToClick} onChange={(v) => patch({ tapToClick: v })} />
    </>
  );
}

function ScreenPanel({
  w,
  setSize,
  fill,
  center
}: {
  w: ScreenWidget;
  setSize: (nw: number, nh: number, extra?: Partial<ScreenWidget>) => void;
  fill: () => void;
  center: () => void;
}) {
  return (
    <>
      <div className="col" style={{ gap: 4 }}>
        <h2>PC 화면</h2>
        <p className="hint">폰에서 게임 화면이 보일 위치와 크기예요. 줄여서 한쪽에 두고 남은 공간에 버튼을 놓을 수도 있어요.</p>
      </div>
      <Range
        id="scrw"
        label="가로"
        value={Math.round(w.w)}
        unit=" px"
        min={200}
        max={REF_W}
        step={2}
        onChange={(v) => setSize(v, w.lockAspect ? Math.round((v * 9) / 16) : w.h)}
      />
      <Range
        id="scrh"
        label="세로"
        value={Math.round(w.h)}
        unit=" px"
        min={110}
        max={REF_H}
        onChange={(v) => setSize(w.lockAspect ? Math.round((v * 16) / 9) : w.w, v)}
      />
      <Toggle
        label="16:9 비율 유지"
        hint="끄면 화면이 늘어날 수 있어요"
        on={w.lockAspect}
        onChange={(lock) => {
          let W = w.w;
          let H = w.h;
          if (lock) {
            H = Math.round((W * 9) / 16);
            if (H > REF_H) {
              H = REF_H;
              W = Math.round((REF_H * 16) / 9);
            }
          }
          setSize(W, H, { lockAspect: lock });
        }}
      />
      <div className="row">
        <button className="btn" style={{ flex: 1 }} onClick={fill}>꽉 채우기</button>
        <button className="btn" style={{ flex: 1 }} onClick={center}>가운데로</button>
      </div>
    </>
  );
}
