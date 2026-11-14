import { useEffect, useRef, useState } from 'react';
import type { HostState, LayoutStore, Settings } from '../../preload/api';
import { Streamer } from './rtc';
import { Home } from './pages/Home';
import { LayoutEditor } from './pages/LayoutEditor';
import { SettingsPage } from './pages/Settings';

export type Page = 'home' | 'layout' | 'settings';
export type StreamStatus = 'idle' | 'starting' | 'streaming' | 'error';

export function App() {
  const [page, setPage] = useState<Page>('home');
  const [state, setState] = useState<HostState | null>(null);
  const [layouts, setLayouts] = useState<LayoutStore | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stream, setStream] = useState<{ status: StreamStatus; detail?: string }>({ status: 'idle' });
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [lastInput, setLastInput] = useState<string>('');

  const streamer = useRef<Streamer | null>(null);
  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = settings;

  useEffect(() => {
    const s = new Streamer();
    s.onStatus = (status, detail) => setStream({ status, detail });
    streamer.current = s;

    void window.api.getState().then(setState);
    void window.api.getLayouts().then(setLayouts);
    void window.api.getSettings().then(setSettings);

    const offs = [
      window.api.onState(setState),
      window.api.onPhone((ev) => {
        if (ev === 'connected' && settingsRef.current) void s.start(settingsRef.current);
        if (ev === 'disconnected') {
          s.stop();
          setPressed(new Set());
        }
      }),
      window.api.onRtc((msg) => void s.handle(msg)),
      window.api.onKey((key, down) => {
        setPressed((prev) => {
          const next = new Set(prev);
          if (down) next.add(key);
          else next.delete(key);
          return next;
        });
        setLastInput(`${key} ${down ? '누름' : '뗌'}`);
      })
    ];
    return () => {
      offs.forEach((off) => off());
      s.stop();
    };
  }, []);

  const saveSettings = async (next: Settings) => {
    await window.api.saveSettings(next);
    setSettings(next);
    // Restart the stream so new capture settings take effect.
    if (state?.phone.connected) void streamer.current?.start(next);
  };

  const saveLayouts = async (next: LayoutStore) => {
    await window.api.saveLayouts(next);
    setLayouts(next);
  };

  if (!state || !layouts || !settings) {
    return <div className="app" />;
  }

  return (
    <div className="app">
      {page === 'home' && <Home state={state} stream={stream} onNavigate={setPage} />}
      {page === 'layout' && (
        <LayoutEditor
          store={layouts}
          state={state}
          pressed={pressed}
          lastInput={lastInput}
          onSave={saveLayouts}
          onBack={() => setPage('home')}
        />
      )}
      {page === 'settings' && <SettingsPage settings={settings} onSave={saveSettings} onBack={() => setPage('home')} />}
    </div>
  );
}
