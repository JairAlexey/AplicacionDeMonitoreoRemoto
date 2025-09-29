import * as callbacks from "./callbacks";

declare global {
  interface Window {
    api: typeof callbacks;
  }
}

export { callbacks };
