import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  session,
} from "electron";
import path from "node:path";
import { callbacks, globalCleanup } from "./backend";
import { config } from "dotenv";
// Deshabilitar completamente el splash screen de Squirrel
import squirrelStartup from "electron-squirrel-startup";

config();

let mainWindow: BrowserWindow | null = null;
let shutdownInProgress = false;
const APP_CLOSING_TIMEOUT_MS = 15000;

const getActiveWindow = () => {
  const windowRef = mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (!windowRef || windowRef.isDestroyed()) {
    return null;
  }
  return windowRef;
};

const requestRendererStopRecording = async () => {
  if (!callbacks.getMonitoringStatus()) {
    return;
  }

  const windowRef = mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (!windowRef || windowRef.isDestroyed()) {
    return;
  }

  await new Promise<void>((resolve) => {
    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      resolve();
    }, APP_CLOSING_TIMEOUT_MS);

    ipcMain.once("app-closing-complete", () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      resolve();
    });

    windowRef.webContents.send("app-closing");
  });
};

const runShutdown = async (shouldExit: boolean) => {
  if (shutdownInProgress) {
    return;
  }

  shutdownInProgress = true;

  await requestRendererStopRecording();
  await globalCleanup();

  if (shouldExit) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    app.exit(0);
  }
};

// Si Squirrel está manejando eventos de instalación, salir inmediatamente
if (squirrelStartup) {
  app.quit();
}

const createWindow = () => {
  const { screen } = require("electron");

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const winWidth = 330;
  const winHeight = 390;
  const margin = 5;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    resizable: true, // Permite cambiar tamaño
    frame: false, // Muestra los botones de ventana (min, max, close)
    movable: true, // Permite mover la ventana
    alwaysOnTop: false, // Ya no forzamos que esté siempre encima
    x: width - winWidth - margin,
    y: height - winHeight - margin,
    icon: path.join(__dirname, "../renderer/main_window/assets/images/LogoAplicacion.ico"),
    backgroundColor: '#ffffff',
    show: false, // No mostrar hasta que esté cargado
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false, // Evita ralentización
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow!.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow!.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  
  // Mostrar ventana solo cuando React notifique que está listo
  ipcMain.handle('appReady', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Pequeño delay para asegurar que el render está completo
      setTimeout(() => {
        mainWindow?.show();
        mainWindow?.focus();
      }, 100);
    }
  });
  
  // Quitar la barra de menú
  mainWindow!.setMenuBarVisibility(false);
  mainWindow!.removeMenu();
  // mainWindow.webContents.openDevTools({
  //   activate: false,
  //   mode: "detach",
  // });

  // Manejar el cierre de ventana
  let isClosing = false;
  mainWindow!.on('close', async (e) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    e.preventDefault();
    if (isClosing) {
      return;
    }

    isClosing = true;

    console.log('[MAIN] Ventana cerrando - ejecutando cleanup');

    await runShutdown(false);

    // Cerrar la ventana
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
    }
  });
};
app.on("ready", () => {
  createWindow();
  void callbacks.initMediaQueue();
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen"] })
        .then(async (sources) => {
          callback({ video: sources[0]! });
        });
    },
    { useSystemPicker: true },
  );
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      const allowedPermissions = ["media", "audioCapture", "videoCapture"];
      callback(allowedPermissions.includes(permission));
    },
  );
});

// Evento before-quit como respaldo (por si close no se ejecuta)
app.on('before-quit', async (e) => {
  if (shutdownInProgress) {
    return;
  }

  e.preventDefault();
  console.log('[MAIN] before-quit - ejecutando cleanup');
  
  await runShutdown(true);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

process.on("SIGINT", async () => {
  await runShutdown(true);
});

process.on("SIGTERM", async () => {
  await runShutdown(true);
});

process.on("uncaughtException", async (error) => {
  console.error("[MAIN] uncaughtException:", error);
  await runShutdown(true);
});

process.on("unhandledRejection", async (error) => {
  console.error("[MAIN] unhandledRejection:", error);
  await runShutdown(true);
});

ipcMain.handle("getAlwaysOnTop", () => {
  const windowRef = getActiveWindow();
  const alwaysOnTop = windowRef?.isAlwaysOnTop() ?? false;
  return { success: !!windowRef, alwaysOnTop };
});

ipcMain.handle("setAlwaysOnTop", (_event, enabled: boolean) => {
  const windowRef = getActiveWindow();
  if (!windowRef) {
    return { success: false, alwaysOnTop: false, error: "Window not available" };
  }

  windowRef.setAlwaysOnTop(Boolean(enabled), "floating");
  return { success: true, alwaysOnTop: windowRef.isAlwaysOnTop() };
});

// Registrar callbacks IPC
const callbackEntries = Object.entries(callbacks).filter(([name]) => name !== 'globalCleanup');
callbackEntries.forEach(([functionName, functionHandler]) => {
  ipcMain.handle(functionName, async (event, ...args: unknown[]) => {
    args.push(event);
    return await (
      functionHandler as unknown as (...args: unknown[]) => unknown
    )(...args);
  });
});
