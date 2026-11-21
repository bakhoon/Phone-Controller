import { useState } from 'react';
import type { HostState } from '../../../preload/api';
import type { Page, StreamStatus } from '../App';
import { IconGear } from '../icons';

interface Props {
  state: HostState;
  stream: { status: StreamStatus; detail?: string };
  onNavigate: (p: Page) => void;
}

const STREAM_TEXT: Record<StreamStatus, string> = {
  idle: '화면 대기',
  starting: '화면 보내는 중',
  streaming: '화면 보내는 중',
  error: '화면을 못 보내고 있어요'
};

export function Home({ state, stream, onNavigate }: Props) {
  const [copied, setCopied] = useState(false);
  const [elevateMsg, setElevateMsg] = useState('');
  const connected = state.phone.connected;
  const address = state.localUrl.replace('http://', '');
  const remoteMode = state.qrMode === 'remote';
  const RELAY_TEXT = { off: '꺼짐', connecting: '연결하는 중', online: '준비됨', error: '연결 안 됨 (설정의 주소를 확인하세요)' } as const;

  const copy = async () => {
    await window.api.copy(state.localUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const notices: { level: 'warn' | 'err' | 'info'; text: string }[] = [];
  if (state.serverError) notices.push({ level: 'err', text: state.serverError });
  if (state.platform === 'win32' && !state.isAdmin)
    notices.push({ level: 'warn', text: '관리자 권한으로 실행하지 않았어요. 게임에 키가 안 들어갈 수 있어요.' });
  if (state.firewallOk === false)
    notices.push({ level: 'warn', text: '방화벽을 열지 못했어요. 폰이 안 붙으면 관리자 권한으로 다시 실행하세요.' });
  if (!state.inputAvailable) notices.push({ level: 'warn', text: '이 PC에서는 키 입력을 보낼 수 없어요 (Windows 전용).' });
  if (connected && state.phone.version !== state.appVersion)
    notices.push({ level: 'warn', text: '폰 화면이 예전 버전이에요. 폰에서 QR을 다시 찍어 주세요.' });
  if (connected && state.phoneLog) notices.push({ level: state.phoneLog.level === 'error' ? 'err' : 'info', text: state.phoneLog.message });

  return (
    <>
      <header className="topbar">
        <h1>폰 컨트롤러</h1>
        <nav className="row">
          <button className="btn" onClick={() => onNavigate('layout')}>버튼 배치</button>
          <button className="btn icon" aria-label="설정" onClick={() => onNavigate('settings')}>
            <IconGear />
          </button>
        </nav>
      </header>

      <main className="home">
        <div className="home-grid">
          <div className="qr">{state.qrDataUrl && <img src={state.qrDataUrl} alt={`연결 주소 QR 코드: ${state.url}`} />}</div>

          <div className="home-info">
            <h2>{connected ? '폰이 연결됐어요' : '폰 카메라로 QR을 찍으세요'}</h2>

            {state.remote.configured && (
              <div className="seg" role="group" aria-label="연결 방식">
                <button aria-pressed={!remoteMode} onClick={() => void window.api.setQrMode('local')}>같은 Wi‑Fi</button>
                <button aria-pressed={remoteMode} onClick={() => void window.api.setQrMode('remote')}>어디서나</button>
              </div>
            )}

            <div className="status">
              <span className={`dot ${connected ? 'on' : ''} ${connected && stream.status === 'error' ? 'err' : ''}`} />
              {connected ? (
                <span>
                  {state.phone.kind === 'remote' ? '인터넷으로 연결' : '같은 Wi‑Fi로 연결'}, {STREAM_TEXT[stream.status]}, 지연{' '}
                  <span className="latency">{state.rtt !== null ? `${state.rtt}ms` : '-'}</span>
                </span>
              ) : remoteMode ? (
                <span>와이파이가 달라도 돼요. 중계 서버: {RELAY_TEXT[state.remote.status]}</span>
              ) : (
                <span>PC와 같은 Wi‑Fi에서 찍어야 해요</span>
              )}
            </div>

            {!remoteMode && <div className="col" style={{ gap: 4 }}>
              <span className="label">또는 폰 브라우저에 직접 입력</span>
              <div className="row">
                <span className="addr">{address}</span>
                <button className="btn small" onClick={copy}>{copied ? '복사함' : '복사'}</button>
              </div>
              {state.addresses.length > 1 && (
                <div className="row" style={{ marginTop: 4 }}>
                  <span className="hint">다른 주소로 QR 만들기:</span>
                  {state.addresses
                    .filter((a) => a !== address.split(':')[0])
                    .map((a) => (
                      <button key={a} className="btn small" onClick={() => void window.api.useAddress(a)}>
                        {a.startsWith('100.') ? `${a} (Tailscale, 멀리서)` : a}
                      </button>
                    ))}
                </div>
              )}
            </div>}

            {!state.remote.configured && (
              <p className="hint">밖에서도 쓰려면 설정에서 "멀리서 연결"을 켜세요.</p>
            )}

            {notices.length > 0 && (
              <div className="col" style={{ gap: 8 }}>
                {notices.map((n, i) => (
                  <p key={i} className={`notice ${n.level}`} style={{ margin: 0 }}>{n.text}</p>
                ))}
              </div>
            )}

            {state.platform === 'win32' && !state.isAdmin && (
              <div className="row">
                <button
                  className="btn primary"
                  onClick={async () => {
                    setElevateMsg('');
                    const ok = await window.api.relaunchAsAdmin();
                    if (!ok) setElevateMsg('관리자 권한 요청이 취소됐어요.');
                  }}
                >
                  관리자 권한으로 다시 실행
                </button>
                {elevateMsg && <span className="hint">{elevateMsg}</span>}
              </div>
            )}

            <div className="row" style={{ marginTop: 4 }}>
              {connected && (
                <button className="btn danger" onClick={() => void window.api.disconnectPhone()}>연결 끊기</button>
              )}
              <span className="hint">v{state.appVersion}</span>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
