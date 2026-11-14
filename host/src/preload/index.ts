import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { HostApi } from './api';

function on<T extends unknown[]>(channel: string, cb: (...args: T) => void) {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as T));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: HostApi = {
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (cb) => on('state', cb),
  getLayouts: () => ipcRenderer.invoke('layouts:get'),
  saveLayouts: (store) => ipcRenderer.invoke('layouts:save', store),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  listDisplays: () => ipcRenderer.invoke('displays:list'),
  disconnectPhone: () => ipcRenderer.invoke('phone:disconnect'),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  rtcSend: (msg) => ipcRenderer.send('rtc:send', msg),
  onRtc: (cb) => on('rtc', cb),
  onPhone: (cb) => on('phone', cb),
  onKey: (cb) => on('key', cb)
};

contextBridge.exposeInMainWorld('api', api);
