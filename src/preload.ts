import { contextBridge, ipcRenderer } from "electron";

const registry = {
  joinEvent: true,
  exitEvent: true,
  startProxy: true,
  stopProxy: true,
  isProxySetup: true,
  startMonitoring: true,
  stopMonitoring: true,
  captureDesktop: true,
  getScreenInfo: true,
  startCaptureInterval: true,
  stopCaptureInterval: true,
  uploadMedia: true,
  verifyEventKey: true,
  minimizeWindow: true,
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

// onAppClosing no es un callback IPC normal, es un listener de eventos
const onAppClosing = (callback: () => void) => {
  ipcRenderer.on('app-closing', callback);
};

contextBridge.exposeInMainWorld("api", {
  ...handlersMappedToIpcRenderer,
  onAppClosing,
});
