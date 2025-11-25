import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  session,
} from "electron";
import path from "node:path";
import { callbacks } from "./backend";
import { config } from "dotenv";

config();

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
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
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
  
  // Quitar la barra de menú
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();
  // mainWindow.webContents.openDevTools({
  //   activate: false,
  //   mode: "detach",
  // });
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

Object.entries(callbacks).forEach(([functionName, functionHandler]) => {
  ipcMain.handle(functionName, async (event, ...args: unknown[]) => {
    args.push(event);
    return await (
      functionHandler as unknown as (...args: unknown[]) => unknown
    )(...args);
  });
});