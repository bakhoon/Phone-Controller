import { useState } from 'react';
import type { ConnStatus } from './connection';

const DISMISS_KEY = 'pc.a2hs.dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
}

export function ConnectScreen({ status, remote, onRetry }: { status: ConnStatus; remote: boolean; onRetry: () => void }) {
  const [hideA2hs, setHideA2hs] = useState(() => readDismissed() || isStandalone());

  const dismiss = () => {
    setHideA2hs(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode */
    }
  };

  return (
    <div className="connect">
      <div className="connect-main">
        {(status === 'connecting' || status === 'connected') && (
          <>
            <svg className="spinner" width="40" height="40" viewBox="0 0 40 40" role="img" aria-label="연결 중">
              <circle cx="20" cy="20" r="16" fill="none" stroke="#d6d4ce" strokeWidth="3" />
              <path d="M20 4a16 16 0 0 1 16 16" fill="none" stroke="#1f1f1f" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <h1>PC에 연결하는 중</h1>
            <span className="muted">{location.host}</span>
          </>
        )}

        {status === 'failed' && (
          <>
            <h1>PC를 찾을 수 없어요</h1>
            <span className="sub">계속 다시 시도하고 있어요. 아래를 확인해 보세요.</span>
            {remote ? (
              <ul className="checklist">
                <li>폰이 인터넷에 연결돼 있나요?</li>
                <li>PC에서 폰 컨트롤러가 켜져 있나요?</li>
              </ul>
            ) : (
              <ul className="checklist">
                <li>PC와 폰이 같은 Wi‑Fi인가요? (카페 Wi‑Fi는 막혀 있을 수 있어요)</li>
                <li>PC에서 폰 컨트롤러가 켜져 있나요?</li>
                <li>PC 앱을 관리자 권한으로 켰나요? (방화벽이 자동으로 열려요)</li>
              </ul>
            )}
            <button className="primary" onClick={onRetry}>다시 시도</button>
          </>
        )}

        {status === 'host-offline' && (
          <>
            <h1>PC 앱이 꺼져 있어요</h1>
            <span className="sub">PC에서 폰 컨트롤러를 켜면 자동으로 연결돼요.</span>
          </>
        )}

        {status === 'denied' && (
          <>
            <h1>연결 키가 맞지 않아요</h1>
            <span className="sub">예전 QR이에요. PC 앱에 보이는 QR을 다시 찍어 주세요.</span>
          </>
        )}

        {status === 'kicked' && (
          <>
            <h1>PC에서 연결을 끊었어요</h1>
            <button className="primary" onClick={() => location.reload()}>다시 연결</button>
          </>
        )}

        {status === 'replaced' && (
          <>
            <h1>다른 폰이 연결됐어요</h1>
            <span className="sub">한 번에 폰 하나만 조작할 수 있어요.</span>
            <button className="primary" onClick={() => location.reload()}>이 폰으로 연결</button>
          </>
        )}
      </div>

      <p className="foot">폰을 가로로 돌려서 쓰세요 (v{__APP_VERSION__})</p>

      {!hideA2hs && (
        <div className="tip mint">
          <div>
            <b>홈 화면에 추가하면 전체 화면으로 열려요</b>
            <p>Safari 공유 버튼을 누르고 "홈 화면에 추가"를 고르세요.</p>
          </div>
          <button className="close" aria-label="안내 닫기" onClick={dismiss}>✕</button>
        </div>
      )}
    </div>
  );
}
