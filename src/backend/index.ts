import * as callbacks from "./callbacks";

declare global {
  interface Window {
    api: typeof callbacks & {
      onAppClosing: (callback: () => void) => void;
    };
  }
}

export { callbacks };
export { globalCleanup } from "./callbacks";
