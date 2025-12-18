// Definiciones de tipos para la API expuesta por preload.ts
interface Window {
  api: {
    onProxyTampering: (callback: (data: any) => void) => void;
    removeProxyTamperingListener: () => void;
    onAppClosing: (callback: () => void) => void;
    verifyEventKey: (eventKey: string) => Promise<any>;
    joinEvent: (eventKey: string) => Promise<boolean>;
    exitEvent: () => Promise<void>;
    startProxy: () => Promise<boolean>;
    stopProxy: () => Promise<void>;
    isProxySetup: () => Promise<boolean>;
    getScreenInfo: () => Promise<any>;
    stopCaptureInterval: () => void;
    stopMonitoring: () => Promise<void>;
    startMonitoring: () => Promise<void>;
    startCaptureInterval: () => void;
    captureDesktop: () => Promise<void>;
    uploadMedia: (arrayBuffer: ArrayBuffer) => Promise<void>;
    appReady: () => void;
    unsetProxySettings: () => Promise<void>;
    minimizeWindow: () => Promise<void>;
  };
}
