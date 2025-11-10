import { contextBridge, ipcRenderer } from "electron";

type CallbackRegistry = Record<keyof typeof window.api, boolean>;

const registry: CallbackRegistry = {
  joinEvent: true,
  exitEvent: true,
  startProxy: true,
  stopProxy: true,
  isProxySetup: true,
  registerAllKeys: true,
  unregisterAllKeys: true,
  startMonitoring: true,
  stopMonitoring: true,
  captureDesktop: true,
  getScreenInfo: true,
  startCaptureInterval: true,
  stopCaptureInterval: true,
  uploadMedia: true,
  verifyEventKey: true,
};

const handlersMappedToIpcRenderer = Object.entries(registry)
  .filter(([, active]) => active)
  .reduce(
    (acc, [functionName]) => {
      acc[functionName as keyof typeof registry] = async (
        ...args: unknown[]
      ) => {
        return ipcRenderer.invoke(functionName, ...args);
      };
      return acc;
    },
    {} as Record<
      keyof typeof registry,
      (...args: unknown[]) => Promise<unknown>
    >,
  );

contextBridge.exposeInMainWorld("api", handlersMappedToIpcRenderer);
