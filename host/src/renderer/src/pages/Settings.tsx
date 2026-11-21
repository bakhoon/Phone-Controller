import { useEffect, useState } from 'react';
import type { DisplayInfo, Settings } from '../../../preload/api';
import { IconBack } from '../icons';

interface Props {
  settings: Settings;
  onSave: (s: Settings) => Promise<void>;
  onBack: () => void;
}

export function SettingsPage({ settings, onSave, onBack }: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.api.listDisplays().then(setDisplays);
  }, []);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const portValid = Number.isInteger(draft.port) && draft.port >= 1024 && draft.port <= 65535;

  const save = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    onBack();
  };

  return (
    <>
      <header className="topbar">
        <div className="row">
          <button className="btn icon" aria-label="메인으로" onClick={onBack}><IconBack /></button>
          <h1>설정</h1>
        </div>
      </header>

      <div className="settings">
        <section>
          <h2>연결</h2>
          <div className="col">
            <label htmlFor="port">포트 번호</label>
            <input
              id="port"
              className="field mono"
              style={{ maxWidth: 200 }}
              inputMode="numeric"
              value={String(draft.port)}
              onChange={(e) => set('port', Number(e.target.value.replace(/\D/g, '')) || 0)}
            />
            {!portValid && <span className="hint" style={{ color: '#ff7a7a' }}>1024 ~ 65535 사이 숫자를 넣어 주세요</span>}
          </div>
          <p className="hint">게임이 관리자 권한으로 실행되면 이 프로그램도 관리자 권한으로 실행해야 입력이 들어가요.</p>
        </section>

        <section>
          <h2>화면 전송</h2>
          <div className="col">
            <label htmlFor="monitor">캡처할 모니터</label>
            <select id="monitor" className="field" style={{ maxWidth: 360 }} value={draft.displayId} onChange={(e) => set('displayId', e.target.value)}>
              <option value="">주 모니터</option>
              {displays.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="col">
            <span className="label">해상도</span>
            <div className="seg" role="group" aria-label="해상도">
              {([720, 1080] as const).map((h) => (
                <button key={h} aria-pressed={draft.maxHeight === h} onClick={() => set('maxHeight', h)}>{h}p</button>
              ))}
            </div>
          </div>
          <div className="col">
            <span className="label">프레임</span>
            <div className="seg" role="group" aria-label="프레임">
              {([30, 60] as const).map((f) => (
                <button key={f} aria-pressed={draft.fps === f} onClick={() => set('fps', f)}>{f}fps</button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 500 }}>지연 우선</span>
              <span className="hint">끄면 화질 우선. 게임할 때는 켜 두는 걸 추천해요</span>
            </div>
            <button className="toggle" aria-label="지연 우선" aria-pressed={draft.latencyFirst} onClick={() => set('latencyFirst', !draft.latencyFirst)} />
          </div>
        </section>

        <section>
          <h2>입력</h2>
          <div className="setting-row">
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 500 }}>연결 끊기면 모든 키 떼기</span>
              <span className="hint">키가 눌린 채로 남지 않게 하는 안전 기능이라 항상 켜져 있어요</span>
            </div>
            <button className="toggle" aria-label="연결 끊기면 모든 키 떼기 (항상 켜짐)" aria-pressed={true} disabled />
          </div>
          <p className="hint">터치패드 마우스 속도는 레이아웃 편집에서 터치패드마다 정해요.</p>
        </section>
      </div>

      <div className="savebar">
        <button className="btn" onClick={onBack}>취소</button>
        <button className="btn primary" disabled={!portValid || saving} onClick={() => void save()}>저장</button>
      </div>
    </>
  );
}
