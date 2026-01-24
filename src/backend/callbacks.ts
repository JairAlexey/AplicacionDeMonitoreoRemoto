import { nativeImage, desktopCapturer, screen, app, BrowserWindow } from "electron";
import { PROXY_SCRIPTS } from "./constants";
import { API_BASE_URL } from "./config";
import { execFile, execFileSync } from "child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import { EvalTechAPI } from "../frontend/api";
import { connectionManager } from "./connection-manager";
let eventKey: string = "";
let currentProxyPort: number | null = null;
let isMonitoringActive: boolean = false;
const MONITORING_STOPPED_CODE = "MONITORING_STOPPED";

type MediaQueueItem = {
  filePath: string;
  eventKey: string;
  size: number;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number | null;
};

const MEDIA_QUEUE_MAX_BYTES = 500 * 1024 * 1024;
const MEDIA_QUEUE_DIR_NAME = "media-queue";
const MEDIA_QUEUE_EXT = ".webm";

let mediaQueueInitialized = false;
let mediaQueue: MediaQueueItem[] = [];
let mediaQueueProcessing = false;
let mediaQueueRetryTimer: NodeJS.Timeout | null = null;
let mediaQueueCurrentPath: string | null = null;

const getMediaQueueDir = () => path.join(app.getPath("userData"), MEDIA_QUEUE_DIR_NAME);
const getMetadataPath = (filePath: string) => `${filePath}.json`;

const sortMediaQueue = () => {
  mediaQueue.sort((a, b) => a.createdAt - b.createdAt);
};

const safeUnlink = async (filePath: string) => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      console.warn(`[UPLOAD] Error deleting file ${filePath}:`, error);
    }
  }
};

const safeUnlinkMetadata = async (filePath: string) => {
  await safeUnlink(getMetadataPath(filePath));
};

const enqueueExistingMediaFiles = async () => {
  if (mediaQueueInitialized) {
    return;
  }

  try {
    await fs.mkdir(getMediaQueueDir(), { recursive: true });
    const entries = await fs.readdir(getMediaQueueDir());
    const items: MediaQueueItem[] = [];

    for (const entry of entries) {
      if (!entry.endsWith(MEDIA_QUEUE_EXT)) {
        continue;
      }

      const filePath = path.join(getMediaQueueDir(), entry);
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
          continue;
        }
        let queuedEventKey = "";
        try {
          const metadataRaw = await fs.readFile(getMetadataPath(filePath), "utf8");
          const metadata = JSON.parse(metadataRaw);
          if (metadata && typeof metadata.eventKey === "string") {
            queuedEventKey = metadata.eventKey;
          }
        } catch (error) {
          // metadata optional for backward compatibility
        }
        if (!queuedEventKey) {
          console.warn(
            `[UPLOAD] Missing event key for queued file ${path.basename(filePath)}; deleting`,
          );
          await safeUnlink(filePath);
          await safeUnlinkMetadata(filePath);
          continue;
        }
        items.push({
          filePath,
          eventKey: queuedEventKey,
          size: stat.size,
          createdAt: stat.mtimeMs,
          attempts: 0,
          nextAttemptAt: null,
        });
      } catch (error) {
        console.warn(`[UPLOAD] Error reading queued file ${filePath}:`, error);
      }
    }

    mediaQueue = items;
    sortMediaQueue();
  } catch (error) {
    console.error("[UPLOAD] Error initializing media queue:", error);
  } finally {
    mediaQueueInitialized = true;
  }
};

const enforceMediaQueueLimit = async () => {
  if (!mediaQueueInitialized) {
    return;
  }

  sortMediaQueue();
  let totalBytes = mediaQueue.reduce((sum, item) => sum + item.size, 0);

  if (totalBytes <= MEDIA_QUEUE_MAX_BYTES) {
    return;
  }

  let index = 0;
  while (totalBytes > MEDIA_QUEUE_MAX_BYTES && mediaQueue.length > 0) {
    if (index >= mediaQueue.length) {
      break;
    }

    const item = mediaQueue[index];
    if (item.filePath === mediaQueueCurrentPath) {
      index += 1;
      continue;
    }

    console.warn(
      `[UPLOAD] Queue over ${MEDIA_QUEUE_MAX_BYTES} bytes. Removing oldest segment ${path.basename(item.filePath)}`,
    );
    await safeUnlink(item.filePath);
    await safeUnlinkMetadata(item.filePath);
    totalBytes -= item.size;
    mediaQueue.splice(index, 1);
  }
};

const getBackoffDelayMs = (attempts: number) => {
  const exponent = Math.min(attempts, 6);
  return Math.min(60000, 1000 * Math.pow(2, exponent));
};

const scheduleMediaQueueRetry = (delayMs: number) => {
  if (mediaQueueRetryTimer) {
    clearTimeout(mediaQueueRetryTimer);
  }

  mediaQueueRetryTimer = setTimeout(() => {
    mediaQueueRetryTimer = null;
    void processMediaQueue();
  }, delayMs);
};

const dropAllQueuedMedia = async (reason: string) => {
  console.warn(`[UPLOAD] Clearing media queue: ${reason}`);
  const items = mediaQueue;
  mediaQueue = [];
  for (const item of items) {
    await safeUnlink(item.filePath);
    await safeUnlinkMetadata(item.filePath);
  }
};

const ensureMediaQueueReady = async () => {
  await enqueueExistingMediaFiles();
  await enforceMediaQueueLimit();
  void processMediaQueue();
};

const generateMediaFilename = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const nonce = Math.random().toString(36).slice(2, 8);
  return `recording_${timestamp}_${nonce}${MEDIA_QUEUE_EXT}`;
};

async function enqueueMediaSegment(buffer: Buffer) {
  await ensureMediaQueueReady();

  if (!eventKey) {
    throw new Error("No event key");
  }

  const filename = generateMediaFilename();
  const filePath = path.join(getMediaQueueDir(), filename);

  await fs.writeFile(filePath, buffer);
  await fs.writeFile(
    getMetadataPath(filePath),
    JSON.stringify({ eventKey, createdAt: Date.now(), size: buffer.length }),
    "utf8",
  );

  const item: MediaQueueItem = {
    filePath,
    eventKey,
    size: buffer.length,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: null,
  };

  mediaQueue.push(item);
  sortMediaQueue();
  await enforceMediaQueueLimit();
  void processMediaQueue();
}

export const initMediaQueue = async () => {
  await ensureMediaQueueReady();
};

// Variables de control para evitar ejecuciones duplicadas
let isCleaningUp: boolean = false;
let isStoppingProxy: boolean = false;
let isExitingEvent: boolean = false;
let isUnsettingProxy: boolean = false;

// Helper para obtener el estado de monitoreo
export const getMonitoringStatus = (): boolean => isMonitoringActive;

const createMonitoringStoppedError = () => {
  const error = new Error("Monitoring stopped by server");
  (error as { code?: string }).code = MONITORING_STOPPED_CODE;
  return error;
};

const isMonitoringStoppedError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: string }).code === MONITORING_STOPPED_CODE;
};

const notifyMonitoringStopped = (message: string) => {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) {
    return;
  }
  windows[0].webContents.send("monitoring-stopped", {
    reason: "monitoring_not_started",
    message,
  });
};

const handleMonitoringNotStarted = (
  status: number,
  errorText: string,
  context: string,
): boolean => {
  if (status !== 403) return false;

  const normalized = (errorText || "").toLowerCase();
  if (!normalized.includes("monitoring not started")) return false;

  if (isMonitoringActive) {
    console.warn(
      `[MONITORING] ${context}: server reports monitoring not started. Stopping local capture.`,
    );
    isMonitoringActive = false;
    connectionManager.updateProxyConfig({ isMonitoring: false });
    stopCaptureInterval();
    notifyMonitoringStopped("Monitoring stopped by server");
  }

  return true;
};

// Función global de cleanup - ejecuta durante el cierre de la app
export const globalCleanup = async () => {
  // Evitar ejecuciones duplicadas
  if (isCleaningUp) {
    console.log("[CLEANUP] Ya en progreso, evitando duplicacion");
    return;
  }
  
  isCleaningUp = true;
  console.log("[CLEANUP] Iniciando cleanup global");
  try {
    // Detener capturas de pantalla
    stopCaptureInterval();
    
    // Detener monitoreo si está activo
    if (isMonitoringActive && eventKey) {
      console.log("[CLEANUP] Deteniendo monitoreo");
      await stopMonitoring();
    }
    
    // Detener proxy
    if (currentProxyPort || connectionManager.isConnected()) {
      console.log("[CLEANUP] Deteniendo proxy");
      await stopProxy();
    }
    
    // CRÍTICO: Desactivar proxy del sistema como medida de seguridad
    console.log("[CLEANUP] Desactivando proxy del sistema");
    const success = await disableSystemProxy();
    if (success) {
      console.log("[CLEANUP] Proxy del sistema desactivado correctamente");
    } else {
      console.warn("[CLEANUP] Fallo desactivacion del proxy del sistema");
    }
    
    console.log("[CLEANUP] Completado exitosamente");
  } catch (error) {
    console.error("[CLEANUP] Error:", error);
    // Última oportunidad para limpiar proxy
    try {
      console.log("[CLEANUP] Intentando limpieza final del proxy...");
      await disableSystemProxy();
    } catch (finalError) {
      console.error("[CLEANUP] Fallo limpieza final:", finalError);
    }
  } finally {
    isCleaningUp = false;
  }
};

//*************** SYSTEM PROXY FUNCTIONS ***************
export const disableSystemProxy = async (): Promise<boolean> => {
  console.log('🛠️ Desactivando proxy del sistema...');
  
  try {
    if (process.platform === 'win32') {
      // Windows: Desactivar proxy usando registro de Windows (metodo mas confiable)
      let success = false;
      
      try {
        // Metodo principal: Registro de Windows
        const registryCommand = '$regKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"; ' +
          'Set-ItemProperty -Path $regKey -Name ProxyEnable -Value 0; ' +
          'Remove-ItemProperty -Path $regKey -Name ProxyServer -ErrorAction SilentlyContinue; ' +
          'Write-Host "Proxy desactivado via registro"';
        
        execFileSync('powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-Command', registryCommand
        ], { windowsHide: true, timeout: 3000 });
        
        success = true;
        console.log('✅ Proxy desactivado via registro de Windows');
      } catch (regError) {
        console.warn(`⚠️ Error en registro: ${regError instanceof Error ? regError.message : regError}`);
      }
      
      try {
        // Método alternativo: netsh winhttp (no crítico si falla)
        execFileSync('netsh', ['winhttp', 'reset', 'proxy'], { 
          windowsHide: true, 
          timeout: 2000 
        });
        console.log('✅ WinHTTP proxy reset exitoso');
      } catch (netshError) {
        console.warn(`⚠️ WinHTTP reset fallo (no critico): ${netshError instanceof Error ? netshError.message : netshError}`);
      }
      
      try {
        // Cerrar procesos de navegador para aplicar cambios
        execFileSync('taskkill', ['/f', '/im', 'iexplore.exe'], { 
          windowsHide: true, 
          timeout: 1000 
        });
      } catch (killError) {
        // No critico si no hay procesos para cerrar
      }
      
      if (success) {
        console.log('✅ Proxy del sistema desactivado en Windows');
        return true;
      } else {
        console.warn('⚠️ No se pudo desactivar completamente el proxy');
        return false;
      }
      
    } else if (process.platform === 'darwin') {
      // macOS: Desactivar proxy usando networksetup
      const interfaces = ['Wi-Fi', 'Ethernet', 'Thunderbolt Ethernet'];
      
      for (const iface of interfaces) {
        try {
          execFileSync('networksetup', ['-setautoproxystate', iface, 'off'], { timeout: 3000 });
          execFileSync('networksetup', ['-setproxybypassdomains', iface, ''], { timeout: 3000 });
        } catch (ifaceError) {
          // No es crítico si falla para una interfaz específica
        }
      }
      
      console.log('✅ Proxy del sistema desactivado en macOS');
      return true;
      
    } else {
      console.log('ℹ️ Desactivacion de proxy no implementada para Linux');
      return true;
    }
    
  } catch (error) {
    console.error('❌ Error desactivando proxy del sistema:', error);
    return false;
  }
};

//*************** PROXY FUNCTIONS ***************
export const startProxy = async () => {
  try {
    if (!eventKey) throw new Error("No event key");

    const localPort = await connectionManager.connect(eventKey);
    currentProxyPort = localPort; // Always 8888

    return true;
  } catch (error) {
    console.error("Proxy connection failed:", error);
    throw error;
  }
};

export const stopProxy = async () => {
  // Evitar ejecuciones duplicadas con timeout de seguridad
  if (isStoppingProxy) {
    console.log('🛑 Detencion de proxy ya en progreso, evitando duplicacion');
    return;
  }
  
  isStoppingProxy = true;
  
  // Timeout de seguridad reducido para respuesta más rápida
  const safetyTimeout = setTimeout(() => {
    console.warn('⚠️ Timeout de seguridad: liberando lock de stopProxy');
    isStoppingProxy = false;
  }, 3000); // 3 segundos (reducido de 10)
  
  try {
    console.log('Deteniendo proxy...');
    
    // 1. Desconectar connection manager con timeout
    await Promise.race([
      connectionManager.disconnect(),
      new Promise((resolve) => setTimeout(resolve, 2000))
    ]);
    
    // 2. Limpiar estado local inmediatamente
    currentProxyPort = null;
    
    console.log('✅ Proxy limpiado exitosamente');
    
  } catch (error) {
    console.error('❌ Error deteniendo proxy:', error);
    
    // Limpieza de emergencia rápida
    try {
      console.log('🔧 Limpieza de emergencia del proxy...');
      await Promise.race([
        disableSystemProxy(),
        new Promise((resolve) => setTimeout(resolve, 1000))
      ]);
    } catch (emergencyError) {
      console.error('❌ Fallo limpieza de emergencia:', emergencyError);
    }
  } finally {
    clearTimeout(safetyTimeout);
    isStoppingProxy = false;
  }
};

export const startMonitoring = async () => {
  try {
    if (!eventKey) throw new Error('No event key');
    
    // VALIDACIÓN: Verificar que el proxy esté activo y configurado correctamente
    const proxyActive = await isProxySetup();
    if (!proxyActive) {
      console.error('No se puede iniciar monitoreo: Proxy no esta configurado');
      return false;
    }
    
    // Verificar que el proxy local esté conectado
    if (!connectionManager.isConnected()) {
      console.error('No se puede iniciar monitoreo: Proxy local no esta conectado');
      return false;
    }
    
    const res = await fetch(`${API_BASE_URL}/proxy/start-monitoring/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${eventKey}`,
      },
    });
    
    if (res.ok) {
      isMonitoringActive = true;
      // Actualiza el proxy local para que valide URLs solo si está monitoreando
      connectionManager.updateProxyConfig({ isMonitoring: true });
      console.log('Monitoreo iniciado - estado guardado');
    } else {
      console.error('Error del servidor al iniciar monitoreo');
    }
    
    return res.ok;
  } catch (error) {
    console.error('startMonitoring error:', error);
    return false;
  }
};

export const stopMonitoring = async () => {
  try {
    if (!eventKey) throw new Error('No event key');
    
    // Timeout agresivo: 5 segundos máximo para toda la operación
    const stopWithTimeout = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        const res = await fetch(`${API_BASE_URL}/proxy/stop-monitoring/`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${eventKey}`,
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (res.ok) {
          console.log('✅ Monitoreo detenido en backend');
          return true;
        } else if (res.status >= 400 && res.status < 500) {
          console.warn(`⚠️ Stop monitoring: client error ${res.status}`);
          return false;
        }
        return false;
      } catch (e) {
        clearTimeout(timeoutId);
        if (e instanceof Error && e.name === 'AbortError') {
          console.warn('⏱️ Timeout deteniendo monitoreo en backend');
        } else {
          console.warn('⚠️ Error deteniendo monitoreo:', e);
        }
        return false;
      }
    };
    
    // Intentar detener en backend (1 solo intento con timeout)
    await stopWithTimeout();
    
    // SIEMPRE actualizar estado local inmediatamente
    isMonitoringActive = false;
    connectionManager.updateProxyConfig({ isMonitoring: false });
    console.log('✅ Monitoreo detenido localmente');
    
    return true;
  } catch (error) {
    console.error('❌ stopMonitoring error:', error);
    // Forzar estado local a false de todas formas
    isMonitoringActive = false;
    try {
      connectionManager.updateProxyConfig({ isMonitoring: false });
    } catch {}
    return false;
  }
};

let isHandlingTampering = false;

/**
 * Maneja la detección de manipulación del proxy
 * Pausa automáticamente el monitoreo y notifica al servidor
 * SOLO si el monitoreo está activo
 */
export const handleProxyTampering = async (reason: string) => {
  // console.error('MANIPULACION DEL PROXY DETECTADA:', reason);
  
  // ⚠️ IMPORTANTE: Solo actuar si el monitoreo está activo y no se está manejando ya
  if (!isMonitoringActive || isHandlingTampering) {
    // console.log('Proxy manipulado pero monitoreo no esta activo o ya se esta manejando - ignorando');
    return;
  }
  
  isHandlingTampering = true;
  
  try {
    console.warn('DETENIENDO MONITOREO - Manipulacion del proxy detectada');
    
    // Notificar al servidor sobre la manipulación ANTES de detener el monitoreo
    if (eventKey) {
      try {
        // Usar endpoint de logs de HTTP request como fallback si no existe endpoint específico de tampering
        // O crear un log de tipo "security_alert"
        await fetch(`${API_BASE_URL}/events/api/logging/http-request`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${eventKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            uri: `${reason}`,
            type: 'proxy',
            method: 'ALERT',
            timestamp: new Date().toISOString(),
            status_code: 403,
            response_time: 0,
            error: `${reason}`
          })
        });
        console.log('Manipulacion reportada al servidor');
      } catch (error) {
        console.error('Error reportando manipulacion:', error);
      }
    }

    // Emitir evento para que el frontend muestre advertencia
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send('proxy-tampering', {
        reason,
        timestamp: new Date().toISOString()
      });
    }

    // Esperar un momento para que el frontend reciba el evento y suba el video
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Detener capturas
    stopCaptureInterval();
    
    // Detener monitoreo en el servidor
    await stopMonitoring();
    
    // Forzar actualización de estado
    isMonitoringActive = false;
    
  } catch (error) {
    console.error('Error manejando manipulacion del proxy:', error);
  } finally {
    isHandlingTampering = false;
  }
};

export const isProxySetup = async (): Promise<boolean> => {
  // En modo HTTP-only, verificar puerto fijo 8888 del LocalProxyServer
  const localProxyPort = 8888;

  const scripts = PROXY_SCRIPTS(localProxyPort, 'localhost');

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
        // console.log(`Proxy status: ${isConnected}`);
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
      `${API_BASE_URL}${EvalTechAPI.verifyKey}`,
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
      consentRequired: data.consentRequired,
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

export const registerConsent = async (_eventKey: string) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/events/api/consent/register`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${_eventKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accepted: true,
          consent_version: 'v1.0'
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Error registrando consentimiento:', errorData);
      return {
        success: false,
        error: errorData.error || 'Error al registrar el consentimiento'
      };
    }

    const data = await response.json();
    console.log('Consentimiento registrado exitosamente:', data);
    return {
      success: true,
      consent: data.consent
    };
  } catch (error) {
    console.error('Error de conexión al registrar consentimiento:', error);
    return {
      success: false,
      error: 'Error de conexión con el servidor'
    };
  }
};

export const joinEvent = async (_eventKey: string) => {
  const verification = await verifyEventKey(_eventKey);
  if (verification.isValid && verification.dateIsValid) {
    eventKey = _eventKey;
    await ensureMediaQueueReady();
    return true;
  }
  return false;
};

export const exitEvent = async () => {
  // Evitar ejecuciones duplicadas
  if (isExitingEvent) {
    console.log('Salida de evento ya en progreso, evitando duplicacion');
    return;
  }
  
  isExitingEvent = true;
  
  try {
    console.log('Saliendo del evento...');
    
    // 1. Detener monitoreo si está activo
    if (isMonitoringActive) {
      console.log('Deteniendo monitoreo antes de salir...');
      await stopMonitoring();
    }
    
    // 2. Detener y desconectar proxy completamente
    if (currentProxyPort || connectionManager.isConnected()) {
      console.log('Desconectando proxy antes de salir...');
      await stopProxy();
    }
    
    // 3. CRÍTICO: Limpiar configuración del sistema como medida de seguridad
    console.log('Limpiando configuracion de proxy del sistema...');
    const success = await disableSystemProxy();
    if (success) {
      console.log('Configuracion de proxy limpiada correctamente');
    } else {
      console.warn('Fallo la limpieza del proxy del sistema');
    }
    
    // 4. Limpiar variables globales
    eventKey = "";
    currentProxyPort = null;
    isMonitoringActive = false;
    
    console.log('Evento cerrado correctamente');
    
  } catch (error) {
    console.error('Error cerrando evento:', error);
    
    // Aunque haya error, intentar limpiar proxy como último recurso
    try {
      console.log('Intentando limpieza de emergencia del proxy...');
      await disableSystemProxy();
    } catch (emergencyError) {
      console.error('Fallo limpieza de emergencia:', emergencyError);
    }
  } finally {
    isExitingEvent = false;
    // Siempre salir de la aplicacion
    app.quit();
  }
};

//*************** WINDOW CONTROL FUNCTIONS ***************
export const minimizeWindow = () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    window.minimize();
  }
};

//*************** DESKTOP CAPTURE FUNCTIONS ***************
type PresignedUploadResponse = {
  upload_url: string;
  s3_key: string;
  headers: Record<string, string>;
};

const PRESIGN_TIMEOUT_MS = 10000;
const PRESIGN_LOG_INTERVAL_MS = 5000;
const PRESIGN_MAX_ATTEMPTS = 2;
const UPLOAD_LOG_INTERVAL_MS = 10000;
const UPLOAD_MAX_ATTEMPTS = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs: number,
  logIntervalMs: number | null,
  logLabel: string,
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let logTimer: NodeJS.Timeout | null = null;
  let elapsedMs = 0;

  if (logIntervalMs && logIntervalMs > 0) {
    logTimer = setInterval(() => {
      elapsedMs += logIntervalMs;
      console.log(`[UPLOAD] ${logLabel} (${Math.round(elapsedMs / 1000)}s)`);
    }, logIntervalMs);
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${logLabel} timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (logTimer) {
      clearInterval(logTimer);
    }
  }
};

const withRetry = async <T>(
  label: string,
  attempts: number,
  fn: () => Promise<T>,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      if (attempt > 1) {
        console.warn(`[UPLOAD] ${label} retry ${attempt}/${attempts}`);
      }
      return await fn();
  } catch (error) {
      if (isMonitoringStoppedError(error)) {
        throw error;
      }
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[UPLOAD] ${label} failed (${attempt}/${attempts}): ${message}`);
      if (attempt < attempts) {
        await sleep(1000 * attempt);
      }
    }
  }
  throw lastError;
};

const requestPresignedUpload = async (
  endpoint: string,
  payload: Record<string, unknown> = {},
  overrideEventKey?: string,
): Promise<PresignedUploadResponse> => {
  const authEventKey = overrideEventKey || eventKey;
  if (!authEventKey) {
    throw new Error("No event key");
  }

  return withRetry("Presign", PRESIGN_MAX_ATTEMPTS, async () => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}${endpoint}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authEventKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      PRESIGN_TIMEOUT_MS,
      PRESIGN_LOG_INTERVAL_MS,
      "Esperando presign",
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      if (
        handleMonitoringNotStarted(
          response.status,
          errorText,
          `presign ${endpoint}`,
        )
      ) {
        throw createMonitoringStoppedError();
      }
      throw new Error(`Presign failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as Partial<PresignedUploadResponse>;
    if (!data.upload_url || !data.s3_key || !data.headers) {
      throw new Error("Presign response missing required fields");
    }

    return {
      upload_url: data.upload_url,
      s3_key: data.s3_key,
      headers: data.headers as Record<string, string>,
    };
  });
};

const uploadWithPresignedUrl = async (
  uploadUrl: string,
  blob: Blob,
  headers: Record<string, string>,
) => {
  const uploadTimeoutMs = Math.max(
    30000,
    Math.min(120000, Math.round((blob.size / (1024 * 1024)) * 1000)),
  );

  await withRetry("S3 upload", UPLOAD_MAX_ATTEMPTS, async () => {
    const response = await fetchWithTimeout(
      uploadUrl,
      {
        method: "PUT",
        headers,
        body: blob,
      },
      uploadTimeoutMs,
      UPLOAD_LOG_INTERVAL_MS,
      "Subiendo a S3",
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`S3 upload failed: ${response.status} - ${errorText}`);
    }
  });
};

const logScreenCapture = async (s3Key: string, monitorName: string) => {
  const response = await fetch(`${API_BASE_URL}${EvalTechAPI.screenCapture}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${eventKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      s3_key: s3Key,
      monitor_name: monitorName,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    if (
      handleMonitoringNotStarted(
        response.status,
        errorText,
        "log screen capture",
      )
    ) {
      throw createMonitoringStoppedError();
    }
    throw new Error(`Log screenshot failed: ${response.status} - ${errorText}`);
  }
};

const logMediaCapture = async (s3Key: string, overrideEventKey?: string) => {
  const authEventKey = overrideEventKey || eventKey;
  if (!authEventKey) {
    throw new Error("No event key");
  }
  const response = await fetch(`${API_BASE_URL}${EvalTechAPI.mediaCapture}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authEventKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      s3_key: s3Key,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    if (
      handleMonitoringNotStarted(
        response.status,
        errorText,
        "log media capture",
      )
    ) {
      throw createMonitoringStoppedError();
    }
    throw new Error(`Log media failed: ${response.status} - ${errorText}`);
  }
};

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

    // Usar Promise.allSettled para que si falla una pantalla, las otras sigan funcionando
    const results = await Promise.allSettled(sources.map(async (source, index) => {
      if (!source) return;
      
      const screenSource = source;
      
      // Renombrar monitores para que sean más amigables (Screen 1, Screen 2, etc.)
      let friendlyName = screenSource.name;
      // Siempre usar Screen X para consistencia si detectamos nombres genéricos
      if (friendlyName.toLowerCase().includes("screen") || 
          friendlyName.toLowerCase().includes("pantalla") || 
          friendlyName.toLowerCase().includes("display") ||
          friendlyName === "Entire Screen") {
         friendlyName = `Screen ${index + 1}`;
      }
      
      // console.log(`Capturing screen: ${friendlyName}`);

      const image = nativeImage.createFromDataURL(
        screenSource.thumbnail.toDataURL(),
      );

      const buffer = image.toJPEG(80);
      const blob = new Blob([buffer], { type: "image/jpeg" });
      const filename = "screenshot.jpg";

      let presignData: PresignedUploadResponse | null = null;
      try {
        presignData = await requestPresignedUpload(EvalTechAPI.screenPresign);
      } catch (error) {
        if (!isMonitoringStoppedError(error)) {
          console.warn(
            "[SCREEN] Presign failed, falling back to backend upload:",
            error,
          );
        }
      }

      if (presignData) {
        try {
          await uploadWithPresignedUrl(
            presignData.upload_url,
            blob,
            presignData.headers,
          );
        } catch (error) {
          console.warn(
            "[SCREEN] S3 upload failed, falling back to backend upload:",
            error,
          );
          presignData = null;
        }
      }

      if (presignData) {
        try {
          await logScreenCapture(presignData.s3_key, friendlyName);
        } catch (error) {
          if (isMonitoringStoppedError(error)) {
            return;
          }
          throw error;
        }
        return;
      }

      const formData = new FormData();
      formData.append("screenshot", blob, filename);
      formData.append("monitor_name", friendlyName);

      const response = await fetch(
        `${API_BASE_URL}${EvalTechAPI.screenCapture}`,
        {
          method: "POST",
          body: formData,
          headers: {
            Authorization: `Bearer ${eventKey}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (
          handleMonitoringNotStarted(
            response.status,
            errorText,
            "screen upload",
          )
        ) {
          return;
        }
        throw new Error(
          `API error: ${response.status} - ${errorText || response.statusText}`,
        );
      }
    }));
    
    // Loguear errores si los hubo
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Error capturing screen ${index + 1}:`, result.reason);
      }
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

async function uploadQueuedMediaFile(filePath: string, queuedEventKey: string) {
  if (!queuedEventKey) {
    throw new Error("No event key");
  }

  const buffer = await fs.readFile(filePath);
  const blob = new Blob([buffer], { type: "video/webm" });
  const filename = path.basename(filePath);

  let presignData: PresignedUploadResponse | null = null;
  try {
    presignData = await requestPresignedUpload(
      EvalTechAPI.mediaPresign,
      { media_type: "video" },
      queuedEventKey,
    );
  } catch (error) {
    if (isMonitoringStoppedError(error)) {
      throw error;
    }
    console.warn(
      "[UPLOAD] Presign failed, falling back to backend upload:",
      error,
    );
  }

  if (presignData) {
    try {
      await uploadWithPresignedUrl(
        presignData.upload_url,
        blob,
        presignData.headers,
      );
    } catch (error) {
      console.warn(
        "[UPLOAD] S3 upload failed, falling back to backend upload:",
        error,
      );
      presignData = null;
    }
  }

  if (presignData) {
    try {
      await logMediaCapture(presignData.s3_key, queuedEventKey);
    } catch (error) {
      if (isMonitoringStoppedError(error)) {
        throw error;
      }
      throw error;
    }
    console.log(
      `[UPLOAD] Video segment uploaded to S3: ${filename} (${(blob.size / 1024).toFixed(2)} KB)`,
    );
    return;
  }

  const formData = new FormData();
  formData.append("media", blob, filename);

  const response = await fetch(`${API_BASE_URL}${EvalTechAPI.mediaCapture}`, {
    method: "POST",
    body: formData,
    headers: {
      Authorization: `Bearer ${queuedEventKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (handleMonitoringNotStarted(response.status, errorText, "media upload")) {
      throw createMonitoringStoppedError();
    }
    throw new Error(`Upload failed: ${response.status} - ${errorText}`);
  }

  console.log(
    `[UPLOAD] Video segment sent: ${filename} (${(blob.size / 1024).toFixed(2)} KB)`,
  );
}

async function processMediaQueue() {
  if (mediaQueueProcessing) {
    return;
  }
  if (!mediaQueueInitialized) {
    return;
  }

  mediaQueueProcessing = true;
  try {
    while (mediaQueue.length > 0) {
      const item = mediaQueue[0];
      const now = Date.now();

      if (item.nextAttemptAt && item.nextAttemptAt > now) {
        scheduleMediaQueueRetry(item.nextAttemptAt - now);
        break;
      }

      try {
        mediaQueueCurrentPath = item.filePath;
        if (!item.eventKey) {
          console.warn(
            `[UPLOAD] Missing event key for queued file ${path.basename(item.filePath)}; discarding`,
          );
          await safeUnlink(item.filePath);
          await safeUnlinkMetadata(item.filePath);
          mediaQueue.shift();
          mediaQueueCurrentPath = null;
          continue;
        }
        await uploadQueuedMediaFile(item.filePath, item.eventKey);
        await safeUnlink(item.filePath);
        await safeUnlinkMetadata(item.filePath);
        mediaQueue.shift();
        mediaQueueCurrentPath = null;
      } catch (error) {
        mediaQueueCurrentPath = null;
        if (isMonitoringStoppedError(error)) {
          await dropAllQueuedMedia("monitoring stopped");
          break;
        }

        item.attempts += 1;
        const delayMs = getBackoffDelayMs(item.attempts);
        item.nextAttemptAt = Date.now() + delayMs;
        console.warn(
          `[UPLOAD] Upload failed for ${path.basename(item.filePath)}. Retry in ${Math.round(delayMs / 1000)}s`,
        );
        scheduleMediaQueueRetry(delayMs);
        break;
      }
    }
  } finally {
    mediaQueueProcessing = false;
  }
}

//*************** MEDIA FUNCTIONS ***************
export const uploadMedia = async (data: ArrayBuffer) => {
  try {
    console.log(
      `[UPLOAD] Encolando segmento de ${(data.byteLength / 1024).toFixed(2)} KB`,
    );
    const buffer = Buffer.from(data);
    await enqueueMediaSegment(buffer);
  } catch (error) {
    console.error("[UPLOAD] Error:", error);
    throw error; // Re-lanzar para que el caller lo maneje
  }
};

//*************** SIMPLE PROXY FUNCTIONS ***************
export const unsetProxySettings = async (): Promise<boolean> => {
  // Evitar ejecuciones duplicadas/múltiples
  if (isUnsettingProxy) {
    console.log('Desactivacion de proxy ya en progreso, evitando duplicacion');
    return false;
  }
  
  isUnsettingProxy = true;
  console.log('Desactivando configuracion de proxy usando script UNSET...');
  
  try {
    // 1. Detener solo el LocalProxyServer con timeout agresivo
    if (connectionManager && connectionManager.isConnected()) {
      console.log('Deteniendo LocalProxyServer...');
      try {
        await Promise.race([
          connectionManager.stopLocalServer(),
          new Promise(resolve => setTimeout(resolve, 1000)) // Solo esperar 1 segundo
        ]);
      } catch (error) {
        console.warn('Error o timeout deteniendo servidor, continuando...');
      }
    }
    
    // 2. Desactivar configuración del proxy en Windows
    if (process.platform === 'win32') {
      const scripts = PROXY_SCRIPTS(8888, 'localhost'); // Los parámetros no importan para UNSET
      const { execFileSync } = require('child_process');
      
      execFileSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command', scripts.UNSET_PROXY_SETTINGS
      ], { windowsHide: true, timeout: 3000 });
      
      console.log('Proxy desactivado correctamente usando UNSET_PROXY_SETTINGS');
    } else {
      console.log('UNSET_PROXY_SETTINGS solo implementado para Windows');
    }
    
    // 3. Limpiar estado local
    currentProxyPort = null;
    
    return true;
  } catch (error) {
    console.error('Error ejecutando UNSET_PROXY_SETTINGS:', error);
    return false;
  } finally {
    isUnsettingProxy = false;
  }
};


