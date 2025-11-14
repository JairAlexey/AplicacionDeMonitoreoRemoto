import { nativeImage, desktopCapturer, screen, app } from "electron";
import { SET_KEYLOGGER_SCRIPT, PROXY_SCRIPTS } from "./constants";
import { ChildProcess, execFile } from "child_process";
import { EvalTechAPI } from "../frontend/api";
import { connectionManager } from "./connection-manager";
let eventKey: string = "";
let currentProxyPort: number | null = null;

//*************** PROXY FUNCTIONS ***************
export const startProxy = async () => {
  try {
    if (!eventKey) throw new Error("No event key");

    const assignedPort = await connectionManager.connect(eventKey);
    currentProxyPort = assignedPort;

    return true;
  } catch (error) {
    console.error("Proxy connection failed:", error);
    throw error;
  }
};

export const stopProxy = async () => {
  await connectionManager.disconnect();
  currentProxyPort = null;
  const proxySetup = await isProxySetup();
  console.log(`Proxy setup status after stopping: ${proxySetup}`);
};

export const startMonitoring = async () => {
  try {
    if (!eventKey) throw new Error('No event key');
    const base = process.env['SIX_API_BASE_URL'] || 'http://127.0.0.1:8000';
    const res = await fetch(`${base}/proxy/start-monitoring/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${eventKey}`,
      },
    });
    return res.ok;
  } catch (error) {
    console.error('startMonitoring error:', error);
    return false;
  }
};

export const stopMonitoring = async () => {
  try {
    if (!eventKey) throw new Error('No event key');
    const base = process.env['SIX_API_BASE_URL'] || 'http://127.0.0.1:8000';
    const res = await fetch(`${base}/proxy/stop-monitoring/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${eventKey}`,
      },
    });
    return res.ok;
  } catch (error) {
    console.error('stopMonitoring error:', error);
    return false;
  }
};

export const isProxySetup = async (): Promise<boolean> => {
  if (!currentProxyPort) return false;

  const scripts = PROXY_SCRIPTS(currentProxyPort);

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        scripts.IS_PROXY_CONNECTED,
      ],
      (error, output) => {
        const isConnected = output?.toString().trim() === "true";
        console.log(`Proxy status: ${isConnected}`);
        resolve(isConnected);
        if (error) {
          console.error("Error ejecutando script:", error);
          resolve(false);
          return;
        }
      },
    );
  });
};

//*************** EVENT FUNCTIONS ***************
export const verifyEventKey = async (_eventKey: string) => {
  try {
    const response = await fetch(
      `${process.env["SIX_API_BASE_URL"] || "http://127.0.0.1:8000"}${EvalTechAPI.verifyKey}`,
      {
        headers: {
          Authorization: `Bearer ${_eventKey}`,
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { 
        isValid: false, 
        dateIsValid: false,
        error: errorData.error,
        specificError: errorData.specificError
      };
    }
    const data = await response.json();
    return {
      isValid: data.isValid,
      dateIsValid: data.dateIsValid,
      participant: data.participant,
      event: data.event,
      error: data.error,
      specificError: data.specificError
    };
  } catch (error) {
    return { 
      isValid: false, 
      dateIsValid: false,
      error: "Error de conexión con el servidor",
      specificError: false
    };
  }
};

export const joinEvent = async (_eventKey: string) => {
  const verification = await verifyEventKey(_eventKey);
  if (verification.isValid && verification.dateIsValid) {
    eventKey = _eventKey;
    return true;
  }
  return false;
};

export const exitEvent = async () => {
  app.quit();
};

//*************** KEYLOGGER FUNCTIONS ***************
export const registerAllKeys = async () => {
  KeyManager.getInstance().startKeylogger();
};

export const unregisterAllKeys = async () => {
  KeyManager.getInstance().stopKeylogger();
};

class KeyManager {
  private static instance: KeyManager;
  private keysPressed: string[] = [];
  private childProcess: ChildProcess | null = null;
  private sendInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public addKey(key: string) {
    this.keysPressed.push(key);
  }

  public static getInstance(): KeyManager {
    if (!KeyManager.instance) {
      KeyManager.instance = new KeyManager();
    }
    return KeyManager.instance;
  }

  public startKeylogger() {
    if (this.childProcess) return;

    this.childProcess = execFile("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      SET_KEYLOGGER_SCRIPT,
    ]);

    this.childProcess.stdout?.on("data", (data: Buffer) => {
      const keys = data.toString().trim();
      if (keys) {
        keys.split("\n").forEach((key) => {
          // Filter PowerShell job information lines
          if (
            !key.startsWith("Id     ") &&
            !key.startsWith("--     ") &&
            !key.includes("PSJobTypeName") &&
            !key.trim().match(/^\d+\s+PowerShell\.E/)
          ) {
            this.addKey(key);
            console.log("Key pressed:", key);
          }
        });
      }
    });

    this.childProcess.stderr?.on("data", (data: Buffer) => {
      console.error(`Keylogger error: ${data.toString()}`);
    });

    this.startSendingKeys();
    console.log("Key logging started.");
  }

  public stopKeylogger() {
    if (this.childProcess) {
      this.childProcess.kill();
      this.childProcess = null;
    }

    if (this.sendInterval) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }

    console.log("Key logging stopped.");
  }

  private startSendingKeys() {
    this.sendInterval = setInterval(() => {
      const keysToSend = [...this.keysPressed];
      this.keysPressed = [];
      if (keysToSend.length > 0) {
        console.log("Keys sent to API:", keysToSend);
        fetch(
          `${process.env["SIX_API_BASE_URL"] || "http://127.0.0.1:8000"}${EvalTechAPI.logBatchKeyPresses}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${eventKey}`,
            },
            body: JSON.stringify({ keys: keysToSend }),
          },
        ).catch((error) => {
          console.error(`Error sending keys to API: ${error}`);
        });
      }
    }, 10000);
  }
}

//*************** DESKTOP CAPTURE FUNCTIONS ***************
export const captureDesktop = async () => {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width,
        height,
      },
    });

    sources.forEach(async (source) => {
      if (!source) {
        console.error("No screen found.");
        return;
      }
      const screenSource = source;
      console.log(`Capturing screen: ${screenSource.name}`);

      const image = nativeImage.createFromDataURL(
        screenSource.thumbnail.toDataURL(),
      );

      const buffer = image.toPNG();

      const formData = new FormData();
      formData.append(
        "screenshot",
        new Blob([buffer], { type: "image/png" }),
        "screenshot.png",
      );

      const response = await fetch(
        `${process.env["SIX_API_BASE_URL"] || "http://127.0.0.1:8000"}${EvalTechAPI.screenCapture}`,
        {
          method: "POST",
          body: formData,
          headers: {
            Authorization: `Bearer ${eventKey}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      console.log("Screenshot sent successfully.");
    });
  } catch (error) {
    console.error(`Error capturing screen: ${error}`);
  }
};

export const getScreenInfo = async () => {
  try {
    const displays = screen.getAllDisplays();
    const displayCount = displays.length;
    const hasPermission = await desktopCapturer
      .getSources({ types: ["screen"] })
      .then(() => true)
      .catch(() => false);

    return {
      displayCount,
      hasPermission,
    };
  } catch (error) {
    console.error(`Error getting screen info: ${error}`);
    return {
      displayCount: 0,
      hasPermission: false,
    };
  }
};

class ScreenCaptureManager {
  private static instance: ScreenCaptureManager;
  private intervalId: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): ScreenCaptureManager {
    if (!ScreenCaptureManager.instance) {
      ScreenCaptureManager.instance = new ScreenCaptureManager();
    }
    return ScreenCaptureManager.instance;
  }

  public startCapture() {
    if (this.intervalId) {
      this.stopCapture();
    }
    this.intervalId = setInterval(async () => {
      await captureDesktop();
    }, 10000);
    console.log("Screen capture interval started.");
  }

  public stopCapture() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Screen capture interval stopped.");
    }
  }
}

export const startCaptureInterval = () => {
  ScreenCaptureManager.getInstance().startCapture();
};

export const stopCaptureInterval = () => {
  ScreenCaptureManager.getInstance().stopCapture();
};

//*************** MEDIA FUNCTIONS ***************
export const uploadMedia = async (data: ArrayBuffer) => {
  try {
    // Create Blob directly from ArrayBuffer
    const blob = new Blob([data], { type: "video/webm" });

    const formData = new FormData();
    formData.append("media", blob, "recording.webm");

    const response = await fetch(
      `${process.env["SIX_API_BASE_URL"] || "http://127.0.0.1:8000"}${EvalTechAPI.mediaCapture}`,
      {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${eventKey}`,
        },
      },
    );

    if (!response.ok) throw new Error("Error uploading media");
    console.log("Media sent successfully");
  } catch (error) {
    console.error("Error:", error);
  }
};
