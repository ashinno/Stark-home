import type { StarkApi } from '../../preload';

declare global {
  interface Window {
    stark: StarkApi;
  }
}

export {};
