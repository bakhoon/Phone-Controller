import { useEffect, useRef, useState } from 'react';
import type { Layout } from '@shared/layout';
import { normalizeLayout } from '@shared/layout';
import { Connection, type ConnStatus } from './connection';
import { ConnectScreen } from './ConnectScreen';
import { Controller } from './Controller';

export function App() {
  const conn = useRef<Connection | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [layout, setLayout] = useState<Layout | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [rtt, setRtt] = useState<number | null>(null);

  useEffect(() => {
    const c = new Connection();
    c.onStatus = (s) => {
      setStatus(s);
      if (s !== 'connected') setRtt(null);
    };
    c.onLayout = (l) => setLayout(normalizeLayout(l));
    c.onStream = setStream;
    c.onRtt = (ms) => setRtt(ms);
    conn.current = c;
    c.start();
    return () => c.send({ t: 'releaseAll' });
  }, []);

  // Keep the screen awake while connected (Safari 16.4+).
  useEffect(() => {
    if (status !== 'connected') return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, [status]);

  if (status === 'connected' && layout && conn.current) {
    return <Controller layout={layout} conn={conn.current} stream={stream} rtt={rtt} />;
  }
  return <ConnectScreen status={status} remote={!!conn.current?.remote} onRetry={() => conn.current?.retry()} />;
}
