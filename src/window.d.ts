// Definiciones de tipos para la API expuesta por preload.ts
interface Window {
  api: {
    onProxyTampering: (callback: (data: any) => void) => void;
    removeProxyTamperingListener: () => void;
    onMonitoringStopped: (callback: (data: any) => void) => void;
    removeMonitoringStoppedListener: () => void;
    onAppClosing: (callback: () => void) => void;
    removeAppClosingListener: () => void;
    notifyAppClosingComplete: () => void;
    verifyEventKey: (eventKey: string) => Promise<any>;
    registerConsent: (eventKey: string) => Promise<{ success: boolean; consent?: any; error?: string }>;
    joinEvent: (eventKey: string) => Promise<boolean>;
    exitEvent: () => Promise<void>;
    startProxy: () => Promise<boolean>;
    stopProxy: () => Promise<void>;
    isProxySetup: () => Promise<boolean>;
    getScreenInfo: () => Promise<any>;
    stopCaptureInterval: () => void;
    stopMonitoring: () => Promise<boolean>;
    startMonitoring: () => Promise<boolean>;
    startCaptureInterval: () => void;
    captureDesktop: () => Promise<void>;
    uploadMedia: (arrayBuffer: ArrayBuffer) => Promise<void>;
    appReady: () => void;
    unsetProxySettings: () => Promise<void>;
    minimizeWindow: () => Promise<void>;
    getAlwaysOnTop: () => Promise<{ success: boolean; alwaysOnTop: boolean }>;
    setAlwaysOnTop: (enabled: boolean) => Promise<{ success: boolean; alwaysOnTop: boolean; error?: string }>;
  };
}
