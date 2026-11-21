import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain, screen, session } from 'electron';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import QRCode from 'qrcode';
import type { HostToPhone, PhoneToHost } from '@shared/protocol';
import { InputController } from './input';
import { PhoneHub } from './hub';
import { ControllerServer } from './server';
import { RelayClient } from './relay';
import { lanAddresses } from './network';
import { ensureFirewallRule } from './firewall';
import { relaunchAsAdmin } from './elevate';
import { loadLayouts, loadSettings, randomToken, saveLayouts, saveSettings, type LayoutStore, type Settings } from './store';
import type { HostState, QrMode } from '../preload/api';

// Chromium hides local IPs behind random .local (mDNS) names in WebRTC.
// iPhones often can't resolve those on home routers, so send real LAN IPs.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

let win: BrowserWindow | null = null;
let settings: Settings = loadSettings();
let layouts: LayoutStore = loadLayouts();

const input = new InputController();
const clientDir = app.isPackaged
  ? join(process.resourcesPath, 'client')
  : join(app.getAppPath(), '..', 'client', 'dist');

const hub = new PhoneHub(input, () => ({ t: 'layout', layout: layouts.items[layouts.active] }));
const server = new ControllerServer(clientDir, hub);
const relay = new RelayClient(hub);

const state: HostState = {
  url: '',
  localUrl: '',
  qrMode: settings.relayUrl ? 'remote' : 'local',
  remote: { configured: !!settings.relayUrl, status: 'off' },
  addresses: [],
  port: settings.port,
  qrDataUrl: '',
  serverError: null,
  phone: { connected: false, ua: '', address: '', version: '', kind: '' },
  appVersion: app.getVersion(),
  rtt: null,
  inputAvailable: input.available,
  isAdmin: false,
  firewallOk: null,
  phoneLog: null,
  platform: process.platform
};

function pushState(): void {
  win?.webContents.send('state', state);
}

let chosenAddress = '';

function remoteUrl(): string {
  const base = settings.relayUrl.replace(/\/+$/, '');
  return `${base}/#r=${settings.roomId}&k=${settings.roomKey}`;
}

async function refreshAddress(): Promise<void> {
  state.addresses = lanAddresses();
  state.port = settings.port;
  const host = state.addresses.includes(chosenAddress) ? chosenAddress : (state.addresses[0] ?? 'localhost');
  state.localUrl = `http://${host}:${settings.port}`;
  state.remote.configured = !!settings.relayUrl;
  if (!state.remote.configured) state.qrMode = 'local';
  state.url = state.qrMode === 'remote' ? remoteUrl() : state.localUrl;
  state.qrDataUrl = await QRCode.toDataURL(state.url, {
    margin: 1,
    width: 320,
    errorCorrectionLevel: 'L',
    color: { dark: '#1F1F1F', light: '#FFFFFF' }
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
        ? `포트 ${settings.port}을(를) 다른 프로그램이 쓰고 있어요. 설정에서 포트를 바꿔 주세요.`
        : `서버를 시작하지 못했어요: ${e.message}`;
  }
  // Let the phone through Windows Firewall (needs admin rights).
  if (process.platform === 'win32') {
    state.firewallOk = state.isAdmin ? await ensureFirewallRule(settings.port) : false;
  }
  await refreshAddress();
  pushState();
}

function startRelay(): void {
  if (settings.relayUrl) relay.start(settings.relayUrl, settings.roomId, settings.roomKey);
  else relay.stop();
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

hub.on('connected', (info) => {
  state.phone = { connected: true, ua: info.ua, address: info.address, version: info.version, kind: info.kind };
  state.phoneLog = null;
  pushState();
  win?.webContents.send('phone', 'connected');
});
hub.on('disconnected', () => {
  state.phone = { connected: false, ua: '', address: '', version: '', kind: '' };
  state.rtt = null;
  state.phoneLog = null;
  pushState();
  win?.webContents.send('phone', 'disconnected');
});
hub.on('stats', ({ rtt }) => {
  state.rtt = Number.isFinite(rtt) ? Math.round(rtt) : null;
  pushState();
});
hub.on('log', (entry) => {
  console.log(`[phone] ${entry.level}: ${entry.message}`);
  state.phoneLog = entry;
  pushState();
});
hub.on('rtc', (msg) => win?.webContents.send('rtc', msg));
relay.on('status', (s) => {
  state.remote.status = s;
  pushState();
});
input.onKey = (key, down) => win?.webContents.send('key', key, down);

function registerIpc(): void {
  ipcMain.handle('state:get', () => state);
  ipcMain.handle('layouts:get', () => layouts);
  ipcMain.handle('layouts:save', (_e, store: LayoutStore) => {
    layouts = store;
    saveLayouts(layouts);
    hub.send({ t: 'layout', layout: layouts.items[layouts.active] });
  });
  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:save', async (_e, next: Settings) => {
    const portChanged = next.port !== settings.port;
    const relayChanged = next.relayUrl !== settings.relayUrl;
    const hadRelay = !!settings.relayUrl;
    settings = { ...next, roomId: settings.roomId, roomKey: settings.roomKey };
    saveSettings(settings);
    if (relayChanged) {
      // Turning remote on for the first time: show the "anywhere" QR.
      if (!hadRelay && settings.relayUrl) state.qrMode = 'remote';
      startRelay();
    }
    if (portChanged) {
      await server.stop();
      await startServer();
    } else {
      await refreshAddress();
      pushState();
    }
  });
  ipcMain.handle('room:newKey', async () => {
    settings = { ...settings, roomKey: randomToken(18) };
    saveSettings(settings);
    hub.disconnect();
    startRelay();
    await refreshAddress();
    pushState();
    return settings;
  });
  ipcMain.handle('displays:list', () =>
    screen.getAllDisplays().map((d, i) => ({
      id: String(d.id),
      name: `모니터 ${i + 1}${d.id === screen.getPrimaryDisplay().id ? ' (주 모니터)' : ''} ${d.size.width * d.scaleFactor}×${d.size.height * d.scaleFactor}`
    }))
  );
  ipcMain.handle('phone:disconnect', () => hub.disconnect());
  ipcMain.handle('clipboard:write', (_e, text: string) => clipboard.writeText(text));
  ipcMain.handle('qr:use', async (_e, address: string) => {
    chosenAddress = address;
    state.qrMode = 'local';
    await refreshAddress();
    pushState();
  });
  ipcMain.handle('qr:mode', async (_e, mode: QrMode) => {
    state.qrMode = mode;
    await refreshAddress();
    pushState();
  });
  ipcMain.handle('app:relaunchAdmin', async () => {
    const ok = await relaunchAsAdmin();
    if (ok) {
      relay.stop();
      await server.stop();
      app.quit();
    }
    return ok;
  });
  ipcMain.on('rtc:send', (_e, msg: HostToPhone) => hub.send(msg));
  ipcMain.on('phone:dc', (_e, msg: PhoneToHost) => hub.fromDataChannel(msg));
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#ECEBE7',
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
  startRelay();
});

app.on('window-all-closed', () => {
  relay.stop();
  hub.dispose();
  void server.stop().finally(() => app.quit());
});
