import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain, screen, session } from 'electron';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import QRCode from 'qrcode';
import type { HostToPhone } from '@shared/protocol';
import { InputController } from './input';
import { ControllerServer } from './server';
import { lanAddresses } from './network';
import { ensureFirewallRule } from './firewall';
import { relaunchAsAdmin } from './elevate';
import { loadLayouts, loadSettings, saveLayouts, saveSettings, type LayoutStore, type Settings } from './store';
import type { HostState } from '../preload/api';

let win: BrowserWindow | null = null;
let settings: Settings = loadSettings();

// Chromium hides local IPs behind random .local (mDNS) names in WebRTC.
// iPhones often can't resolve those on home routers, so send real LAN IPs.
const disabledFeatures = ['WebRtcHideLocalIpsWithMdns'];
// Some PCs fail to start Windows Graphics Capture ("Could not start video source").
// Compatibility mode falls back to the older DXGI capturer, optionally without the GPU.
if (settings.captureMode !== 'auto') {
  disabledFeatures.push('AllowWgcScreenCapturer', 'AllowWgcDesktopCapturer', 'AllowWgcWindowCapturer');
}
if (settings.captureMode === 'compat-nogpu') app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-features', disabledFeatures.join(','));
let layouts: LayoutStore = loadLayouts();

const input = new InputController();
const clientDir = app.isPackaged
  ? join(process.resourcesPath, 'client')
  : join(app.getAppPath(), '..', 'client', 'dist');

const server = new ControllerServer(clientDir, input, () => ({ t: 'layout', layout: layouts.items[layouts.active] }));

const state: HostState = {
  url: '',
  addresses: [],
  port: settings.port,
  qrDataUrl: '',
  serverError: null,
  phone: { connected: false, ua: '', address: '', version: '' },
  appVersion: app.getVersion(),
  rtt: null,
  inputAvailable: input.available,
  isAdmin: false,
  captureMode: settings.captureMode,
  firewallOk: null,
  phoneLog: null,
  platform: process.platform
};

function pushState(): void {
  win?.webContents.send('state', state);
}

let chosenAddress = '';

async function refreshAddress(): Promise<void> {
  state.addresses = lanAddresses();
  state.port = settings.port;
  const host = state.addresses.includes(chosenAddress) ? chosenAddress : (state.addresses[0] ?? 'localhost');
  state.url = `http://${host}:${settings.port}`;
  state.qrDataUrl = await QRCode.toDataURL(state.url, {
    margin: 1,
    width: 320,
    color: { dark: '#12141C', light: '#FFFFFF' }
  });
}

async function startServer(): Promise<void> {
  state.serverError = null;
  try {
    // Retry briefly: right after "restart as admin" the old instance may still hold the port.
    for (let attempt = 0; ; attempt++) {
      try {
        await server.start(settings.port);
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt >= 6) throw err;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    state.serverError =
      e.code === 'EADDRINUSE'
        ? `포트 ${settings.port}을(를) 다른 프로그램이 쓰고 있어요. 세팅에서 포트를 바꿔 주세요.`
        : `서버를 시작하지 못했어요: ${e.message}`;
  }
  // Let the phone through Windows Firewall (needs admin rights).
  if (process.platform === 'win32') {
    state.firewallOk = state.isAdmin ? await ensureFirewallRule(settings.port) : false;
  }
  await refreshAddress();
  pushState();
}

function checkAdmin(): Promise<void> {
  if (process.platform !== 'win32') return Promise.resolve();
  // "net session" only succeeds with administrator rights.
  return new Promise((resolve) => {
    execFile('net', ['session'], { windowsHide: true }, (err) => {
      state.isAdmin = !err;
      pushState();
      resolve();
    });
  });
}

server.on('connected', (info) => {
  state.phone = { connected: true, ua: info.ua, address: info.address, version: info.version };
  pushState();
  win?.webContents.send('phone', 'connected');
});
server.on('disconnected', () => {
  state.phone = { connected: false, ua: '', address: '', version: '' };
  state.rtt = null;
  state.phoneLog = null;
  pushState();
  win?.webContents.send('phone', 'disconnected');
});
server.on('stats', ({ rtt }) => {
  state.rtt = Number.isFinite(rtt) ? Math.round(rtt) : null;
  pushState();
});
server.on('log', (entry) => {
  console.log(`[phone] ${entry.level}: ${entry.message}`);
  state.phoneLog = entry;
  pushState();
});
server.on('rtc', (msg) => win?.webContents.send('rtc', msg));
server.on('error', (e) => console.error('[server]', e));
input.onKey = (key, down) => win?.webContents.send('key', key, down);

function registerIpc(): void {
  ipcMain.handle('state:get', () => state);
  ipcMain.handle('layouts:get', () => layouts);
  ipcMain.handle('layouts:save', (_e, store: LayoutStore) => {
    layouts = store;
    saveLayouts(layouts);
    server.send({ t: 'layout', layout: layouts.items[layouts.active] });
  });
  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:save', async (_e, next: Settings) => {
    const portChanged = next.port !== settings.port;
    settings = next;
    saveSettings(settings);
    if (portChanged) {
      await server.stop();
      await startServer();
    }
  });
  ipcMain.handle('displays:list', () =>
    screen.getAllDisplays().map((d, i) => ({
      id: String(d.id),
      name: `모니터 ${i + 1}${d.id === screen.getPrimaryDisplay().id ? ' (주 모니터)' : ''} ${d.size.width * d.scaleFactor}×${d.size.height * d.scaleFactor}`
    }))
  );
  ipcMain.handle('phone:disconnect', async () => {
    // Restarting the server drops the phone and releases every key.
    await server.stop();
    await startServer();
  });
  ipcMain.handle('clipboard:write', (_e, text: string) => clipboard.writeText(text));
  ipcMain.handle('app:restartCapture', async (_e, mode: Settings['captureMode']) => {
    settings = { ...settings, captureMode: mode };
    saveSettings(settings);
    await server.stop();
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle('capture:sourceId', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return (sources.find((s) => s.display_id === settings.displayId) ?? sources[0])?.id ?? null;
  });
  ipcMain.handle('qr:use', async (_e, address: string) => {
    chosenAddress = address;
    await refreshAddress();
    pushState();
  });
  ipcMain.handle('app:relaunchAdmin', async () => {
    const ok = await relaunchAsAdmin();
    if (ok) {
      await server.stop();
      app.quit();
    }
    return ok;
  });
  ipcMain.on('rtc:send', (_e, msg: HostToPhone) => server.send(msg));
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#12141C',
    title: 'Phone Controller',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      // Keep streaming even when the window is minimized or behind the game.
      backgroundThrottling: false
    }
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  win.on('closed', () => (win = null));
}

app.whenReady().then(async () => {
  // The renderer calls getDisplayMedia(); answer with the monitor chosen in settings.
  session.defaultSession.setDisplayMediaRequestHandler((_req, callback) => {
    void desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      const chosen = sources.find((s) => s.display_id === settings.displayId) ?? sources[0];
      callback(chosen ? { video: chosen } : {});
    });
  });

  registerIpc();
  createWindow();
  await checkAdmin();
  await startServer();
});

app.on('window-all-closed', () => {
  void server.stop().finally(() => app.quit());
});
