import { useState } from 'react';
import type { HostState } from '../../../preload/api';
import type { Page, StreamStatus } from '../App';
import { IconController, IconGear, IconLayout, IconWarn } from '../icons';

interface Props {
  state: HostState;
  stream: { status: StreamStatus; detail?: string };
  onNavigate: (p: Page) => void;
}

const STREAM_TEXT: Record<StreamStatus, string> = {
  idle: '대기 중',
  starting: '화면 전송 준비 중',
  streaming: '화면 전송 중',
  error: '화면 전송 오류'
};

export function Home({ state, stream, onNavigate }: Props) {
  const [copied, setCopied] = useState(false);
  const connected = state.phone.connected;

  const copy = async () => {
    await window.api.copy(state.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <header className="topbar">
        <div className="row">
          <div className="logo"><IconController color="#0B1A13" /></div>
          <span style={{ fontSize: 18, fontWeight: 700 }}>폰 컨트롤러</span>
        </div>
        <nav className="row">
          <button className="btn" onClick={() => onNavigate('layout')}>
            <IconLayout /> 레이아웃 편집
          </button>
          <button className="btn icon" aria-label="세팅" onClick={() => onNavigate('settings')}>
            <IconGear />
          </button>
        </nav>
      </header>

      <main className="home">
        {state.serverError && (
          <div className="notice err" style={{ maxWidth: 520, width: '100%' }}>
            <IconWarn /> {state.serverError}
          </div>
        )}
        {state.platform === 'win32' && !state.isAdmin && (
          <div className="notice warn" style={{ maxWidth: 520, width: '100%' }}>
            <IconWarn />
            게임이 관리자 권한으로 실행 중이면 입력이 안 들어갈 수 있어요. 이 프로그램도 "관리자 권한으로 실행"해 주세요.
          </div>
        )}
        {state.firewallOk === false && (
          <div className="notice warn" style={{ maxWidth: 520, width: '100%' }}>
            <IconWarn />
            방화벽을 자동으로 열지 못했어요. 폰에서 접속이 안 되면 관리자 권한으로 다시 실행하거나, README의 방화벽 설정을 따라 해 주세요.
          </div>
        )}
        {!state.inputAvailable && (
          <div className="notice warn" style={{ maxWidth: 520, width: '100%' }}>
            <IconWarn />
            키 입력은 Windows에서만 실제로 보내져요. 지금은 콘솔에 기록만 해요.
          </div>
        )}

        <section className="card qr-card">
          <h2>폰 연결하기</h2>
          <div className="qr">{state.qrDataUrl && <img src={state.qrDataUrl} alt={`연결 주소 QR 코드: ${state.url}`} />}</div>
          <p className="hint" style={{ fontSize: 15, color: 'var(--sub)' }}>아이폰 카메라로 QR을 찍으세요</p>
          <div className="addr">
            <span className="mono">{state.url.replace('http://', '')}</span>
            <button className="btn small" onClick={copy}>{copied ? '복사됨' : '복사'}</button>
          </div>
          {state.addresses.length > 1 && (
            <p className="hint">안 되면 다른 주소로 시도: {state.addresses.slice(1).map((a) => `${a}:${state.port}`).join(', ')}</p>
          )}
        </section>

        <section className="card status-card" aria-label="연결 상태">
          <div className="row" style={{ gap: 14 }}>
            <span className={`dot ${connected ? 'on' : ''} ${stream.status === 'error' ? 'err' : ''}`} />
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 700 }}>{connected ? '연결됨 · iPhone' : '폰 연결 대기 중'}</span>
              <span className="hint" style={{ fontSize: 13 }}>
                {connected ? stream.detail ?? STREAM_TEXT[stream.status] : '같은 Wi‑Fi에서 QR을 찍으면 바로 연결돼요'}
              </span>
            </div>
          </div>
          {connected && (
            <div className="row" style={{ gap: 16 }}>
              <div className="col" style={{ alignItems: 'flex-end', gap: 0 }}>
                <span className="latency">{state.rtt !== null ? `${state.rtt} ms` : '- ms'}</span>
                <span className="hint" style={{ fontSize: 12 }}>왕복 지연</span>
              </div>
              <button className="btn danger" onClick={() => void window.api.disconnectPhone()}>연결 끊기</button>
            </div>
          )}
        </section>

        {connected && state.phoneLog && (
          <div className={`notice ${state.phoneLog.level === 'error' ? 'err' : 'info'}`} style={{ maxWidth: 520, width: '100%' }}>
            <IconWarn />
            폰: {state.phoneLog.message}
          </div>
        )}

        <p className="hint" style={{ textAlign: 'center' }}>
          PC와 폰이 같은 Wi‑Fi에 있어야 해요. 연결이 안 되면 Windows 방화벽에서 이 앱을 "개인 네트워크"로 허용하세요.
        </p>
      </main>
    </>
  );
}
