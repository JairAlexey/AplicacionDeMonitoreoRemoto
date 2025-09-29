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

  const winWidth = 230;
  const winHeight = 230;
  const margin = 25;

  const mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    resizable: false,
    frame: false,
    movable: false,
    alwaysOnTop: true,
    x: width - winWidth - margin,
    y: height - winHeight - margin,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  mainWindow.removeMenu();

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  // mainWindow.webContents.openDevTools({
  //   activate: false,
  //   mode: "detach",
  // });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
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

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

Object.entries(callbacks).forEach(([functionName, functionHandler]) => {
  ipcMain.handle(functionName, async (event, ...args: unknown[]) => {
    args.push(event);
    return await (
      functionHandler as unknown as (...args: unknown[]) => unknown
    )(...args);
  });
});
