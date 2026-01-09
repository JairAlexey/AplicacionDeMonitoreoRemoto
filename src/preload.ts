import { contextBridge, ipcRenderer } from "electron";

const registry = {
  joinEvent: true,
  exitEvent: true,
  startProxy: true,
  stopProxy: true,
  isProxySetup: true,
  unsetProxySettings: true,
  startMonitoring: true,
  stopMonitoring: true,
  captureDesktop: true,
  getScreenInfo: true,
  startCaptureInterval: true,
  stopCaptureInterval: true,
  uploadMedia: true,
  verifyEventKey: true,
  registerConsent: true,
  minimizeWindow: true,
  appReady: true,
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

// Event listeners para eventos del proceso principal
const onAppClosing = (callback: () => void) => {
  ipcRenderer.on('app-closing', callback);
};

const onProxyTampering = (callback: (data: any) => void) => {
  ipcRenderer.on('proxy-tampering', (_event, data) => callback(data));
};

const removeProxyTamperingListener = () => {
  ipcRenderer.removeAllListeners('proxy-tampering');
};

contextBridge.exposeInMainWorld("api", {
  ...handlersMappedToIpcRenderer,
  onAppClosing,
  onProxyTampering,
  removeProxyTamperingListener,
});
