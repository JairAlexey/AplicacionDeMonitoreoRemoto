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

  const mainWindow = new BrowserWindow({
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
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  
  // Mostrar ventana solo cuando React notifique que está listo
  ipcMain.handle('appReady', () => {
    if (!mainWindow.isDestroyed()) {
      // Pequeño delay para asegurar que el render está completo
      setTimeout(() => {
        mainWindow.show();
        mainWindow.focus();
      }, 100);
    }
  });
  
  // Quitar la barra de menú
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();
  // mainWindow.webContents.openDevTools({
  //   activate: false,
  //   mode: "detach",
  // });

  // Manejar el cierre de ventana
  let isClosing = false;
  mainWindow.on('close', async (e) => {
    if (!isClosing && !mainWindow.isDestroyed()) {
      e.preventDefault();
      isClosing = true;
      
      console.log('[MAIN] Ventana cerrando - ejecutando cleanup');
      
      // Ejecutar cleanup inmediatamente
      await globalCleanup();
      
      // Cerrar la ventana
      if (!mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
    }
  });
};
app.on("ready", () => {
  createWindow();
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
  e.preventDefault();
  console.log('[MAIN] before-quit - ejecutando cleanup');
  
  await globalCleanup();
  
  // Pequeña espera para requests HTTP
  await new Promise(resolve => setTimeout(resolve, 500));
  
  app.exit(0);
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