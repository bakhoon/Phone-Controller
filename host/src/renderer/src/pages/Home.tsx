import { useEffect, useRef, useState } from 'react';
import { captureScreen } from '../rtc';
import type { CaptureMode, HostState } from '../../../preload/api';
import type { Page, StreamStatus } from '../App';
import { IconGear } from '../icons';

interface Props {
  state: HostState;
  stream: { status: StreamStatus; detail?: string };
  onNavigate: (p: Page) => void;
}

const NEXT_CAPTURE: Partial<Record<CaptureMode, { mode: CaptureMode; label: string }>> = {
  auto: { mode: 'compat', label: '호환 모드로 다시 시작' },
  compat: { mode: 'compat-nogpu', label: 'GPU 끄고 다시 시작' }
};

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
  const address = state.url.replace('http://', '');

  const copy = async () => {
    await window.api.copy(state.url);
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
  if (connected && stream.status === 'error' && stream.detail) notices.push({ level: 'err', text: stream.detail });
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

            <div className="status">
              <span className={`dot ${connected ? 'on' : ''} ${connected && stream.status === 'error' ? 'err' : ''}`} />
              {connected ? (
                <span>
                  {STREAM_TEXT[stream.status]}, 지연 <span className="latency">{state.rtt !== null ? `${state.rtt}ms` : '-'}</span>
                </span>
              ) : (
                <span>PC와 같은 Wi‑Fi에서 찍어야 해요</span>
              )}
            </div>

            <div className="col" style={{ gap: 4 }}>
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
            </div>

            {notices.length > 0 && (
              <div className="col" style={{ gap: 8 }}>
                {notices.map((n, i) => (
                  <p key={i} className={`notice ${n.level}`} style={{ margin: 0 }}>{n.text}</p>
                ))}
              </div>
            )}

            {connected && stream.status === 'error' && stream.detail?.startsWith('PC 화면을 캡처') && (
              <div className="col" style={{ gap: 6 }}>
                {NEXT_CAPTURE[state.captureMode] ? (
                  <>
                    <p className="hint">이 PC에서 기본 캡처 방식이 안 되는 경우가 있어요. 다른 방식으로 다시 켜 볼게요.</p>
                    <div className="row">
                      <button className="btn primary" onClick={() => void window.api.restartWithCaptureMode(NEXT_CAPTURE[state.captureMode]!.mode)}>
                        {NEXT_CAPTURE[state.captureMode]!.label}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="hint">모든 캡처 방식을 써 봤어요. 다른 화면 녹화 프로그램이 켜져 있으면 끄고, 그래픽 드라이버를 업데이트해 보세요.</p>
                )}
              </div>
            )}

            {state.gpuPref === 'high' && (
              <div className="col" style={{ gap: 6 }}>
                <p className="notice warn" style={{ margin: 0 }}>
                  이 앱이 Windows 그래픽 설정에서 고성능 GPU로 지정돼 있어요. 그래픽 카드가 두 개인 PC에서는 이러면 화면 캡처가 안 될 수 있어요.
                </p>
                <div className="row">
                  <button
                    className="btn primary"
                    onClick={async () => {
                      const ok = await window.api.fixGpu();
                      if (!ok) setElevateMsg('바꾸지 못했어요. Windows 설정 > 디스플레이 > 그래픽에서 직접 바꿔 주세요.');
                    }}
                  >
                    절전 GPU로 바꾸고 다시 시작
                  </button>
                </div>
              </div>
            )}

            <CaptureTest />

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

/** Try capturing the PC screen right here, without a phone. */
function CaptureTest() {
  const [status, setStatus] = useState<'idle' | 'running' | 'ok' | 'fail'>('idle');
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus('idle');
  };
  useEffect(() => stop, []);

  const run = async () => {
    stop();
    setStatus('running');
    setError('');
    try {
      const settings = await window.api.getSettings();
      const stream = await captureScreen(settings);
      streamRef.current = stream;
      setStatus('ok');
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch (err) {
      setStatus('fail');
      setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    }
  };

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row">
        {status === 'ok' ? (
          <button className="btn" onClick={stop}>테스트 끝내기</button>
        ) : (
          <button className="btn" disabled={status === 'running'} onClick={() => void run()}>
            {status === 'running' ? '캡처 시도 중...' : '화면 캡처 테스트 (폰 없이)'}
          </button>
        )}
      </div>
      {status === 'ok' && (
        <>
          <p className="notice info" style={{ margin: 0, color: 'var(--ok)' }}>화면 캡처가 돼요. 폰에서 안 나오면 네트워크 쪽 문제예요.</p>
          <video ref={videoRef} muted playsInline style={{ width: 320, borderRadius: 8, border: '1px solid var(--line)', background: '#000' }} />
        </>
      )}
      {status === 'fail' && <p className="notice err" style={{ margin: 0 }}>캡처 실패: {error}</p>}
    </div>
  );
}
