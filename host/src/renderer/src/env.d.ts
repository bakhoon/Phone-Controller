import type { HostApi } from '../../preload/api';

declare global {
  interface Window {
    api: HostApi;
  }
}

export {};
